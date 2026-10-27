const { buildScenario, as, anonymous } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');

describe('External anchor endpoints (API, enforced server-side)', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  test('unauthenticated requests return 401', async () => {
    expect((await anonymous.get('/api/anchors')).status).toBe(401);
    expect((await anonymous.post('/api/anchors')).status).toBe(401);
  });

  test('EMPLOYEE and MANAGER cannot read anchors (403)', async () => {
    expect((await as(s.users.empA).get('/api/anchors')).status).toBe(403);
    expect((await as(s.users.manager).get('/api/anchors')).status).toBe(403);
  });

  test('AUDITOR can read anchors but cannot create them (403)', async () => {
    const read = await as(s.users.auditor).get('/api/anchors');
    expect(read.status).toBe(200);
    expect(read.body.data.verified).toBe(false);
    expect((await as(s.users.auditor).post('/api/anchors')).status).toBe(403);
    expect((await as(s.users.auditor).post('/api/anchors/refresh')).status).toBe(403);
  });

  test('with no anchor provider configured, ADMIN gets a clear 503 and nothing is written', async () => {
    const res = await as(s.users.admin).post('/api/anchors');
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/ANCHOR_PROVIDER/);
    expect(raw('AnchorRecord')).toHaveLength(0);
  });

  test('GET reports no anchors honestly when none exist', async () => {
    const res = await as(s.users.admin).get('/api/anchors');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NO_ANCHORS');
    expect(res.body.data.verified).toBe(false);
  });
});
