const Asset = require('../models/Asset');
const Department = require('../models/Department');
const { AppError } = require('../middleware/errorHandler');
const { CATEGORIES } = require('../config/constants');
const { registerAsset } = require('../services/lifecycleService');
const { logAction } = require('../services/audit/auditLogger');
const { assetScopeFilter, requireVisibleAsset } = require('../services/access/scope');
const { publicAsset } = require('../services/presenters');
const {
  escapeRegex,
  requireString,
  optionalString,
  requireObjectId,
  optionalObjectId,
  requireEnum,
  clampInt,
} = require('../utils/security');

const ASSET_ID_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;
const SORTABLE = ['createdAt', 'name', 'assetId', 'category', 'status', 'purchaseDate'];
const STATUSES = ['ACTIVE', 'MAINTENANCE', 'DISPOSED', 'TRANSFERRED'];

// Descriptive fields an administrator may edit directly. Ownership, department,
// status and identifiers can only change through lifecycle events.
const EDITABLE_FIELDS = ['name', 'category', 'brand', 'model', 'serialNumber', 'warranty', 'description', 'location', 'purchaseCost'];

function parseDate(value) {
  const date = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) throw new AppError('Invalid purchase date.', 400);
  if (date > new Date()) throw new AppError('Purchase date cannot be in the future.', 400);
  return date;
}

function parseCost(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new AppError('Purchase cost must be a number between 0 and 1,000,000,000.', 400);
  return n;
}

/**
 * Builds the asset query for the caller from the request query string. Shared by the list and the
 * export so both always apply the same filters and the same data scope.
 */
function buildAssetFilter(user, query) {
  const conditions = [];
  if (query.category) conditions.push({ category: requireEnum(query.category, CATEGORIES, 'category') });
  if (query.status) conditions.push({ status: requireEnum(query.status, STATUSES, 'status') });
  if (query.departmentId) conditions.push({ departmentId: requireObjectId(query.departmentId, 'departmentId') });
  if (typeof query.search === 'string' && query.search.trim()) {
    const pattern = new RegExp(escapeRegex(query.search.trim().slice(0, 100)), 'i');
    conditions.push({ $or: [{ assetId: pattern }, { name: pattern }, { serialNumber: pattern }, { dppId: pattern }] });
  }
  return { $and: [assetScopeFilter(user), ...conditions] };
}

// GET /api/assets?page=&limit=&search=&category=&status=&departmentId=&sortBy=&sortDir=
// Results are limited by the caller's data scope IN THE QUERY, not after fetching.
async function listAssets(req, res, next) {
  try {
    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 20 });

    const filter = buildAssetFilter(req.user, req.query);
    const sortField = SORTABLE.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
      Asset.find(filter).sort({ [sortField]: sortDir, _id: 1 }).skip((page - 1) * limit).limit(limit),
      Asset.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(publicAsset),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/assets/:id   (Mongo _id or assetId) — 404 when outside the caller's scope
async function getAsset(req, res, next) {
  try {
    const asset = await requireVisibleAsset(req.user, req.params.id);
    res.json({ success: true, data: publicAsset(asset) });
  } catch (err) {
    next(err);
  }
}

// POST /api/assets   (ADMIN — register)
async function createAsset(req, res, next) {
  try {
    const assetId = requireString(req.body.assetId, 'Asset ID', { max: 40 });
    if (!ASSET_ID_PATTERN.test(assetId)) throw new AppError('Asset ID may only contain letters, digits, dots, hyphens and underscores.', 400);

    const name = requireString(req.body.name, 'Asset name', { max: 160 });
    const category = requireEnum(req.body.category, CATEGORIES, 'Category');
    const purchaseDate = parseDate(req.body.purchaseDate);
    const serialNumber = optionalString(req.body.serialNumber, 'Serial number', 80) || undefined;
    const departmentId = optionalObjectId(req.body.departmentId, 'departmentId');

    let departmentName = '';
    if (departmentId) {
      const dept = await Department.findById(departmentId).lean();
      if (!dept) throw new AppError('Department not found.', 400);
      departmentName = dept.name;
    }

    if (await Asset.exists({ assetId })) throw new AppError(`Asset ID "${assetId}" already exists.`, 409);
    if (serialNumber && (await Asset.exists({ serialNumber }))) {
      throw new AppError(`Serial number "${serialNumber}" is already registered.`, 409);
    }

    const { asset, registrationEvent } = await registerAsset({
      actor: req.user,
      fields: {
        assetId,
        name,
        category,
        brand: optionalString(req.body.brand, 'Brand', 80) || '',
        model: optionalString(req.body.model, 'Model', 80) || '',
        serialNumber,
        purchaseDate,
        purchaseCost: parseCost(req.body.purchaseCost),
        warranty: optionalString(req.body.warranty, 'Warranty', 120) || '',
        description: optionalString(req.body.description, 'Description', 1000) || '',
        location: optionalString(req.body.location, 'Location', 120) || '',
        departmentId,
        department: departmentName,
        assignedTo: null,
        owner: '',
      },
    });

    await logAction({ user: req.user, action: 'ASSET_CREATED', entity: 'Asset', entityId: asset._id, assetId: asset.assetId, metadata: { dppId: asset.dppId }, ip: req.ip });

    res.status(201).json({ success: true, data: { asset: publicAsset(asset), registrationEvent } });
  } catch (err) {
    next(err);
  }
}

// PUT /api/assets/:id   (ADMIN) — descriptive fields only
async function updateAsset(req, res, next) {
  try {
    const asset = await requireVisibleAsset(req.user, req.params.id);
    if (asset.status === 'DISPOSED') throw new AppError('Disposed assets cannot be edited.', 409);

    const body = req.body || {};
    const rejected = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k));
    if (rejected.length) {
      throw new AppError(
        `These fields cannot be edited directly: ${rejected.join(', ')}. Ownership, department and status change through lifecycle events.`,
        400
      );
    }

    const changed = [];
    if (body.name !== undefined) {
      asset.name = requireString(body.name, 'Asset name', { max: 160 });
      changed.push('name');
    }
    if (body.category !== undefined) {
      asset.category = requireEnum(body.category, CATEGORIES, 'Category');
      changed.push('category');
    }
    for (const field of ['brand', 'model', 'warranty', 'location']) {
      if (body[field] !== undefined) {
        asset[field] = optionalString(body[field], field, 120) || '';
        changed.push(field);
      }
    }
    if (body.description !== undefined) {
      asset.description = optionalString(body.description, 'Description', 1000) || '';
      changed.push('description');
    }
    if (body.serialNumber !== undefined) {
      const serial = optionalString(body.serialNumber, 'Serial number', 80) || undefined;
      if (serial && (await Asset.exists({ serialNumber: serial, _id: { $ne: asset._id } }))) {
        throw new AppError(`Serial number "${serial}" is already registered.`, 409);
      }
      asset.serialNumber = serial;
      changed.push('serialNumber');
    }
    if (body.purchaseCost !== undefined) {
      asset.purchaseCost = parseCost(body.purchaseCost);
      changed.push('purchaseCost');
    }

    await asset.save();

    await logAction({ user: req.user, action: 'ASSET_UPDATED', entity: 'Asset', entityId: asset._id, assetId: asset.assetId, metadata: { changed }, ip: req.ip });

    res.json({ success: true, data: publicAsset(asset) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAssets, getAsset, createAsset, updateAsset, buildAssetFilter };
