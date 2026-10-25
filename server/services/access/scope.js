const mongoose = require('mongoose');
const Asset = require('../../models/Asset');
const Department = require('../../models/Department');
const User = require('../../models/User');
const { AppError } = require('../../middleware/errorHandler');
const { scopeFor, hasPermission, PERMISSIONS } = require('./permissions');

/**
 * Data-scope helpers. Every read of assets or lifecycle data is built from these
 * functions so the database itself does the filtering. Controllers never fetch
 * "everything" and filter in JavaScript.
 *
 * Out-of-scope records are reported as 404 (not 403) so their existence is not
 * revealed to the caller.
 */

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Mongo filter describing every asset the requester may see. */
function assetScopeFilter(user) {
  switch (scopeFor(user.role)) {
    case 'GLOBAL':
      return {};
    case 'DEPARTMENTS': {
      const ids = (user.managedDepartmentIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
      // A manager with no assigned departments sees nothing (fails closed).
      return ids.length ? { departmentId: { $in: ids } } : { _id: { $in: [] } };
    }
    case 'OWN':
      return { assignedTo: user._id };
    default:
      return { _id: { $in: [] } };
  }
}

/** Accepts either the Mongo _id or the human-facing assetId (e.g. AST-001). */
function assetIdentifierFilter(identifier) {
  return OBJECT_ID_PATTERN.test(identifier) ? { _id: identifier } : { assetId: identifier };
}

/**
 * Returns the asset only if it is inside the requester's scope; otherwise null.
 * Callers translate null into a 404.
 */
async function findVisibleAsset(user, identifier) {
  if (typeof identifier !== 'string' || !identifier.trim()) return null;
  return Asset.findOne({ $and: [assetScopeFilter(user), assetIdentifierFilter(identifier.trim())] });
}

async function requireVisibleAsset(user, identifier) {
  const asset = await findVisibleAsset(user, identifier);
  if (!asset) throw new AppError('Asset not found.', 404);
  return asset;
}

/** Ids of every asset the requester may see (used to scope lifecycle queries). */
async function visibleAssetObjectIds(user) {
  return Asset.find(assetScopeFilter(user)).distinct('_id');
}

/**
 * A MANAGER may only act on departments explicitly assigned to them.
 * Global roles pass; everyone else is refused.
 */
function assertDepartmentInScope(user, departmentId) {
  const kind = scopeFor(user.role);
  if (kind === 'GLOBAL') return;
  if (kind !== 'DEPARTMENTS') throw new AppError('You do not have permission to assign assets to departments.', 403);
  const allowed = (user.managedDepartmentIds || []).map(String);
  if (!allowed.includes(String(departmentId))) {
    throw new AppError('That department is outside your management scope.', 403);
  }
}

/**
 * Checks that the actor may allocate or transfer an asset to the given employee.
 * Managers may only assign employees who belong to one of their departments.
 */
function assertUserAssignableBy(actor, targetUser) {
  if (!targetUser || targetUser.role !== 'EMPLOYEE' || targetUser.status !== 'ACTIVE') {
    throw new AppError('Assets can only be assigned to active employee accounts.', 400);
  }
  if (scopeFor(actor.role) === 'GLOBAL') return;
  const allowed = (actor.managedDepartmentIds || []).map(String);
  if (!targetUser.departmentId || !allowed.includes(String(targetUser.departmentId))) {
    throw new AppError('That employee is outside your management scope.', 403);
  }
}

/** Resolves a department id from the request into a real department document. */
async function loadDepartment(departmentId) {
  const dept = await Department.findById(departmentId).lean();
  if (!dept) throw new AppError('Department not found.', 400);
  return dept;
}

/** Resolves an assignee id into an active EMPLOYEE document. */
async function loadAssignee(userId) {
  const target = await User.findById(userId).lean();
  if (!target) throw new AppError('Assignee not found.', 400);
  return target;
}

function requirePermissionInMemory(user, permission) {
  if (!hasPermission(user.role, permission)) {
    throw new AppError('You do not have permission to perform this action.', 403);
  }
}

module.exports = {
  PERMISSIONS,
  assetScopeFilter,
  assetIdentifierFilter,
  findVisibleAsset,
  requireVisibleAsset,
  visibleAssetObjectIds,
  assertDepartmentInScope,
  assertUserAssignableBy,
  loadDepartment,
  loadAssignee,
  requirePermissionInMemory,
};
