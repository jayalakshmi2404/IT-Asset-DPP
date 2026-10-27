/**
 * Central permission model.
 *
 * This file is the ONLY place that decides what a role may do. Routes declare
 * the permission they need (requirePermission), controllers apply the data
 * scope (scope.js), and the frontend mirrors this matrix purely for navigation.
 * Hiding a button in the UI is never treated as authorization.
 *
 * Keep client/src/auth/permissions.js in sync with this file. The backend test
 * "permission matrix" asserts the exact matrix so accidental drift is caught.
 */

const ROLES = Object.freeze(['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR']);

const PERMISSIONS = Object.freeze({
  ASSETS_READ: 'assets:read', // see assets inside the caller's data scope
  ASSETS_WRITE: 'assets:write', // register assets and edit descriptive (non-ownership) fields
  LIFECYCLE_READ: 'lifecycle:read', // read lifecycle history inside the caller's data scope
  LIFECYCLE_ALLOCATE: 'lifecycle:allocate', // ALLOCATION / TRANSFER / MAINTENANCE within scope
  LIFECYCLE_DISPOSE: 'lifecycle:dispose', // DISPOSAL (business rule: administrators only)
  QR_ISSUE: 'qr:issue', // generate and record a QR issuance
  INTEGRITY_VERIFY: 'integrity:verify', // run an asset-level verification (logged)
  INTEGRITY_FULL_CHAIN: 'integrity:full-chain', // verify the entire global ledger
  REPORTS_SCOPED: 'reports:scoped', // dashboards and reports limited to the caller's scope
  REPORTS_GLOBAL: 'reports:global', // system-wide statistics and verification counts
  AUDIT_READ: 'audit:read', // read audit logs
  USERS_MANAGE: 'users:manage', // create/update users, roles, status, scopes
  USERS_ASSIGNABLE_READ: 'users:assignable', // list employees an asset can be allocated to (scoped)
  DEPARTMENTS_READ: 'departments:read', // list departments (scoped for managers)
  DEPARTMENTS_MANAGE: 'departments:manage', // create/update departments
  PROFILE_READ: 'profile:read', // read own profile
  PROFILE_WRITE: 'profile:write', // change own password
  ANCHOR_READ: 'anchor:read', // view external anchor status and verify anchors
  ANCHOR_WRITE: 'anchor:write', // submit anchor transactions (administrators only)
});

const P = PERMISSIONS;

const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: Object.freeze([
    P.ASSETS_READ,
    P.ASSETS_WRITE,
    P.LIFECYCLE_READ,
    P.LIFECYCLE_ALLOCATE,
    P.LIFECYCLE_DISPOSE,
    P.QR_ISSUE,
    P.INTEGRITY_VERIFY,
    P.INTEGRITY_FULL_CHAIN,
    P.REPORTS_SCOPED,
    P.REPORTS_GLOBAL,
    P.AUDIT_READ,
    P.USERS_MANAGE,
    P.USERS_ASSIGNABLE_READ,
    P.DEPARTMENTS_READ,
    P.DEPARTMENTS_MANAGE,
    P.PROFILE_READ,
    P.PROFILE_WRITE,
    P.ANCHOR_READ,
    P.ANCHOR_WRITE,
  ]),
  MANAGER: Object.freeze([
    P.ASSETS_READ,
    P.LIFECYCLE_READ,
    P.LIFECYCLE_ALLOCATE,
    P.QR_ISSUE,
    P.INTEGRITY_VERIFY,
    P.REPORTS_SCOPED,
    P.USERS_ASSIGNABLE_READ,
    P.DEPARTMENTS_READ,
    P.PROFILE_READ,
    P.PROFILE_WRITE,
  ]),
  EMPLOYEE: Object.freeze([P.ASSETS_READ, P.LIFECYCLE_READ, P.PROFILE_READ, P.PROFILE_WRITE]),
  AUDITOR: Object.freeze([
    P.ASSETS_READ,
    P.LIFECYCLE_READ,
    P.INTEGRITY_VERIFY,
    P.INTEGRITY_FULL_CHAIN,
    P.REPORTS_SCOPED,
    P.REPORTS_GLOBAL,
    P.AUDIT_READ,
    P.DEPARTMENTS_READ,
    P.PROFILE_READ,
    P.PROFILE_WRITE,
    P.ANCHOR_READ,
  ]),
});

/**
 * How far a role's data reach extends.
 *  GLOBAL       – every record (ADMIN, AUDITOR)
 *  DEPARTMENTS  – assets in the departments explicitly assigned to the user (MANAGER)
 *  OWN          – only assets assigned to the user's own account (EMPLOYEE)
 */
const SCOPE_BY_ROLE = Object.freeze({
  ADMIN: 'GLOBAL',
  AUDITOR: 'GLOBAL',
  MANAGER: 'DEPARTMENTS',
  EMPLOYEE: 'OWN',
});

function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  return Boolean(granted && granted.includes(permission));
}

function scopeFor(role) {
  return SCOPE_BY_ROLE[role] || 'NONE';
}

function permissionsFor(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SCOPE_BY_ROLE,
  hasPermission,
  scopeFor,
  permissionsFor,
};
