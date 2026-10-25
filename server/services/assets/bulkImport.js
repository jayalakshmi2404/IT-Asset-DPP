/**
 * Bulk asset import: validation first, then one ledger transaction per asset.
 *
 * Policy (stated so it is not a surprise):
 *  - Validation is ALL-OR-NOTHING. If any row is invalid, nothing is written and every row
 *    error is returned. A file that is refused can be corrected and resubmitted unchanged.
 *  - A valid file is written ROW BY ROW through registerAsset(). Each asset and its REGISTRATION
 *    block commit in their own transaction. If the database rejects a row, the rows before it stay
 *    written (each is complete and verifiable) and the result lists exactly which rows succeeded
 *    and which failed. Nothing is reported as imported unless its transaction committed.
 *  - Assets are registered as ACTIVE. Other statuses need lifecycle events, so they are refused here.
 *  - Ownership is not imported. The owner column is ignored with a warning; assign owners afterwards.
 *  - Departments must already exist (matched by name, case-insensitive). They are not created here.
 */
const Asset = require('../../models/Asset');
const Department = require('../../models/Department');
const { CATEGORIES } = require('../../config/constants');
const { registerAsset } = require('../lifecycleService');
const { logAction } = require('../audit/auditLogger');
const { parseCsv } = require('../csv/csv');

const ASSET_ID_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Column names the template uses. Spreadsheet-style variants are accepted and mapped. */
const COLUMN_ALIASES = {
  assetid: 'assetId',
  'asset id': 'assetId',
  name: 'name',
  'asset name': 'name',
  category: 'category',
  brand: 'brand',
  model: 'model',
  serialnumber: 'serialNumber',
  'serial number': 'serialNumber',
  serial: 'serialNumber',
  purchasedate: 'purchaseDate',
  'purchase date': 'purchaseDate',
  purchasecost: 'purchaseCost',
  'purchase cost': 'purchaseCost',
  warranty: 'warranty',
  status: 'status',
  department: 'department',
  location: 'location',
  description: 'description',
  owner: 'owner',
  dppid: 'dppId',
  'dpp id': 'dppId',
  qrreference: 'qrReference',
};
const IGNORED_COLUMNS = new Set(['owner', 'dppId', 'qrReference']);

/** Categories in files often come from other systems; these map to the application's own names. */
const CATEGORY_ALIASES = {
  'network equipment': 'Networking',
  networking: 'Networking',
  'storage device': 'Storage',
  peripherals: 'Peripheral',
};

const ACCEPTED_STATUS = new Set(['', 'active', 'registered']);
const MAX_LENGTH = { assetId: 40, name: 160, brand: 80, model: 80, serialNumber: 80, warranty: 120, location: 120, description: 1000 };

function canonicalHeader(header) {
  return COLUMN_ALIASES[String(header).trim().toLowerCase()] || null;
}

/** Validates one row's values. Returns { fields, errors } where fields are ready for registerAsset. */
function validateRow(raw, { departmentsByName, existingAssetIds, existingSerials, seenAssetIds, seenSerials }) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const text = (key) => (raw[key] === undefined ? '' : String(raw[key]).trim());

  const assetId = text('assetId');
  if (!assetId) fail('assetId', 'Asset ID is required.');
  else if (!ASSET_ID_PATTERN.test(assetId)) fail('assetId', 'Asset ID may only contain letters, digits, dots, hyphens and underscores (max 40).');
  else if (existingAssetIds.has(assetId)) fail('assetId', `Asset ID "${assetId}" already exists in the database.`);
  else if (seenAssetIds.has(assetId)) fail('assetId', `Asset ID "${assetId}" appears more than once in this file.`);

  const name = text('name');
  if (!name) fail('name', 'Name is required.');
  else if (name.length > MAX_LENGTH.name) fail('name', `Name must be at most ${MAX_LENGTH.name} characters.`);

  const categoryInput = text('category');
  const category = CATEGORY_ALIASES[categoryInput.toLowerCase()] || CATEGORIES.find((c) => c.toLowerCase() === categoryInput.toLowerCase());
  if (!categoryInput) fail('category', 'Category is required.');
  else if (!category) fail('category', `Category "${categoryInput}" is not recognised. Use one of: ${CATEGORIES.join(', ')}.`);

  const dateInput = text('purchaseDate');
  let purchaseDate = null;
  if (!dateInput) fail('purchaseDate', 'Purchase date is required (YYYY-MM-DD).');
  else if (!DATE_PATTERN.test(dateInput)) fail('purchaseDate', `Purchase date "${dateInput}" must use the format YYYY-MM-DD.`);
  else {
    const d = new Date(`${dateInput}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateInput) fail('purchaseDate', `Purchase date "${dateInput}" is not a real calendar date.`);
    else if (d.getTime() > Date.now()) fail('purchaseDate', 'Purchase date cannot be in the future.');
    else purchaseDate = d;
  }

  const costInput = text('purchaseCost');
  let purchaseCost = 0;
  if (costInput !== '') {
    const n = Number(costInput);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) fail('purchaseCost', `Purchase cost "${costInput}" must be a number from 0 to 1,000,000,000.`);
    else purchaseCost = n;
  }

  const serialNumber = text('serialNumber');
  if (serialNumber) {
    if (serialNumber.length > MAX_LENGTH.serialNumber) fail('serialNumber', `Serial number must be at most ${MAX_LENGTH.serialNumber} characters.`);
    else if (existingSerials.has(serialNumber)) fail('serialNumber', `Serial number "${serialNumber}" is already registered.`);
    else if (seenSerials.has(serialNumber)) fail('serialNumber', `Serial number "${serialNumber}" appears more than once in this file.`);
  }

  const statusInput = text('status');
  if (!ACCEPTED_STATUS.has(statusInput.toLowerCase())) {
    fail('status', `Status "${statusInput}" cannot be set on import. New assets are registered as ACTIVE. Record maintenance, transfers or disposal as lifecycle events after import.`);
  }

  const departmentInput = text('department');
  let departmentId = null;
  let department = '';
  if (departmentInput) {
    const match = departmentsByName.get(departmentInput.toLowerCase());
    if (!match) fail('department', `Department "${departmentInput}" does not exist. Create it under Settings first, or correct the name.`);
    else {
      departmentId = match.id;
      department = match.name;
    }
  }

  for (const key of ['brand', 'model', 'warranty', 'location', 'description']) {
    if (text(key).length > MAX_LENGTH[key]) fail(key, `${key} must be at most ${MAX_LENGTH[key]} characters.`);
  }

  if (errors.length) return { fields: null, errors };
  return {
    fields: {
      assetId,
      name,
      category,
      brand: text('brand'),
      model: text('model'),
      serialNumber: serialNumber || undefined,
      purchaseDate,
      purchaseCost,
      warranty: text('warranty'),
      location: text('location'),
      description: text('description'),
      departmentId,
      department,
      assignedTo: null,
      owner: '',
    },
    errors: [],
  };
}

/**
 * Parses and validates CSV text against the database. Never writes.
 * Returns { headers, ignoredColumns, unknownColumns, rows: [{rowNumber, assetId, errors, fields}], errorCount, validCount }.
 */
async function prepareImport(csvText) {
  const { headers, rows } = parseCsv(csvText);
  const columnKeys = headers.map(canonicalHeader);
  const unknownColumns = headers.filter((h, i) => !columnKeys[i]);
  const ignoredColumns = headers.filter((h, i) => columnKeys[i] && IGNORED_COLUMNS.has(columnKeys[i]));

  const missingRequired = ['assetId', 'name', 'category', 'purchaseDate'].filter((k) => !columnKeys.includes(k));
  if (missingRequired.length) {
    const err = new Error(`The file is missing required column(s): ${missingRequired.join(', ')}. Download the template to see the expected headers.`);
    err.statusCode = 400;
    throw err;
  }

  const departments = await Department.find({}).lean();
  const departmentsByName = new Map(departments.map((d) => [d.name.toLowerCase(), { id: d._id, name: d.name }]));

  const candidateIds = new Set();
  const candidateSerials = new Set();
  for (const values of rows) {
    const map = Object.fromEntries(columnKeys.map((k, i) => [k, values[i]]).filter(([k]) => k));
    if (map.assetId) candidateIds.add(String(map.assetId).trim());
    if (map.serialNumber) candidateSerials.add(String(map.serialNumber).trim());
  }
  const existing = await Asset.find({ $or: [{ assetId: { $in: [...candidateIds] } }, { serialNumber: { $in: [...candidateSerials] } }] })
    .select('assetId serialNumber')
    .lean();
  const existingAssetIds = new Set(existing.map((a) => a.assetId));
  const existingSerials = new Set(existing.filter((a) => a.serialNumber).map((a) => a.serialNumber));

  const seenAssetIds = new Set();
  const seenSerials = new Set();
  const prepared = rows.map((values, index) => {
    const raw = {};
    columnKeys.forEach((key, i) => {
      if (key) raw[key] = values[i] ?? '';
    });
    const rowNumber = index + 2; // header is line 1
    const result = validateRow(raw, { departmentsByName, existingAssetIds, existingSerials, seenAssetIds, seenSerials });
    const assetId = String(raw.assetId || '').trim();
    if (!result.errors.length) {
      seenAssetIds.add(assetId);
      if (raw.serialNumber && String(raw.serialNumber).trim()) seenSerials.add(String(raw.serialNumber).trim());
    }
    const warnings = [];
    if (raw.owner && String(raw.owner).trim()) warnings.push('Owner is not imported. Assign the owner after import through Lifecycle → Allocate.');
    return { rowNumber, assetId, errors: result.errors.map((e) => ({ ...e, row: rowNumber, assetId })), fields: result.fields, warnings };
  });

  const errorCount = prepared.reduce((n, r) => n + r.errors.length, 0);
  return {
    headers,
    ignoredColumns,
    unknownColumns,
    rows: prepared,
    totalRows: prepared.length,
    validCount: prepared.filter((r) => !r.errors.length).length,
    errorCount,
    canCommit: prepared.length > 0 && errorCount === 0,
  };
}

/**
 * Writes a prepared import. Refuses to write anything unless every row is valid.
 * Each row is registered in its own transaction through the trusted lifecycle service.
 */
async function commitImport(prepared, { actor, ip = '' }) {
  if (!prepared.canCommit) {
    const err = new Error('The file has validation errors. Nothing was imported. Fix the rows listed and submit the file again.');
    err.statusCode = 422;
    err.details = prepared.rows.flatMap((r) => r.errors);
    throw err;
  }

  const succeeded = [];
  const failed = [];
  for (const row of prepared.rows) {
    try {
      const { asset } = await registerAsset({ fields: row.fields, actor });
      succeeded.push({ row: row.rowNumber, assetId: asset.assetId, dppId: asset.dppId });
      await logAction({ user: actor, action: 'ASSET_CREATED', entity: 'Asset', entityId: asset._id, assetId: asset.assetId, metadata: { dppId: asset.dppId, source: 'bulk-import', row: row.rowNumber }, ip });
    } catch (err) {
      failed.push({ row: row.rowNumber, assetId: row.assetId, field: '', message: err.statusCode ? err.message : 'The database rejected this row. Nothing was saved for it.' });
      if (!err.statusCode) console.error(`[import] row ${row.rowNumber} (${row.assetId}) failed:`, err.message);
    }
  }
  return { attempted: prepared.rows.length, succeeded, failed };
}

module.exports = { prepareImport, commitImport, validateRow, canonicalHeader, COLUMN_ALIASES, CATEGORY_ALIASES };
