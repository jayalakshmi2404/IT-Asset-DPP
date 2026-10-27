const { buildScenario, as, anonymous } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');
const { resetProviderCache } = require('../../services/anchoring');

describe('Mock anchoring over the API (simulated, offline)', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
    process.env.ANCHOR_PROVIDER = 'mock';
    delete process.env.ANCHOR_RPC_URL;
    delete process.env.ANCHOR_PRIVATE_KEY;
    resetProviderCache();
  });
  afterEach(() => {
    delete process.env.ANCHOR_PROVIDER;
    resetProviderCache();
  });

  test('administrator can simulate an anchor and the response is clearly labelled', async () => {
    const res = await as(s.users.admin).post('/api/anchors');
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.providerInfo).toMatchObject({ kind: 'mock', simulated: true, real: false, label: 'Mock Mode — Simulated, No Real Blockchain' });
    expect(res.body.data.simulated).toBe(true);
    expect(res.body.data.txRef.startsWith('MOCK-SIM-')).toBe(true);
    expect(res.body.data.network).toBe('MOCK (no network)');
  });

  test('a second request for the same head returns the existing simulated anchor', async () => {
    await as(s.users.admin).post('/api/anchors');
    const again = await as(s.users.admin).post('/api/anchors');
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(raw('AnchorRecord')).toHaveLength(1);
  });

  test('refresh confirms the simulated anchor and verification passes', async () => {
    await as(s.users.admin).post('/api/anchors');
    const refreshed = await as(s.users.admin).post('/api/anchors/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.updated).toEqual([expect.objectContaining({ status: 'CONFIRMED' })]);
    const check = await as(s.users.auditor).get('/api/anchors');
    expect(check.body.data.status).toBe('VERIFIED');
    expect(check.body.data.verified).toBe(true);
    expect(check.body.data.anchors[0].simulated).toBe(true);
  });

  test('a changed simulated record is reported as a mismatch through the API', async () => {
    await as(s.users.admin).post('/api/anchors');
    await as(s.users.admin).post('/api/anchors/refresh');
    raw('MockAnchorTx')[0].payload = 'DPP-ANCHOR|v1|0|' + '0'.repeat(64);
    const check = await as(s.users.admin).get('/api/anchors');
    expect(check.body.data.status).toBe('VIOLATION_DETECTED');
    expect(check.body.data.verified).toBe(false);
  });

  test('auditor can view but cannot create or refresh anchors', async () => {
    expect((await as(s.users.auditor).get('/api/anchors')).status).toBe(200);
    expect((await as(s.users.auditor).post('/api/anchors')).status).toBe(403);
    expect((await as(s.users.auditor).post('/api/anchors/refresh')).status).toBe(403);
    expect(raw('AnchorRecord')).toHaveLength(0);
  });

  test('manager and employee get no access to anchors', async () => {
    expect((await as(s.users.manager).post('/api/anchors')).status).toBe(403);
    expect((await as(s.users.empA).get('/api/anchors')).status).toBe(403);
    expect((await anonymous.post('/api/anchors')).status).toBe(401);
  });

  test('every anchor action is written to the audit log', async () => {
    await as(s.users.admin).post('/api/anchors');
    await as(s.users.auditor).get('/api/anchors');
    const actions = raw('AuditLog').map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['ANCHOR_CREATED', 'ANCHOR_VERIFICATION']));
  });

  test('responses never contain secrets from the environment', async () => {
    process.env.ANCHOR_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
    await as(s.users.admin).post('/api/anchors');
    const body = JSON.stringify((await as(s.users.admin).get('/api/anchors')).body);
    expect(body).not.toContain('ab'.repeat(32));
    expect(body).not.toContain(process.env.JWT_SECRET);
    delete process.env.ANCHOR_PRIVATE_KEY;
  });

  test('existing DPP and ledger reads are unaffected by anchoring', async () => {
    await as(s.users.admin).post('/api/anchors');
    const assets = await as(s.users.admin).get('/api/assets?limit=100');
    expect(assets.status).toBe(200);
    expect(assets.body.pagination.total).toBe(4);
    const chain = await as(s.users.admin).get('/api/integrity/full-chain');
    expect(chain.body.data.verified).toBe(true);
  });
});

describe('Anchoring disabled (ANCHOR_PROVIDER unset)', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
    delete process.env.ANCHOR_PROVIDER;
    resetProviderCache();
  });

  test('admin gets a clear refusal and nothing is written', async () => {
    const res = await as(s.users.admin).post('/api/anchors');
    expect(res.status).toBe(503);
    expect(raw('AnchorRecord')).toHaveLength(0);
    expect(raw('MockAnchorTx')).toHaveLength(0);
  });

  test('status reports the disabled state and never claims verification', async () => {
    const res = await as(s.users.admin).get('/api/anchors');
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.status).toBe('NO_ANCHORS');
  });
});
