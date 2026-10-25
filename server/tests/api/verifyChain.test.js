const { buildScenario, as } = require('../support/fixtures');
const { hashEventData } = require('../../services/blockchain/hashCrypto');
const { raw } = require('../support/fakeDb');

/**
 * Verification must never report a damaged or incomplete ledger as valid, and every
 * violation must say what it found. Each test damages a copy of a real, valid chain.
 */
describe('Verifier: incomplete, orphaned and mis-indexed records', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario(); // AST-1001 (allocated), AST-1002, AST-1003 (unassigned), AST-1004
    await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: '  Cleaning  ', result: 'Done', maintenanceState: 'START' });
  });

  const verifyAsset = (asset) => as(s.users.auditor).post(`/api/assets/${asset._id}/verify-integrity`);

  test('an untouched chain verifies, in both the asset and full-ledger checks', async () => {
    const asset = await verifyAsset(s.assets.a1003);
    expect(asset.body.data.status).toBe('VERIFIED');
    const full = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(full.body.data.status).toBe('VERIFIED');
    expect(full.body.data.totalEvents).toBe(full.body.data.totalBlocks - 1); // every event has one block, plus genesis
  });

  test('an asset with NO lifecycle records is a violation, never a silent pass', async () => {
    const id = s.assets.a1004.assetId;
    raw('LifecycleEvent').splice(0, raw('LifecycleEvent').length, ...raw('LifecycleEvent').filter((e) => e.assetId !== id));
    raw('HashBlock').splice(0, raw('HashBlock').length, ...raw('HashBlock').filter((b) => b.assetId !== id));
    const res = await verifyAsset(s.assets.a1004);
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
    expect(res.body.data.violations[0].reason).toMatch(/No lifecycle records exist/);
  });

  test('a lifecycle record whose ledger block was deleted is reported by the full-ledger check', async () => {
    const event = raw('LifecycleEvent').find((e) => e.assetId === 'AST-1003' && e.eventType === 'MAINTENANCE');
    raw('HashBlock').splice(0, raw('HashBlock').length, ...raw('HashBlock').filter((b) => b.eventId !== event.eventId));
    const full = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(full.body.data.status).toBe('VIOLATION_DETECTED');
    expect(full.body.data.violations.some((v) => v.eventId === event.eventId && /has no ledger block/.test(v.reason))).toBe(true);
  });

  test('a record pointing at the wrong block index is detected', async () => {
    const event = raw('LifecycleEvent').find((e) => e.assetId === 'AST-1003' && e.eventType === 'MAINTENANCE');
    event.blockIndex += 1;
    const res = await verifyAsset(s.assets.a1003);
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
    expect(res.body.data.violations.some((v) => /different ledger block index/.test(v.reason))).toBe(true);
  });

  test('a changed description is a violation whose diagnosis explains the whitespace drift, and it is never green', async () => {
    const event = raw('LifecycleEvent').find((e) => e.assetId === 'AST-1003' && e.eventType === 'MAINTENANCE');
    event.description = 'Cleaning  '; // trailing whitespace the block never saw
    const res = await verifyAsset(s.assets.a1003);
    expect(res.body.data.verified).toBe(false);
    const v = res.body.data.violations.find((x) => /does not match its recorded hash/.test(x.reason));
    expect(v).toBeDefined();
    expect(v.diagnosis.join(' ')).toMatch(/whitespace/);
  });

  test('a legacy record with a missing field is still a violation, and the diagnosis says why it may look that way', async () => {
    const event = raw('LifecycleEvent').find((e) => e.assetId === 'AST-1003' && e.eventType === 'MAINTENANCE');
    const block = raw('HashBlock').find((b) => b.eventId === event.eventId);
    // Model a legacy write: the block was hashed with description '' (the write-time default),
    // but the stored record has no description field at all.
    block.eventDataHash = hashEventData({ ...event, description: '' });
    delete event.description;
    const res = await verifyAsset(s.assets.a1003);
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
    const v = res.body.data.violations.find((x) => /does not match its recorded hash/.test(x.reason));
    expect(v.diagnosis.join(' ')).toMatch(/no description/);
    expect(v.diagnosis.join(' ')).toMatch(/not proof of tampering/);
  });

  test('a ledger block that names the wrong asset is reported, not accepted', async () => {
    const block = raw('HashBlock').find((b) => b.assetId === 'AST-1003' && b.eventId !== 'GENESIS');
    block.assetId = 'AST-1002';
    const res = await verifyAsset(s.assets.a1003);
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
  });

  test('a genesis-looking block inserted in the middle of the chain is not trusted', async () => {
    const blocks = raw('HashBlock');
    const fake = { ...blocks[2], eventId: 'GENESIS', assetId: 'GENESIS' };
    blocks[2] = fake;
    const full = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(full.body.data.status).toBe('VIOLATION_DETECTED');
  });
});
