const request = require('supertest');
const { buildScenario, app, as } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');

describe('Public verification (QR, login-free) does not expose personal data', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
    await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1001._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Replaced keyboard for Employee A', result: 'Done', maintenanceState: 'START' });
  });

  test('verification by DPP id works without login and reports VERIFIED', async () => {
    const res = await request(app).get('/api/verify/DPP-AST-1001');
    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.asset.dppId).toBe('DPP-AST-1001');
  });

  test('the public payload omits owner, assignee, performer names and maintenance free text', async () => {
    const res = await request(app).get('/api/verify/asset/AST-1001');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Employee A');
    expect(body).not.toContain('Admin');
    expect(body).not.toContain('Replaced keyboard');
    expect(body).not.toContain('assignedTo');
    expect(body).not.toContain('passwordHash');
    expect(res.body.data.lifecycle.find((e) => e.eventType === 'MAINTENANCE').description).toBe('Maintenance event recorded.');
  });

  test('an unknown DPP id returns 404 and is logged', async () => {
    const res = await request(app).get('/api/verify/DPP-NOPE');
    expect(res.status).toBe(404);
    expect(raw('AuditLog').some((l) => l.action === 'PUBLIC_VERIFICATION' && l.result === 'FAILURE')).toBe(true);
  });

  test('public lookups are not able to pattern-match with regex metacharacters', async () => {
    const res = await request(app).get('/api/verify/asset/.*');
    expect(res.status).toBe(404);
  });

  test('a tampered asset shows a violation on the public page', async () => {
    raw('LifecycleEvent').find((e) => e.assetId === 'AST-1001').description = 'Asset allocated to Hacked Dept.';
    const res = await request(app).get('/api/verify/DPP-AST-1001');
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.status).toBe('VIOLATION_DETECTED');
  });
});
