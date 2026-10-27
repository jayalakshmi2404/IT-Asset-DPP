const request = require('supertest');
const { app } = require('../../server');
const { buildScenario, as } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');
const { resetProviderCache } = require('../../services/anchoring');

describe('Public verification shows anchor status without private data or chain calls', () => {
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

  test('before any anchor, the public page reports anchoring as not configured and still verifies', async () => {
    delete process.env.ANCHOR_PROVIDER;
    resetProviderCache();
    const res = await request(app).get('/api/verify/DPP-AST-1001');
    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.anchoring.configured).toBe(false);
  });

  test('a simulated anchor is labelled as simulated on every event, with no explorer link', async () => {
    await as(s.users.admin).post('/api/anchors');
    await as(s.users.admin).post('/api/anchors/refresh');
    const res = await request(app).get('/api/verify/DPP-AST-1001');
    expect(res.body.data.anchoring.latest).toMatchObject({ simulated: true, modeLabel: 'MOCK / SIMULATED', explorerUrl: null, localCheck: 'MATCHES_LEDGER' });
    const labels = res.body.data.lifecycle.map((e) => e.anchor.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l === 'ANCHORED_SIMULATED')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/Sepolia|etherscan/i);
  });

  test('the public response never contains names, secrets or the anchor database fields', async () => {
    await as(s.users.admin).post('/api/anchors');
    await as(s.users.admin).post('/api/anchors/refresh');
    process.env.ANCHOR_PRIVATE_KEY = '0x' + 'cd'.repeat(32);
    const body = JSON.stringify((await request(app).get('/api/verify/DPP-AST-1001')).body);
    expect(body).not.toContain('Employee A');
    expect(body).not.toContain('Admin');
    expect(body).not.toContain('createdByName');
    expect(body).not.toContain('cd'.repeat(32));
    if (process.env.JWT_SECRET) expect(body).not.toContain(process.env.JWT_SECRET);
    delete process.env.ANCHOR_PRIVATE_KEY;
  });

  test('a ledger block changed after anchoring is flagged on the public page', async () => {
    await as(s.users.admin).post('/api/anchors');
    await as(s.users.admin).post('/api/anchors/refresh');
    const anchored = raw('AnchorRecord')[0].blockIndex;
    raw('HashBlock').find((b) => b.index === anchored).currentHash = '0'.repeat(64);
    const res = await request(app).get('/api/verify/DPP-AST-1001');
    expect(res.body.data.anchoring.latest.localCheck).toBe('LEDGER_HASH_CHANGED');
    expect(res.body.data.lifecycle.some((e) => e.anchor.label === 'ANCHOR_PROBLEM')).toBe(true);
  });

  test('public lookups never write anchor records', async () => {
    await as(s.users.admin).post('/api/anchors');
    const anchorsBefore = raw('AnchorRecord').length;
    const txBefore = raw('MockAnchorTx').length;
    await request(app).get('/api/verify/DPP-AST-1001');
    await request(app).get('/api/verify/asset/AST-1001');
    expect(raw('AnchorRecord')).toHaveLength(anchorsBefore);
    expect(raw('MockAnchorTx')).toHaveLength(txBefore);
  });
});
