const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../../server');
const { signToken } = require('../../utils/token');
const { ensureGenesisBlock } = require('../../services/blockchain/hashChain');
const { registerAsset, recordLifecycleEvent } = require('../../services/lifecycleService');
const { models, raw } = require('./fakeDb');

const PASSWORD = 'Correct-Horse-9';

/**
 * Builds the same scenario the dev seed uses:
 *   ITOPS  – manager's department (in scope)
 *   FIN    – unrelated department (out of scope for the manager)
 *   Employee A (ITOPS) owns AST-1001; Employee B (FIN) owns AST-1002
 */
async function buildScenario() {
  await ensureGenesisBlock();
  const hash = await bcrypt.hash(PASSWORD, 4);

  const itOps = await models.Department.create({ name: 'IT Operations', code: 'ITOPS' });
  const fin = await models.Department.create({ name: 'Finance', code: 'FIN' });

  const mk = (fields) => models.User.create({ passwordHash: hash, status: 'ACTIVE', ...fields });
  const admin = await mk({ name: 'Admin', email: 'admin@t.test', role: 'ADMIN', departmentId: itOps._id, department: 'IT Operations' });
  const manager = await mk({
    name: 'Manager',
    email: 'manager@t.test',
    role: 'MANAGER',
    departmentId: itOps._id,
    department: 'IT Operations',
    managedDepartmentIds: [itOps._id],
  });
  const empA = await mk({ name: 'Employee A', email: 'a@t.test', role: 'EMPLOYEE', departmentId: itOps._id, department: 'IT Operations' });
  const empB = await mk({ name: 'Employee B', email: 'b@t.test', role: 'EMPLOYEE', departmentId: fin._id, department: 'Finance' });
  const auditor = await mk({ name: 'Auditor', email: 'auditor@t.test', role: 'AUDITOR' });
  const inactive = await mk({ name: 'Left Employee', email: 'left@t.test', role: 'EMPLOYEE', status: 'INACTIVE', departmentId: itOps._id, department: 'IT Operations' });

  const users = { admin, manager, empA, empB, auditor, inactive };

  const asset = async (assetId, dept, assignee) => {
    const { asset: created } = await registerAsset({
      actor: admin,
      fields: {
        assetId,
        name: `Asset ${assetId}`,
        category: 'Laptop',
        brand: 'Dell',
        model: 'Latitude',
        serialNumber: `SN-${assetId}`,
        purchaseDate: new Date('2024-01-01'),
        purchaseCost: 1000,
        location: 'HQ',
        departmentId: dept._id,
        department: dept.name,
        assignedTo: null,
        owner: '',
      },
    });
    if (assignee) {
      await recordLifecycleEvent({
        assetObjectId: created._id,
        actor: admin,
        plan: () => ({
          allowedFrom: ['ACTIVE'],
          eventType: 'ALLOCATION',
          description: `Asset allocated to ${dept.name}.`,
          metadata: { assignedToUserId: String(assignee._id), departmentId: String(dept._id) },
          updates: { assignedTo: assignee._id, owner: assignee.name, departmentId: dept._id, department: dept.name },
          nextStatus: 'ACTIVE',
        }),
      });
    }
    return raw('Asset').find((a) => a.assetId === assetId);
  };

  const assets = {
    a1001: await asset('AST-1001', itOps, empA), // employee A's, in manager scope
    a1002: await asset('AST-1002', fin, empB), // employee B's, OUT of manager scope
    a1003: await asset('AST-1003', itOps, null), // unassigned, in manager scope
    a1004: await asset('AST-1004', fin, null), // unassigned, OUT of manager scope
  };

  return { departments: { itOps, fin }, users, assets, PASSWORD };
}

/** Bearer token for a stored user (the middleware still reloads the user from the store). */
function tokenFor(user) {
  return signToken(user);
}

function as(user) {
  const token = tokenFor(user);
  return {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
  };
}

const anonymous = {
  get: (url) => request(app).get(url),
  post: (url) => request(app).post(url),
  put: (url) => request(app).put(url),
};

module.exports = { buildScenario, as, anonymous, tokenFor, app, PASSWORD };
