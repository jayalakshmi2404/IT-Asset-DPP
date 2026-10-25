const request = require('supertest');
const { buildScenario, as, anonymous, app, PASSWORD } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');
const { signToken } = require('../../utils/token');

describe('Authentication and sessions', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  test('valid credentials succeed and return a token without password data', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@t.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('EMPLOYEE');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$/);
  });

  test('invalid password and unknown email return the same message (no account enumeration)', async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'a@t.test', password: 'wrong-password' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@t.test', password: 'wrong-password' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  test('an inactive account is refused even with the correct password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'left@t.test', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  test('NoSQL operator injection in the login body is rejected', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('malformed JSON returns 400 without a stack trace', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Malformed JSON request body.');
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+|\.js:/);
  });

  test('a missing or invalid bearer token returns 401', async () => {
    expect((await anonymous.get('/api/assets')).status).toBe(401);
    expect((await request(app).get('/api/assets').set('Authorization', 'Bearer not-a-real-token')).status).toBe(401);
    expect((await request(app).get('/api/assets').set('Authorization', 'Basic abc')).status).toBe(401);
  });

  test('a token signed with a different secret is rejected', async () => {
    const forged = require('jsonwebtoken').sign({ sub: String(s.users.admin._id), tv: 0 }, 'attacker-controlled-secret-value-000000', { issuer: 'it-asset-dpp', audience: 'it-asset-dpp-client' });
    expect((await request(app).get('/api/assets').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  test('an unsigned (alg=none) token is rejected', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: String(s.users.admin._id), tv: 0, iss: 'it-asset-dpp', aud: 'it-asset-dpp-client' })).toString('base64url');
    const res = await request(app).get('/api/assets').set('Authorization', `Bearer ${header}.${payload}.`);
    expect(res.status).toBe(401);
  });

  test('an inactive user cannot use an existing token on protected endpoints', async () => {
    const token = signToken(s.users.empA);
    raw('User').find((u) => u.email === 'a@t.test').status = 'INACTIVE';
    const res = await request(app).get('/api/assets').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('logout revokes the session: the same token is refused afterwards', async () => {
    const token = signToken(s.users.empA);
    expect((await request(app).get('/api/assets').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/api/assets').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  test('role changes take effect on the next request without waiting for token expiry', async () => {
    const managerToken = signToken(s.users.manager);
    expect((await request(app).get('/api/reports/overview').set('Authorization', `Bearer ${managerToken}`)).status).toBe(200);

    // An administrator demotes the manager to EMPLOYEE
    await as(s.users.admin).put(`/api/users/${s.users.manager._id}`).send({ role: 'EMPLOYEE' });

    // The old token is refused outright: its session version is stale
    expect((await request(app).get('/api/reports/overview').set('Authorization', `Bearer ${managerToken}`)).status).toBe(401);
    // A fresh login reflects the new role
    const fresh = await request(app).post('/api/auth/login').send({ email: 'manager@t.test', password: PASSWORD });
    expect(fresh.body.data.user.role).toBe('EMPLOYEE');
    expect((await request(app).get('/api/reports/overview').set('Authorization', `Bearer ${fresh.body.data.token}`)).status).toBe(403);
  });

  test('deactivating a user ends their existing sessions immediately', async () => {
    const token = signToken(s.users.manager);
    await as(s.users.admin).put(`/api/users/${s.users.manager._id}`).send({ status: 'INACTIVE' });
    expect((await request(app).get('/api/assets').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  test('self-service password change requires the current password and revokes other sessions', async () => {
    const token = signToken(s.users.empA);
    const wrong = await as(s.users.empA).put('/api/auth/me/password').send({ currentPassword: 'nope-nope', newPassword: 'Brand-new-pass-1' });
    expect(wrong.status).toBe(401);

    const ok = await as(s.users.empA).put('/api/auth/me/password').send({ currentPassword: PASSWORD, newPassword: 'Brand-new-pass-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toEqual(expect.any(String));

    // Old token revoked; the new token from the response still works
    expect((await request(app).get('/api/assets').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await request(app).get('/api/assets').set('Authorization', `Bearer ${ok.body.data.token}`)).status).toBe(200);

    const relogin = await request(app).post('/api/auth/login').send({ email: 'a@t.test', password: 'Brand-new-pass-1' });
    expect(relogin.status).toBe(200);
  });

  test('an administrator cannot demote or deactivate their own account', async () => {
    const self = await as(s.users.admin).put(`/api/users/${s.users.admin._id}`).send({ role: 'MANAGER' });
    expect(self.status).toBe(400);
    const deactivate = await as(s.users.admin).put(`/api/users/${s.users.admin._id}`).send({ status: 'INACTIVE' });
    expect(deactivate.status).toBe(400);
  });

  test('user updates reject unknown fields such as passwordHash or tokenVersion (mass assignment)', async () => {
    const res = await as(s.users.admin).put(`/api/users/${s.users.empA._id}`).send({ tokenVersion: 0, passwordHash: 'x' });
    expect(res.status).toBe(400);
  });

  test('the server refuses to start with a weak or placeholder JWT secret', () => {
    const { validateConfig } = require('../../config/env');
    expect(validateConfig({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'short' }).length).toBeGreaterThan(0);
    expect(validateConfig({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'your-strong-secret-change-me-please-123' }).join(' ')).toMatch(/placeholder/);
    expect(validateConfig({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'a'.repeat(40) })).toEqual([]);
  });
});
