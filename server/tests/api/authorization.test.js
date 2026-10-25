const { buildScenario, as, anonymous } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');

describe('Role-based access control (API, enforced server-side)', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  // ─── Unauthenticated requests ───────────────────────────────────────────
  test('unauthenticated requests to protected endpoints return 401', async () => {
    for (const url of ['/api/assets', '/api/assets/AST-1001', '/api/lifecycle', '/api/reports/overview', '/api/users', '/api/audit-logs', '/api/integrity/full-chain']) {
      const res = await anonymous.get(url);
      expect(res.status).toBe(401);
    }
  });

  // ─── ADMIN ──────────────────────────────────────────────────────────────
  describe('ADMIN', () => {
    test('can access permitted global asset records (all four assets)', async () => {
      const res = await as(s.users.admin).get('/api/assets?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(4);
    });

    test('can access permitted user-management functions', async () => {
      const res = await as(s.users.admin).get('/api/users');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const u of res.body.data) {
        expect(u).not.toHaveProperty('passwordHash');
        expect(u).not.toHaveProperty('tokenVersion');
      }
    });

    test('can see the global lifecycle ledger and global reports', async () => {
      const ledger = await as(s.users.admin).get('/api/lifecycle?limit=100');
      expect(ledger.status).toBe(200);
      const overview = await as(s.users.admin).get('/api/reports/overview');
      expect(overview.status).toBe(200);
      expect(overview.body.data.totalAssets).toBe(4);
      expect(overview.body.data.scope).toBe('GLOBAL');
    });
  });

  // ─── MANAGER ────────────────────────────────────────────────────────────
  describe('MANAGER', () => {
    test('sees only assets in the explicitly assigned department', async () => {
      const res = await as(s.users.manager).get('/api/assets?limit=100');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((a) => a.assetId).sort();
      expect(ids).toEqual(['AST-1001', 'AST-1003']);
    });

    test('cannot read an unrelated department asset by Mongo id (404, not 403)', async () => {
      const res = await as(s.users.manager).get(`/api/assets/${s.assets.a1002._id}`);
      expect(res.status).toBe(404);
    });

    test('cannot read an unrelated department asset by assetId (404)', async () => {
      const res = await as(s.users.manager).get('/api/assets/AST-1004');
      expect(res.status).toBe(404);
    });

    test('cannot list an unrelated asset by filter or search (no data leakage)', async () => {
      const bySearch = await as(s.users.manager).get('/api/assets?search=AST-1002');
      expect(bySearch.body.pagination.total).toBe(0);
      const byDept = await as(s.users.manager).get(`/api/assets?departmentId=${s.departments.fin._id}`);
      expect(byDept.body.pagination.total).toBe(0);
    });

    test('cannot read lifecycle history of an out-of-scope asset', async () => {
      const res = await as(s.users.manager).get(`/api/assets/${s.assets.a1002._id}/lifecycle`);
      expect(res.status).toBe(404);
    });

    test('dashboard metrics are calculated only from the manager scope', async () => {
      const res = await as(s.users.manager).get('/api/reports/overview');
      expect(res.status).toBe(200);
      expect(res.body.data.scope).toBe('DEPARTMENTS');
      expect(res.body.data.totalAssets).toBe(2);
    });

    test('cannot access global reports or verification statistics', async () => {
      const res = await as(s.users.manager).get('/api/reports/lifecycle');
      expect(res.status).toBe(200);
      expect(res.body.data.verification).toBeNull();
      expect(res.body.data.scope).toBe('DEPARTMENTS');
    });

    test('cannot escalate their own role or grant themselves admin', async () => {
      const res = await as(s.users.manager).put(`/api/users/${s.users.manager._id}`).send({ role: 'ADMIN' });
      expect(res.status).toBe(403);
      expect(raw('User').find((u) => u.email === 'manager@t.test').role).toBe('MANAGER');
    });

    test('cannot manage users or read the user list', async () => {
      expect((await as(s.users.manager).get('/api/users')).status).toBe(403);
      expect((await as(s.users.manager).post('/api/users').send({ name: 'x', email: 'x@t.test', password: 'Long-enough-1', role: 'ADMIN' })).status).toBe(403);
    });

    test('cannot register assets or edit asset fields', async () => {
      const create = await as(s.users.manager).post('/api/assets').send({ assetId: 'AST-9999', name: 'X', category: 'Laptop', purchaseDate: '2024-01-01' });
      expect(create.status).toBe(403);
      const edit = await as(s.users.manager).put(`/api/assets/${s.assets.a1001._id}`).send({ name: 'Renamed' });
      expect(edit.status).toBe(403);
    });

    test('cannot dispose of assets (business rule: administrators only)', async () => {
      const res = await as(s.users.manager)
        .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
        .send({ eventType: 'DISPOSAL', disposalReason: 'EOL', authorizedBy: 'Someone', certificateReference: 'C-1' });
      expect(res.status).toBe(403);
    });

    test('can allocate an in-scope asset to an in-scope employee', async () => {
      const res = await as(s.users.manager)
        .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
        .send({ eventType: 'ALLOCATION', assignedToUserId: String(s.users.empA._id), departmentId: String(s.departments.itOps._id), location: 'HQ' });
      expect(res.status).toBe(201);
      expect(res.body.data.asset.assignedTo).toBe(String(s.users.empA._id));
    });

    test('cannot allocate to an employee outside their department', async () => {
      const res = await as(s.users.manager)
        .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
        .send({ eventType: 'ALLOCATION', assignedToUserId: String(s.users.empB._id), departmentId: String(s.departments.itOps._id), location: 'HQ' });
      expect(res.status).toBe(403);
    });

    test('cannot transfer an asset into a department outside their scope', async () => {
      const res = await as(s.users.manager)
        .post(`/api/assets/${s.assets.a1001._id}/lifecycle`)
        .send({ eventType: 'TRANSFER', newDepartmentId: String(s.departments.fin._id), newLocation: 'HQ', reason: 'Move' });
      expect(res.status).toBe(403);
      expect(raw('Asset').find((a) => a.assetId === 'AST-1001').departmentId).toBe(String(s.departments.itOps._id));
    });

    test('sees only their own managed department on the departments list', async () => {
      const res = await as(s.users.manager).get('/api/departments');
      expect(res.body.data.map((d) => d.code)).toEqual(['ITOPS']);
    });
  });

  // ─── EMPLOYEE ───────────────────────────────────────────────────────────
  describe('EMPLOYEE', () => {
    test('can view only the asset assigned to their own account', async () => {
      const res = await as(s.users.empA).get('/api/assets?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.data.map((a) => a.assetId)).toEqual(['AST-1001']);
    });

    test('can view their own asset details and QR passport', async () => {
      expect((await as(s.users.empA).get('/api/assets/AST-1001')).status).toBe(200);
      const qr = await as(s.users.empA).get(`/api/assets/${s.assets.a1001._id}/qr`);
      expect(qr.status).toBe(200);
      expect(qr.body.data.qrImage).toMatch(/^data:image\/png;base64,/);
    });

    test('IDOR/BOLA: employee A cannot retrieve employee B asset by changing the id', async () => {
      const byMongoId = await as(s.users.empA).get(`/api/assets/${s.assets.a1002._id}`);
      expect(byMongoId.status).toBe(404);
      const byAssetId = await as(s.users.empA).get('/api/assets/AST-1002');
      expect(byAssetId.status).toBe(404);
      const history = await as(s.users.empA).get(`/api/assets/${s.assets.a1002._id}/lifecycle`);
      expect(history.status).toBe(404);
      const qr = await as(s.users.empA).get(`/api/assets/${s.assets.a1002._id}/qr`);
      expect(qr.status).toBe(404);
    });

    test('cannot list the global inventory, even with broad filters', async () => {
      const res = await as(s.users.empA).get('/api/assets?limit=100&search=AST');
      expect(res.body.data.map((a) => a.assetId)).toEqual(['AST-1001']);
      expect(res.body.pagination.total).toBe(1);
    });

    test('search and filter endpoints do not leak other employees assets', async () => {
      const res = await as(s.users.empA).get('/api/assets?search=AST-1002');
      expect(res.body.pagination.total).toBe(0);
    });

    test('global lifecycle ledger returns only events for their own asset', async () => {
      const res = await as(s.users.empA).get('/api/lifecycle?limit=100');
      expect(res.status).toBe(200);
      const assetIds = new Set(res.body.data.map((e) => e.assetId));
      expect([...assetIds]).toEqual(['AST-1001']);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('cannot access global reports, dashboards overview, or audit logs', async () => {
      expect((await as(s.users.empA).get('/api/reports/overview')).status).toBe(403);
      expect((await as(s.users.empA).get('/api/reports/lifecycle')).status).toBe(403);
      expect((await as(s.users.empA).get('/api/audit-logs')).status).toBe(403);
    });

    test('cannot manage users, register or dispose of assets, or allocate', async () => {
      expect((await as(s.users.empA).get('/api/users')).status).toBe(403);
      expect((await as(s.users.empA).post('/api/assets').send({})).status).toBe(403);
      expect((await as(s.users.empA).put(`/api/assets/${s.assets.a1001._id}`).send({ name: 'x' })).status).toBe(403);
      const dispose = await as(s.users.empA)
        .post(`/api/assets/${s.assets.a1001._id}/lifecycle`)
        .send({ eventType: 'DISPOSAL', disposalReason: 'x', authorizedBy: 'x', certificateReference: 'x' });
      expect(dispose.status).toBe(403);
      const allocate = await as(s.users.empA)
        .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
        .send({ eventType: 'ALLOCATION', assignedToUserId: String(s.users.empA._id), departmentId: String(s.departments.itOps._id), location: 'x' });
      expect(allocate.status).toBe(403);
    });

    test('cannot access admin or manager-only routes such as verify-integrity or full chain', async () => {
      expect((await as(s.users.empA).post(`/api/assets/${s.assets.a1001._id}/verify-integrity`)).status).toBe(403);
      expect((await as(s.users.empA).get('/api/integrity/full-chain')).status).toBe(403);
    });

    test('cannot change ownership through a manipulated asset update body (mass assignment)', async () => {
      const res = await as(s.users.empA).put(`/api/assets/${s.assets.a1001._id}`).send({ assignedTo: String(s.users.empA._id) });
      expect(res.status).toBe(403);
      const stored = raw('Asset').find((a) => a.assetId === 'AST-1001');
      expect(stored.assignedTo).toBe(String(s.users.empA._id));
    });

    test('cannot change their own role, status or department through the users API', async () => {
      const res = await as(s.users.empA).put(`/api/users/${s.users.empA._id}`).send({ role: 'ADMIN' });
      expect(res.status).toBe(403);
      expect(raw('User').find((u) => u.email === 'a@t.test').role).toBe('EMPLOYEE');
    });

    test('has a read-only view of their own profile and department', async () => {
      const res = await as(s.users.empA).get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data.role).toBe('EMPLOYEE');
    });
  });

  // ─── AUDITOR ────────────────────────────────────────────────────────────
  describe('AUDITOR (read-only at the API level)', () => {
    test('can read all authorized asset records and lifecycle history', async () => {
      const res = await as(s.users.auditor).get('/api/assets?limit=100');
      expect(res.body.pagination.total).toBe(4);
      expect((await as(s.users.auditor).get(`/api/assets/${s.assets.a1001._id}/lifecycle`)).status).toBe(200);
    });

    test('cannot mutate assets, lifecycle, QR, users, or departments', async () => {
      const auditor = as(s.users.auditor);
      expect((await auditor.post('/api/assets').send({ assetId: 'AST-9', name: 'x', category: 'Laptop', purchaseDate: '2024-01-01' })).status).toBe(403);
      expect((await auditor.put(`/api/assets/${s.assets.a1001._id}`).send({ name: 'x' })).status).toBe(403);
      expect((await auditor.post(`/api/assets/${s.assets.a1003._id}/lifecycle`).send({ eventType: 'MAINTENANCE', description: 'x', result: 'y' })).status).toBe(403);
      expect((await auditor.post(`/api/assets/${s.assets.a1003._id}/qr`)).status).toBe(403);
      expect((await auditor.put(`/api/users/${s.users.empA._id}`).send({ role: 'ADMIN' })).status).toBe(403);
      expect((await auditor.post('/api/departments').send({ name: 'Legal' })).status).toBe(403);
    });

    test('can run integrity verification and read audit logs and full-chain status', async () => {
      expect((await as(s.users.auditor).post(`/api/assets/${s.assets.a1001._id}/verify-integrity`)).status).toBe(200);
      expect((await as(s.users.auditor).get('/api/integrity/full-chain')).status).toBe(200);
      expect((await as(s.users.auditor).get('/api/audit-logs')).status).toBe(200);
    });

    test('cannot modify users or read the user management list', async () => {
      expect((await as(s.users.auditor).get('/api/users')).status).toBe(403);
    });
  });
});
