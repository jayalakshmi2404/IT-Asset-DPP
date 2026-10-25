// Runs the REAL development seed against the in-memory store and checks the result.
// The seed exits the process on failure, so a failing seed fails this test loudly.
const { raw } = require('../support/fakeDb');

describe('Development seed produces a valid, role-testable dataset', () => {
  test('creates departments, accounts and a chain that verifies', async () => {
    process.env.SEED_PASSWORD = 'Seed-password-123';
    const exit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`seed exited with ${code}`);
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await require('../../scripts/seedData').main();
    } finally {
      exit.mockRestore();
      log.mockRestore();
    }

    expect(raw('Department').map((d) => d.name).sort()).toEqual(['Engineering', 'Finance', 'IT Operations']);
    const roles = raw('User').map((u) => u.role).sort();
    expect(roles).toEqual(['ADMIN', 'AUDITOR', 'EMPLOYEE', 'EMPLOYEE', 'EMPLOYEE', 'MANAGER']);
    expect(raw('User').find((u) => u.status === 'INACTIVE')).toBeDefined();

    // Employee A and Employee B own DIFFERENT assets; the manager scope covers only IT Operations
    const empA = raw('User').find((u) => u.email === 'employee.a@example.test');
    const empB = raw('User').find((u) => u.email === 'employee.b@example.test');
    const owned = (u) => raw('Asset').filter((a) => a.assignedTo === u._id).map((a) => a.assetId);
    expect(owned(empA)).toEqual(['AST-1001']);
    expect(owned(empB)).toEqual(['AST-1002']);

    const manager = raw('User').find((u) => u.role === 'MANAGER');
    expect(manager.managedDepartmentIds).toEqual([raw('Department').find((d) => d.code === 'ITOPS')._id]);

    // Lifecycle history exists, and the ledger verifies end to end
    expect(raw('LifecycleEvent').length).toBeGreaterThan(8);
    const { verifyFullChain } = require('../../services/verification/verifyChain');
    const result = await verifyFullChain();
    expect(result.status).toBe('VERIFIED');
  });
});
