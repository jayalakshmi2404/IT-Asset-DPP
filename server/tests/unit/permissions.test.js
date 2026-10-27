const { ROLES, PERMISSIONS: P, ROLE_PERMISSIONS, hasPermission, scopeFor } = require('../../services/access/permissions');

describe('Permission matrix (single source of truth)', () => {
  test('exactly the four roles exist', () => {
    expect([...ROLES].sort()).toEqual(['ADMIN', 'AUDITOR', 'EMPLOYEE', 'MANAGER']);
  });

  test('the matrix matches the specification exactly', () => {
    const summary = Object.fromEntries(ROLES.map((r) => [r, [...ROLE_PERMISSIONS[r]].sort()]));
    expect(summary).toEqual({
      ADMIN: [
        'anchor:read', 'anchor:write', 'assets:read', 'assets:write', 'audit:read', 'departments:manage', 'departments:read', 'integrity:full-chain',
        'integrity:verify', 'lifecycle:allocate', 'lifecycle:dispose', 'lifecycle:read', 'profile:read', 'profile:write',
        'qr:issue', 'reports:global', 'reports:scoped', 'users:assignable', 'users:manage',
      ],
      MANAGER: [
        'assets:read', 'departments:read', 'integrity:verify', 'lifecycle:allocate', 'lifecycle:read', 'profile:read',
        'profile:write', 'qr:issue', 'reports:scoped', 'users:assignable',
      ],
      EMPLOYEE: ['assets:read', 'lifecycle:read', 'profile:read', 'profile:write'],
      AUDITOR: [
        'anchor:read', 'assets:read', 'audit:read', 'departments:read', 'integrity:full-chain', 'integrity:verify', 'lifecycle:read',
        'profile:read', 'profile:write', 'reports:global', 'reports:scoped',
      ],
    });
  });

  test('no role can escalate itself: nobody except ADMIN manages users or departments', () => {
    for (const role of ROLES.filter((r) => r !== 'ADMIN')) {
      expect(hasPermission(role, P.USERS_MANAGE)).toBe(false);
      expect(hasPermission(role, P.DEPARTMENTS_MANAGE)).toBe(false);
    }
  });

  test('disposal is administrator-only', () => {
    expect(ROLES.filter((r) => hasPermission(r, P.LIFECYCLE_DISPOSE))).toEqual(['ADMIN']);
  });

  test('AUDITOR holds no write permission at all', () => {
    const writes = ['assets:write', 'lifecycle:allocate', 'lifecycle:dispose', 'qr:issue', 'users:manage', 'departments:manage'];
    for (const w of writes) expect(hasPermission('AUDITOR', w)).toBe(false);
  });

  test('unknown roles are granted nothing and scoped to nothing', () => {
    expect(hasPermission('ROOT', P.ASSETS_READ)).toBe(false);
    expect(scopeFor('ROOT')).toBe('NONE');
    expect(hasPermission(undefined, P.ASSETS_READ)).toBe(false);
  });

  test('data scope per role', () => {
    expect(scopeFor('ADMIN')).toBe('GLOBAL');
    expect(scopeFor('AUDITOR')).toBe('GLOBAL');
    expect(scopeFor('MANAGER')).toBe('DEPARTMENTS');
    expect(scopeFor('EMPLOYEE')).toBe('OWN');
  });
});
