import { describe, it, expect } from 'vitest';
import { navigationFor } from '../src/auth/navigation';

const KNOWN_ROUTES = ['/dashboard', '/assets', '/lifecycle', '/transfers', '/integrity', '/reports', '/users', '/audit-logs', '/settings'];
const labelsFor = (role) => navigationFor({ role, id: 'x' }).map((i) => i.label);
const targetsFor = (role) => navigationFor({ role, id: 'x' }).map((i) => i.to.split('?')[0]);

describe('navigation generated from permissions', () => {
  it('ADMIN sees transfers, users, audit logs and integrity, but not manager-only shortcuts', () => {
    const t = targetsFor('ADMIN');
    expect(t).toEqual(expect.arrayContaining(['/transfers', '/users', '/audit-logs', '/integrity']));
    expect(labelsFor('ADMIN')).not.toEqual(expect.arrayContaining(['Allocations', 'Maintenance']));
  });

  it('MANAGER sees allocations and maintenance, but not transfers, users, audit logs or integrity', () => {
    expect(labelsFor('MANAGER')).toEqual(expect.arrayContaining(['Allocations', 'Maintenance']));
    const t = targetsFor('MANAGER');
    expect(t).not.toContain('/transfers');
    expect(t).not.toContain('/users');
    expect(t).not.toContain('/audit-logs');
    expect(t).not.toContain('/integrity');
  });

  it('EMPLOYEE gets personal labels and no organisation reports or audit access', () => {
    const labels = labelsFor('EMPLOYEE');
    expect(labels).toContain('My Assets');
    expect(labels).toContain('My Profile');
    expect(targetsFor('EMPLOYEE')).not.toContain('/reports');
    expect(targetsFor('EMPLOYEE')).not.toContain('/audit-logs');
  });

  it('AUDITOR sees integrity and audit logs, and no user management', () => {
    const t = targetsFor('AUDITOR');
    expect(t).toEqual(expect.arrayContaining(['/integrity', '/audit-logs']));
    expect(t).not.toContain('/users');
    expect(t).not.toContain('/transfers');
  });

  it('every link points at a route that exists in the application', () => {
    for (const role of ['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR']) {
      for (const target of targetsFor(role)) {
        expect(KNOWN_ROUTES).toContain(target);
      }
    }
  });

  it('returns no items for a missing user', () => {
    expect(navigationFor(null).map((i) => i.to)).toEqual(['/dashboard']);
  });
});
