const { buildScenario, as } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');

describe('Assets, ownership and lifecycle rules', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  const registerBody = (overrides = {}) => ({
    assetId: 'AST-2001',
    name: 'New Laptop',
    category: 'Laptop',
    brand: 'Dell',
    model: 'Latitude 5440',
    serialNumber: 'SN-NEW-1',
    purchaseDate: '2025-01-10',
    purchaseCost: 1400,
    location: 'HQ - Floor 1',
    departmentId: String(s.departments.itOps._id),
    ...overrides,
  });

  test('admin registers an asset: 201, a REGISTRATION event and a hash block are written', async () => {
    const res = await as(s.users.admin).post('/api/assets').send(registerBody());
    expect(res.status).toBe(201);
    expect(res.body.data.registrationEvent.eventType).toBe('REGISTRATION');
    expect(res.body.data.asset.status).toBe('ACTIVE');
    expect(res.body.data.asset.dppId).toBe('DPP-AST-2001');
    expect(res.body.data.registrationEvent.currentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw('HashBlock').some((b) => b.eventId === res.body.data.registrationEvent.eventId)).toBe(true);
  });

  test('mass assignment on registration: status, owner, assignee and createdBy are ignored', async () => {
    const res = await as(s.users.admin)
      .post('/api/assets')
      .send(registerBody({ status: 'DISPOSED', owner: 'Hacker', assignedTo: String(s.users.empB._id), createdBy: 'x', dppId: 'DPP-HIJACK' }));
    expect(res.status).toBe(201);
    expect(res.body.data.asset.status).toBe('ACTIVE');
    expect(res.body.data.asset.assignedTo).toBeNull();
    expect(res.body.data.asset.owner).toBe('');
    expect(res.body.data.asset.dppId).toBe('DPP-AST-2001');
  });

  test('duplicate asset IDs and serial numbers are rejected with 409', async () => {
    expect((await as(s.users.admin).post('/api/assets').send(registerBody({ assetId: 'AST-1001' }))).status).toBe(409);
    expect((await as(s.users.admin).post('/api/assets').send(registerBody({ serialNumber: 'SN-AST-1001' }))).status).toBe(409);
  });

  test('categories are validated against the allowed list', async () => {
    const res = await as(s.users.admin).post('/api/assets').send(registerBody({ category: 'Spaceship' }));
    expect(res.status).toBe(400);
  });

  test('admin allocates an asset to an employee: assignee is stored by stable id and recorded in history', async () => {
    const res = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'ALLOCATION', assignedToUserId: String(s.users.empA._id), departmentId: String(s.departments.itOps._id), location: 'HQ - Floor 2' });
    expect(res.status).toBe(201);
    expect(res.body.data.asset.assignedTo).toBe(String(s.users.empA._id));
    expect(res.body.data.asset.owner).toBe('Employee A');
    expect(res.body.data.event.metadata.assignedToUserId).toBe(String(s.users.empA._id));
    expect(res.body.data.event.performedByName).toBe('Admin');
  });

  test('allocation requires an active EMPLOYEE account', async () => {
    const toAuditor = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'ALLOCATION', assignedToUserId: String(s.users.auditor._id), departmentId: String(s.departments.itOps._id), location: 'x' });
    expect(toAuditor.status).toBe(400);
    const toInactive = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'ALLOCATION', assignedToUserId: String(s.users.inactive._id), departmentId: String(s.departments.itOps._id), location: 'x' });
    expect(toInactive.status).toBe(400);
  });

  test('ownership cannot be changed through a plain asset update (owner/department/status are refused)', async () => {
    for (const body of [{ owner: 'Someone' }, { assignedTo: String(s.users.empB._id) }, { departmentId: String(s.departments.fin._id) }, { status: 'DISPOSED' }]) {
      const res = await as(s.users.admin).put(`/api/assets/${s.assets.a1003._id}`).send(body);
      expect(res.status).toBe(400);
    }
    const stored = raw('Asset').find((a) => a.assetId === 'AST-1003');
    expect(stored.status).toBe('ACTIVE');
    expect(stored.departmentId).toBe(String(s.departments.itOps._id));
  });

  test('descriptive fields can be updated by an administrator', async () => {
    const res = await as(s.users.admin).put(`/api/assets/${s.assets.a1003._id}`).send({ warranty: '5 years', location: 'Warehouse' });
    expect(res.status).toBe(200);
    expect(res.body.data.warranty).toBe('5 years');
    expect(res.body.data.location).toBe('Warehouse');
  });

  test('maintenance start then complete returns the asset to ACTIVE (state machine)', async () => {
    const start = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Fan replaced', result: 'Pending', maintenanceState: 'START' });
    expect(start.status).toBe(201);
    expect(start.body.data.asset.status).toBe('MAINTENANCE');

    const doubleStart = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Again', result: 'x', maintenanceState: 'START' });
    expect(doubleStart.status).toBe(409);

    const complete = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Fan replaced', result: 'Completed', maintenanceState: 'COMPLETE' });
    expect(complete.status).toBe(201);
    expect(complete.body.data.asset.status).toBe('ACTIVE');
  });

  test('transfer keeps maintenance state and records previous and new owner in history', async () => {
    await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1001._id}/lifecycle`)
      .send({ eventType: 'MAINTENANCE', description: 'Battery', result: 'Pending', maintenanceState: 'START' });

    const res = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1001._id}/lifecycle`)
      .send({ eventType: 'TRANSFER', newDepartmentId: String(s.departments.fin._id), newLocation: 'HQ - Floor 4', reason: 'Move', newAssignedToUserId: String(s.users.empB._id) });
    expect(res.status).toBe(201);
    expect(res.body.data.asset.status).toBe('MAINTENANCE');
    expect(res.body.data.asset.assignedTo).toBe(String(s.users.empB._id));
    expect(res.body.data.event.metadata.previousAssignedTo).toBe(String(s.users.empA._id));
    expect(res.body.data.event.metadata.newAssignedToUserId).toBe(String(s.users.empB._id));
  });

  test('disposal is administrator-only, is final, and blocks further lifecycle events and edits', async () => {
    const disposal = { eventType: 'DISPOSAL', disposalReason: 'End of life', authorizedBy: 'IT Director', certificateReference: 'CERT-7' };
    const res = await as(s.users.admin).post(`/api/assets/${s.assets.a1003._id}/lifecycle`).send(disposal);
    expect(res.status).toBe(201);
    expect(res.body.data.asset.status).toBe('DISPOSED');

    const after = await as(s.users.admin).post(`/api/assets/${s.assets.a1003._id}/lifecycle`).send({ eventType: 'MAINTENANCE', description: 'x', result: 'y', maintenanceState: 'START' });
    expect(after.status).toBe(409);
    const edit = await as(s.users.admin).put(`/api/assets/${s.assets.a1003._id}`).send({ name: 'Changed' });
    expect(edit.status).toBe(409);
  });

  test('lifecycle payloads cannot smuggle operators or extra ownership fields', async () => {
    const res = await as(s.users.admin)
      .post(`/api/assets/${s.assets.a1003._id}/lifecycle`)
      .send({ eventType: 'ALLOCATION', assignedToUserId: { $ne: null }, departmentId: String(s.departments.itOps._id), location: 'x' });
    expect(res.status).toBe(400);
  });

  test('REGISTRATION cannot be recorded manually', async () => {
    const res = await as(s.users.admin).post(`/api/assets/${s.assets.a1003._id}/lifecycle`).send({ eventType: 'REGISTRATION' });
    expect(res.status).toBe(400);
  });

  test('search is treated literally: regex metacharacters match nothing unexpected (ReDoS/injection)', async () => {
    const res = await as(s.users.admin).get('/api/assets?search=.*');
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
  });

  test('user search is also escaped', async () => {
    const res = await as(s.users.admin).get('/api/users?search=.*');
    expect(res.body.pagination.total).toBe(0);
  });

  test('unknown sort fields fall back to the safe default instead of being used', async () => {
    const res = await as(s.users.admin).get('/api/assets?sortBy=passwordHash');
    expect(res.status).toBe(200);
  });

  test('the public-facing QR/verification issuance is recorded and scoped for managers', async () => {
    const own = await as(s.users.manager).post(`/api/assets/${s.assets.a1003._id}/qr`);
    expect(own.status).toBe(200);
    expect(own.body.data.qrGenerated).toBe(true);
    const outside = await as(s.users.manager).post(`/api/assets/${s.assets.a1002._id}/qr`);
    expect(outside.status).toBe(404);
  });

  test('department lists are scoped and department names stay in step when renamed', async () => {
    const created = await as(s.users.admin).post('/api/departments').send({ name: 'Legal', code: 'LEG' });
    expect(created.status).toBe(201);
    const dup = await as(s.users.admin).post('/api/departments').send({ name: 'Legal' });
    expect(dup.status).toBe(409);

    const renamed = await as(s.users.admin).put(`/api/departments/${s.departments.fin._id}`).send({ name: 'Finance & Accounts' });
    expect(renamed.status).toBe(200);
    expect(raw('Asset').find((a) => a.assetId === 'AST-1002').department).toBe('Finance & Accounts');
    expect(raw('User').find((u) => u.email === 'b@t.test').department).toBe('Finance & Accounts');
  });

  test('assignable employee list is scoped to the manager’s departments', async () => {
    const res = await as(s.users.manager).get('/api/users/assignable');
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.name)).toEqual(['Employee A']);
    const outside = await as(s.users.manager).get(`/api/users/assignable?departmentId=${s.departments.fin._id}`);
    expect(outside.status).toBe(403);
  });
});
