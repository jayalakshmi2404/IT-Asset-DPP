import { PERMISSIONS as P, can } from './permissions';

/**
 * Navigation is generated from the permission model, so each role sees exactly the
 * pages it can use. Items point only at pages that exist in this build.
 */
const ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home', show: () => true, endLabelByRole: { EMPLOYEE: 'My Dashboard', AUDITOR: 'Audit Dashboard' } },
  { to: '/assets', label: 'Assets', icon: 'box', show: (u) => can(u, P.ASSETS_READ), endLabelByRole: { EMPLOYEE: 'My Assets', AUDITOR: 'Asset Records', MANAGER: 'Department Assets' } },
  { to: '/lifecycle', label: 'Lifecycle Events', icon: 'timeline', show: (u) => can(u, P.LIFECYCLE_READ), endLabelByRole: { EMPLOYEE: 'My Lifecycle History', AUDITOR: 'Lifecycle History' } },
  { to: '/lifecycle?eventType=ALLOCATION', label: 'Allocations', icon: 'user', show: (u) => u?.role === 'MANAGER' && can(u, P.LIFECYCLE_ALLOCATE) },
  { to: '/lifecycle?eventType=MAINTENANCE', label: 'Maintenance', icon: 'wrench', show: (u) => u?.role === 'MANAGER' && can(u, P.LIFECYCLE_ALLOCATE) },
  { to: '/transfers', label: 'Transfers', icon: 'swap', show: (u) => u?.role === 'ADMIN' && can(u, P.LIFECYCLE_ALLOCATE) },
  { to: '/integrity', label: 'Integrity Verification', icon: 'shield', show: (u) => can(u, P.INTEGRITY_FULL_CHAIN) },
  { to: '/reports', label: 'Reports', icon: 'chart', show: (u) => can(u, P.REPORTS_SCOPED), endLabelByRole: { MANAGER: 'Scoped Reports', AUDITOR: 'Permitted Reports' } },
  { to: '/users', label: 'Users', icon: 'users', show: (u) => can(u, P.USERS_MANAGE) },
  { to: '/audit-logs', label: 'Audit Logs', icon: 'log', show: (u) => can(u, P.AUDIT_READ) },
  { to: '/settings', label: 'Settings', icon: 'gear', show: (u) => can(u, P.PROFILE_READ), endLabelByRole: { EMPLOYEE: 'My Profile' } },
];

export function navigationFor(user) {
  return ITEMS.filter((item) => item.show(user)).map((item) => ({
    to: item.to,
    icon: item.icon,
    label: (user && item.endLabelByRole && item.endLabelByRole[user.role]) || item.label,
  }));
}
