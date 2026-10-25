const LifecycleEvent = require('../models/LifecycleEvent');
const { AppError } = require('../middleware/errorHandler');
const { recordLifecycleEvent } = require('../services/lifecycleService');
const { logAction } = require('../services/audit/auditLogger');
const {
  assetScopeFilter,
  requireVisibleAsset,
  visibleAssetObjectIds,
  assertDepartmentInScope,
  assertUserAssignableBy,
  loadDepartment,
  loadAssignee,
} = require('../services/access/scope');
const { hasPermission, PERMISSIONS } = require('../services/access/permissions');
const { publicLifecycleEvent, publicAsset } = require('../services/presenters');
const { EVENT_TYPES_WRITABLE } = require('../config/constants');
const { escapeRegex, requireString, optionalString, requireObjectId, requireEnum, clampInt } = require('../utils/security');

const EVENT_TYPE_FILTER = ['REGISTRATION', 'ALLOCATION', 'MAINTENANCE', 'TRANSFER', 'DISPOSAL'];

function optionalDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError('Date is not valid.', 400);
  return d.toISOString().slice(0, 10);
}

// GET /api/assets/:id/lifecycle?page=&limit=   — the asset's own history, if visible
async function listLifecycle(req, res, next) {
  try {
    const asset = await requireVisibleAsset(req.user, req.params.id);
    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 200, fallback: 50 });

    const filter = { asset: asset._id };
    const [items, total] = await Promise.all([
      LifecycleEvent.find(filter).sort({ timestamp: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
      LifecycleEvent.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(publicLifecycleEvent),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
}

/** Builds the ledger filter for the requester: global roles see everything, others only their scope. */
async function scopedLedgerFilter(user, extra) {
  const conditions = [...extra];
  const isGlobal = Object.keys(assetScopeFilter(user)).length === 0;
  if (!isGlobal) conditions.push({ asset: { $in: await visibleAssetObjectIds(user) } });
  return conditions.length ? { $and: conditions } : {};
}

// GET /api/lifecycle?page=&limit=&eventType=&assetId=   — ledger view inside the caller's scope
async function listAllLifecycle(req, res, next) {
  try {
    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 20 });

    const conditions = [];
    if (req.query.eventType) conditions.push({ eventType: requireEnum(req.query.eventType, EVENT_TYPE_FILTER, 'eventType') });
    if (typeof req.query.assetId === 'string' && req.query.assetId.trim()) {
      conditions.push({ assetId: new RegExp(escapeRegex(req.query.assetId.trim().slice(0, 60)), 'i') });
    }
    const filter = await scopedLedgerFilter(req.user, conditions);

    const [items, total] = await Promise.all([
      LifecycleEvent.find(filter).sort({ timestamp: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      LifecycleEvent.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(publicLifecycleEvent),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/lifecycle/recent?limit=   — dashboard feed, same scoping as the ledger
async function recentLifecycle(req, res, next) {
  try {
    const limit = clampInt(req.query.limit, { min: 1, max: 50, fallback: 10 });
    const filter = await scopedLedgerFilter(req.user, []);
    const items = await LifecycleEvent.find(filter).sort({ timestamp: -1, _id: -1 }).limit(limit);
    res.json({ success: true, data: items.map(publicLifecycleEvent) });
  } catch (err) {
    next(err);
  }
}

/**
 * Validates a request and produces the plan for one lifecycle event. Reference
 * data (departments, assignees) is checked here, OUTSIDE the transaction, so the
 * transactional plan stays pure. The asset itself is re-read inside the transaction.
 */
async function buildPlan(actor, eventType, body) {
  const date = optionalDate(body.date ?? body.effectiveDate);

  if (eventType === 'ALLOCATION') {
    const assignee = await loadAssignee(requireObjectId(body.assignedToUserId, 'assignedToUserId'));
    const dept = await loadDepartment(requireObjectId(body.departmentId, 'departmentId'));
    const location = requireString(body.location, 'Location', { max: 120 });
    assertDepartmentInScope(actor, dept._id);
    assertUserAssignableBy(actor, assignee);

    return (asset) => ({
      allowedFrom: ['ACTIVE'],
      eventType,
      description: `Asset allocated to ${dept.name}.`,
      metadata: {
        previousAssignedTo: asset.assignedTo ? String(asset.assignedTo) : null,
        previousDepartmentId: asset.departmentId ? String(asset.departmentId) : null,
        previousLocation: asset.location || '',
        assignedToUserId: String(assignee._id),
        departmentId: String(dept._id),
        departmentName: dept.name,
        location,
        effectiveDate: date,
      },
      updates: { assignedTo: assignee._id, owner: assignee.name, departmentId: dept._id, department: dept.name, location },
      nextStatus: 'ACTIVE',
    });
  }

  if (eventType === 'MAINTENANCE') {
    const description = requireString(body.description, 'Maintenance description', { max: 1000 });
    const result = requireString(body.result, 'Result', { max: 300 });
    const requestedState = body.maintenanceState === undefined ? undefined : requireEnum(body.maintenanceState, ['START', 'COMPLETE'], 'maintenanceState');

    return (asset) => {
      const state = requestedState || (asset.status === 'MAINTENANCE' ? 'COMPLETE' : 'START');
      const starting = state === 'START';
      return {
        allowedFrom: starting ? ['ACTIVE'] : ['MAINTENANCE'],
        eventType,
        description: `Maintenance ${starting ? 'started' : 'completed'}: ${description}`,
        metadata: { maintenanceState: state, description, result, effectiveDate: date },
        updates: {},
        nextStatus: starting ? 'MAINTENANCE' : 'ACTIVE',
      };
    };
  }

  if (eventType === 'TRANSFER') {
    const dept = await loadDepartment(requireObjectId(body.newDepartmentId, 'newDepartmentId'));
    const newLocation = requireString(body.newLocation, 'New location', { max: 120 });
    const reason = requireString(body.reason, 'Reason', { max: 300 });
    const newAssigneeId = body.newAssignedToUserId ? requireObjectId(body.newAssignedToUserId, 'newAssignedToUserId') : null;

    assertDepartmentInScope(actor, dept._id);
    const assignee = newAssigneeId ? await loadAssignee(newAssigneeId) : null;
    if (assignee) assertUserAssignableBy(actor, assignee);

    return (asset) => ({
      allowedFrom: ['ACTIVE', 'MAINTENANCE'],
      eventType,
      description: `Transferred to ${dept.name}.`,
      metadata: {
        previousAssignedTo: asset.assignedTo ? String(asset.assignedTo) : null,
        previousDepartmentId: asset.departmentId ? String(asset.departmentId) : null,
        previousLocation: asset.location || '',
        newAssignedToUserId: assignee ? String(assignee._id) : null,
        newDepartmentId: String(dept._id),
        newDepartmentName: dept.name,
        newLocation,
        reason,
        effectiveDate: date,
      },
      updates: {
        assignedTo: assignee ? assignee._id : null,
        owner: assignee ? assignee.name : '',
        departmentId: dept._id,
        department: dept.name,
        location: newLocation,
      },
      nextStatus: asset.status, // a transfer does not change maintenance state
    });
  }

  // DISPOSAL — administrators only (checked before this point)
  const disposalReason = requireString(body.disposalReason, 'Disposal reason', { max: 500 });
  const authorizedBy = requireString(body.authorizedBy, 'Authorized by', { max: 120 });
  const certificateReference = requireString(body.certificateReference, 'Certificate reference', { max: 120 });

  return (asset) => ({
    allowedFrom: ['ACTIVE', 'MAINTENANCE'],
    eventType,
    description: `Asset disposed: ${disposalReason}`,
    metadata: {
      previousAssignedTo: asset.assignedTo ? String(asset.assignedTo) : null,
      disposalReason,
      authorizedBy,
      certificateReference,
      effectiveDate: date,
    },
    updates: { assignedTo: null, owner: '' },
    nextStatus: 'DISPOSED',
  });
}

// POST /api/assets/:id/lifecycle
async function addLifecycleEvent(req, res, next) {
  try {
    const eventType = requireEnum(req.body.eventType, EVENT_TYPES_WRITABLE, 'eventType');

    // Per-event permissions. Route-level middleware admitted the caller for SOME
    // lifecycle write; this decides whether THIS event type is allowed.
    const needed = eventType === 'DISPOSAL' ? PERMISSIONS.LIFECYCLE_DISPOSE : PERMISSIONS.LIFECYCLE_ALLOCATE;
    if (!hasPermission(req.user.role, needed)) {
      throw new AppError(`Your role cannot record ${eventType.toLowerCase()} events.`, 403);
    }

    // Out-of-scope assets are indistinguishable from missing ones (404).
    const asset = await requireVisibleAsset(req.user, req.params.id);

    const plan = await buildPlan(req.user, eventType, req.body);
    const { event, asset: updated } = await recordLifecycleEvent({
      assetObjectId: asset._id,
      actor: req.user,
      plan,
    });

    await logAction({
      user: req.user,
      action: eventType,
      entity: 'LifecycleEvent',
      entityId: event._id,
      assetId: updated.assetId,
      metadata: { eventType, blockIndex: event.blockIndex },
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      data: { event: publicLifecycleEvent(event), asset: publicAsset(updated) },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listLifecycle, listAllLifecycle, recentLifecycle, addLifecycleEvent };
