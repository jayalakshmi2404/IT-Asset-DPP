import { describe, it, expect } from 'vitest';
import { PERMISSIONS as P, can, canAny, ROLE_PERMISSIONS } from '../src/auth/permissions';

const user = (role) => ({ role, id: `u-${role}` });

describe('client permission matrix', () => {
  it('ADMIN can write assets, dispose, manage users and run full-chain checks', () => {
    const a = user('ADMIN');
    expect(can(a, P.ASSETS_WRITE)).toBe(true);
    expect(can(a, P.LIFECYCLE_DISPOSE)).toBe(true);
    expect(can(a, P.USERS_MANAGE)).toBe(true);
    expect(can(a, P.INTEGRITY_FULL_CHAIN)).toBe(true);
  });

  it('MANAGER can allocate and verify but cannot dispose, write assets or manage users', () => {
    const m = user('MANAGER');
    expect(can(m, P.LIFECYCLE_ALLOCATE)).toBe(true);
    expect(can(m, P.INTEGRITY_VERIFY)).toBe(true);
    expect(can(m, P.LIFECYCLE_DISPOSE)).toBe(false);
    expect(can(m, P.ASSETS_WRITE)).toBe(false);
    expect(can(m, P.USERS_MANAGE)).toBe(false);
    expect(can(m, P.INTEGRITY_FULL_CHAIN)).toBe(false);
  });

  it('EMPLOYEE can only read assets and lifecycle, and cannot see organisation reports or audit logs', () => {
    const e = user('EMPLOYEE');
    expect(can(e, P.ASSETS_READ)).toBe(true);
    expect(can(e, P.LIFECYCLE_READ)).toBe(true);
    expect(can(e, P.LIFECYCLE_ALLOCATE)).toBe(false);
    expect(can(e, P.REPORTS_SCOPED)).toBe(false);
    expect(can(e, P.AUDIT_READ)).toBe(false);
    expect(can(e, P.ASSETS_WRITE)).toBe(false);
    expect(can(e, P.QR_ISSUE)).toBe(false);
  });

  it('AUDITOR has read and verification rights but no write rights at all', () => {
    const au = user('AUDITOR');
    for (const writePerm of [P.ASSETS_WRITE, P.LIFECYCLE_ALLOCATE, P.LIFECYCLE_DISPOSE, P.QR_ISSUE, P.USERS_MANAGE, P.DEPARTMENTS_MANAGE]) {
      expect(can(au, writePerm)).toBe(false);
    }
    expect(can(au, P.INTEGRITY_FULL_CHAIN)).toBe(true);
    expect(can(au, P.AUDIT_READ)).toBe(true);
    expect(can(au, P.REPORTS_GLOBAL)).toBe(true);
  });

  it('fails closed for a missing user or an unknown role', () => {
    expect(can(null, P.ASSETS_READ)).toBe(false);
    expect(can(undefined, P.ASSETS_READ)).toBe(false);
    expect(can({ role: 'GUEST' }, P.ASSETS_READ)).toBe(false);
    expect(canAny({ role: 'EMPLOYEE' }, [P.USERS_MANAGE, P.AUDIT_READ])).toBe(false);
    expect(canAny({ role: 'AUDITOR' }, [P.USERS_MANAGE, P.AUDIT_READ])).toBe(true);
  });

  it('every role entry is defined, so no role silently falls back to nothing', () => {
    for (const role of ['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR']) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
