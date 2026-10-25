/**
 * Client mirror of server/services/access/permissions.js.
 * Used ONLY to decide which navigation items and actions to show. The server
 * enforces every permission again on every request.
 * Keep this matrix identical to the server file (the backend test suite pins it).
 */
export const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR'];

export const PERMISSIONS = {
  ASSETS_READ: 'assets:read',
  ASSETS_WRITE: 'assets:write',
  LIFECYCLE_READ: 'lifecycle:read',
  LIFECYCLE_ALLOCATE: 'lifecycle:allocate',
  LIFECYCLE_DISPOSE: 'lifecycle:dispose',
  QR_ISSUE: 'qr:issue',
  INTEGRITY_VERIFY: 'integrity:verify',
  INTEGRITY_FULL_CHAIN: 'integrity:full-chain',
  REPORTS_SCOPED: 'reports:scoped',
  REPORTS_GLOBAL: 'reports:global',
  AUDIT_READ: 'audit:read',
  USERS_MANAGE: 'users:manage',
  USERS_ASSIGNABLE_READ: 'users:assignable',
  DEPARTMENTS_READ: 'departments:read',
  DEPARTMENTS_MANAGE: 'departments:manage',
  PROFILE_READ: 'profile:read',
  PROFILE_WRITE: 'profile:write',
};

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = {
  ADMIN: [P.ASSETS_READ, P.ASSETS_WRITE, P.LIFECYCLE_READ, P.LIFECYCLE_ALLOCATE, P.LIFECYCLE_DISPOSE, P.QR_ISSUE, P.INTEGRITY_VERIFY, P.INTEGRITY_FULL_CHAIN, P.REPORTS_SCOPED, P.REPORTS_GLOBAL, P.AUDIT_READ, P.USERS_MANAGE, P.USERS_ASSIGNABLE_READ, P.DEPARTMENTS_READ, P.DEPARTMENTS_MANAGE, P.PROFILE_READ, P.PROFILE_WRITE],
  MANAGER: [P.ASSETS_READ, P.LIFECYCLE_READ, P.LIFECYCLE_ALLOCATE, P.QR_ISSUE, P.INTEGRITY_VERIFY, P.REPORTS_SCOPED, P.USERS_ASSIGNABLE_READ, P.DEPARTMENTS_READ, P.PROFILE_READ, P.PROFILE_WRITE],
  EMPLOYEE: [P.ASSETS_READ, P.LIFECYCLE_READ, P.PROFILE_READ, P.PROFILE_WRITE],
  AUDITOR: [P.ASSETS_READ, P.LIFECYCLE_READ, P.INTEGRITY_VERIFY, P.INTEGRITY_FULL_CHAIN, P.REPORTS_SCOPED, P.REPORTS_GLOBAL, P.AUDIT_READ, P.DEPARTMENTS_READ, P.PROFILE_READ, P.PROFILE_WRITE],
};

export function can(user, permission) {
  if (!user || !ROLE_PERMISSIONS[user.role]) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export function canAny(user, permissions) {
  return permissions.some((p) => can(user, p));
}

export const ROLE_HOME_LABEL = {
  ADMIN: 'Asset Intelligence Center',
  MANAGER: 'Department Overview',
  EMPLOYEE: 'My Assets',
  AUDITOR: 'Audit Dashboard',
};
