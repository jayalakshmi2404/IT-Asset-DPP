const { buildScenario, as, anonymous } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');
const { models } = require('../support/fakeDb');
const { ensureGenesisBlock } = require('../../services/blockchain/hashChain');
const { dbState } = require('../../config/db');

describe('Integrity verification (SHA-256 hash chain)', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
    // a little history so the chain has several links
    await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Cleaning', result: 'Done', maintenanceState: 'START' });
    await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Cleaning', result: 'Done', maintenanceState: 'COMPLETE' });
  });

  test('valid lifecycle records verify successfully (status VERIFIED)', async () => {
    const res = await as(s.users.auditor).post(`/api/assets/${s.assets.a1003._id}/verify-integrity`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.violations).toEqual([]);
  });

  test('the full ledger verifies, and every link is checked', async () => {
    const res = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.totalBlocks).toBeGreaterThan(5);
  });

  test('a verification is written to the audit log', async () => {
    await as(s.users.auditor).post(`/api/assets/${s.assets.a1003._id}/verify-integrity`);
    expect(raw('AuditLog').some((l) => l.action === 'INTEGRITY_VERIFICATION' && l.assetId === 'AST-1003')).toBe(true);
  });

  test('tampering with an event payload directly in storage is detected', async () => {
    const event = raw('LifecycleEvent').find((e) => e.assetId === 'AST-1003' && e.eventType === 'MAINTENANCE');
    event.description = 'Cleaning (edited after the fact)';

    const asset = await as(s.users.auditor).post(`/api/assets/${s.assets.a1003._id}/verify-integrity`);
    expect(asset.body.data.status).toBe('VIOLATION_DETECTED');
    expect(asset.body.data.violations.some((v) => /does not match its recorded hash/.test(v.reason))).toBe(true);

    const full = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(full.body.data.status).toBe('VIOLATION_DETECTED');
    expect(full.body.data.violations.length).toBeGreaterThan(0);
  });

  test('tampering with a stored previous-hash link is detected by the full-chain check', async () => {
    const block = raw('HashBlock').find((b) => b.index === 3);
    block.previousHash = 'a'.repeat(64);
    const res = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
    expect(res.body.data.violations.some((v) => /Chain link broken/.test(v.reason))).toBe(true);
  });

  test('a deleted lifecycle record is reported, not silently ignored', async () => {
    const idx = raw('LifecycleEvent').findIndex((e) => e.assetId === 'AST-1003' && e.eventType === 'MAINTENANCE');
    raw('LifecycleEvent').splice(idx, 1);
    const res = await as(s.users.auditor).post(`/api/assets/${s.assets.a1003._id}/verify-integrity`);
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
    expect(res.body.data.violations.some((v) => /record was deleted|record is missing/i.test(v.reason))).toBe(true);
  });

  test('when the database is unavailable, nothing is reported as verified (503)', async () => {
    dbState.mockReturnValueOnce('disconnected');
    const res = await as(s.users.auditor).post(`/api/assets/${s.assets.a1003._id}/verify-integrity`);
    expect(res.status).toBe(503);
    expect(res.body.data).toBeUndefined();
    expect(res.body.message).toMatch(/Nothing was marked as verified/);
  });

  test('a database read error during verification surfaces as an error, never as verified', async () => {
    const spy = jest.spyOn(models.LifecycleEvent, 'find').mockImplementationOnce(() => {
      throw new Error('simulated outage');
    });
    const res = await as(s.users.auditor).post(`/api/assets/${s.assets.a1003._id}/verify-integrity`);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.data).toBeUndefined();
    expect(res.body.message).not.toMatch(/simulated outage/);
  });

  test('employees can read their own asset integrity status but cannot trigger verification', async () => {
    expect((await as(s.users.empA).get('/api/assets/AST-1001/integrity')).status).toBe(200);
    expect((await as(s.users.empA).post('/api/assets/AST-1001/verify-integrity')).status).toBe(403);
    expect((await anonymous.get('/api/assets/AST-1001/integrity')).status).toBe(401);
  });

  test('genesis creation is idempotent under repeated calls', async () => {
    await ensureGenesisBlock();
    await ensureGenesisBlock();
    expect(raw('HashBlock').filter((b) => b.index === 0).length).toBe(1);
  });
});
