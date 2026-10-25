/**
 * DEVELOPMENT-ONLY seed. Creates departments, role accounts, and assets with a
 * valid hash chain so every role can be exercised end to end.
 *
 *   npm run seed:dev            # refuses to run if users already exist
 *   npm run seed:dev -- --reset # drops the application collections first (dev only)
 *
 * Passwords come from SEED_PASSWORD. If it is not set, a random password is
 * generated and printed once. Nothing here is hard-coded.
 *
 * Assets are created through the REAL lifecycle service, so the hash chain is
 * produced by the same code the application uses. The seed then verifies the
 * whole chain and exits non-zero if anything does not verify.
 *
 * Requires MongoDB running as a replica set (transactions). See README.
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/db');
const { ensureGenesisBlock } = require('../services/blockchain/hashChain');
const { registerAsset, recordLifecycleEvent } = require('../services/lifecycleService');
const { verifyFullChain, verifyAssetChain } = require('../services/verification/verifyChain');
const User = require('../models/User');
const Department = require('../models/Department');
const Asset = require('../models/Asset');
const LifecycleEvent = require('../models/LifecycleEvent');
const HashBlock = require('../models/HashBlock');
const AuditLog = require('../models/AuditLog');

const RESET = process.argv.includes('--reset');
const ACCOUNT_DOMAIN = 'example.test'; // reserved domain: never deliverable

function fail(message) {
  console.error(`[seed] ${message}`);
  process.exit(1);
}

function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function resetCollections() {
  await Promise.all([User, Department, Asset, LifecycleEvent, HashBlock, AuditLog].map((m) => m.deleteMany({})));
}

async function main() {
  if (process.env.NODE_ENV === 'production') fail('Refusing to seed: NODE_ENV is production.');

  await connectDB();

  if (RESET) {
    console.log('[seed] --reset: clearing application collections (development only)');
    await resetCollections();
  } else if (await User.exists({})) {
    fail('Users already exist. Re-run with --reset to rebuild the development dataset.');
  }

  await ensureGenesisBlock();

  const password = process.env.SEED_PASSWORD || randomPassword();
  if (password.length < 8) fail('SEED_PASSWORD must be at least 8 characters.');
  const passwordHash = await bcrypt.hash(password, 12);

  // ── Departments ─────────────────────────────────────────────────────────
  const [itOps, finance, engineering] = await Department.create([
    { name: 'IT Operations', code: 'ITOPS' },
    { name: 'Finance', code: 'FIN' },
    { name: 'Engineering', code: 'ENG' },
  ]);

  // ── Accounts ────────────────────────────────────────────────────────────
  const accounts = [
    { key: 'admin', name: 'Dev Administrator', email: `admin@${ACCOUNT_DOMAIN}`, role: 'ADMIN', department: itOps },
    { key: 'manager', name: 'Dev Manager (IT Ops)', email: `manager@${ACCOUNT_DOMAIN}`, role: 'MANAGER', department: itOps, managed: [itOps] },
    { key: 'employeeA', name: 'Employee A (IT Ops)', email: `employee.a@${ACCOUNT_DOMAIN}`, role: 'EMPLOYEE', department: itOps },
    { key: 'employeeB', name: 'Employee B (Finance)', email: `employee.b@${ACCOUNT_DOMAIN}`, role: 'EMPLOYEE', department: finance },
    { key: 'auditor', name: 'Dev Auditor', email: `auditor@${ACCOUNT_DOMAIN}`, role: 'AUDITOR', department: engineering },
    { key: 'inactive', name: 'Inactive Employee', email: `inactive@${ACCOUNT_DOMAIN}`, role: 'EMPLOYEE', department: engineering, status: 'INACTIVE' },
  ];

  const users = {};
  for (const a of accounts) {
    users[a.key] = await User.create({
      name: a.name,
      email: a.email,
      passwordHash,
      role: a.role,
      status: a.status || 'ACTIVE',
      departmentId: a.department._id,
      department: a.department.name,
      managedDepartmentIds: a.managed ? a.managed.map((d) => d._id) : [],
    });
  }

  // ── Assets with lifecycle history (through the real service) ───────────
  const actor = users.admin;
  const register = (assetId, name, category, brand, model, dept, location, extra = {}) =>
    registerAsset({
      actor,
      fields: {
        assetId,
        name,
        category,
        brand,
        model,
        serialNumber: `SN-${assetId}`,
        purchaseDate: new Date('2024-03-15'),
        purchaseCost: 1200,
        warranty: '3 years',
        location,
        departmentId: dept._id,
        department: dept.name,
        assignedTo: null,
        owner: '',
        ...extra,
      },
    }).then((r) => r.asset);

  const allocate = (asset, user, dept, location) =>
    recordLifecycleEvent({
      assetObjectId: asset._id,
      actor,
      plan: (a) => ({
        allowedFrom: ['ACTIVE'],
        eventType: 'ALLOCATION',
        description: `Asset allocated to ${dept.name}.`,
        metadata: { previousAssignedTo: a.assignedTo ? String(a.assignedTo) : null, assignedToUserId: String(user._id), departmentId: String(dept._id), departmentName: dept.name, location },
        updates: { assignedTo: user._id, owner: user.name, departmentId: dept._id, department: dept.name, location },
        nextStatus: 'ACTIVE',
      }),
    });

  const maintain = (asset, state, description, result) =>
    recordLifecycleEvent({
      assetObjectId: asset._id,
      actor,
      plan: () => ({
        allowedFrom: state === 'START' ? ['ACTIVE'] : ['MAINTENANCE'],
        eventType: 'MAINTENANCE',
        description: `Maintenance ${state === 'START' ? 'started' : 'completed'}: ${description}`,
        metadata: { maintenanceState: state, description, result },
        updates: {},
        nextStatus: state === 'START' ? 'MAINTENANCE' : 'ACTIVE',
      }),
    });

  const transfer = (asset, dept, location, reason) =>
    recordLifecycleEvent({
      assetObjectId: asset._id,
      actor,
      plan: (a) => ({
        allowedFrom: ['ACTIVE', 'MAINTENANCE'],
        eventType: 'TRANSFER',
        description: `Transferred to ${dept.name}.`,
        metadata: { previousAssignedTo: a.assignedTo ? String(a.assignedTo) : null, previousDepartmentId: String(a.departmentId), newDepartmentId: String(dept._id), newDepartmentName: dept.name, newLocation: location, reason },
        updates: { assignedTo: null, owner: '', departmentId: dept._id, department: dept.name, location },
        nextStatus: a.status,
      }),
    });

  const dispose = (asset, reason) =>
    recordLifecycleEvent({
      assetObjectId: asset._id,
      actor,
      plan: () => ({
        allowedFrom: ['ACTIVE', 'MAINTENANCE'],
        eventType: 'DISPOSAL',
        description: `Asset disposed: ${reason}`,
        metadata: { disposalReason: reason, authorizedBy: actor.name, certificateReference: 'CERT-DEV-0001' },
        updates: { assignedTo: null, owner: '' },
        nextStatus: 'DISPOSED',
      }),
    });

  // Employee A's laptop (IT Ops) — visible to Employee A and the IT Ops manager
  const a1 = await register('AST-1001', 'Dell Latitude 5440 (A)', 'Laptop', 'Dell', 'Latitude 5440', itOps, 'HQ - Floor 2');
  await allocate(a1, users.employeeA, itOps, 'HQ - Floor 2');

  // Employee B's laptop (Finance) — UNRELATED to the IT Ops manager; must be invisible to them
  const a2 = await register('AST-1002', 'Lenovo ThinkPad T14 (B)', 'Laptop', 'Lenovo', 'ThinkPad T14', finance, 'HQ - Floor 4');
  await allocate(a2, users.employeeB, finance, 'HQ - Floor 4');

  // IT Ops server under maintenance (unassigned)
  const a3 = await register('AST-1003', 'Rack Server RS-01', 'Server', 'Dell', 'PowerEdge R650', itOps, 'Data Centre - Rack 3');
  await maintain(a3, 'START', 'Memory module replacement', 'In progress');

  // IT Ops monitor transferred to Finance (history with a TRANSFER event)
  const a4 = await register('AST-1004', 'Dell UltraSharp 27 monitor', 'Monitor', 'Dell', 'U2723QE', itOps, 'HQ - Floor 1');
  await transfer(a4, finance, 'HQ - Floor 4', 'Department reorganisation');

  // Engineering printer (unassigned, active) — unrelated department
  await register('AST-1005', 'Office Printer MFP-7', 'Printer', 'HP', 'LaserJet M633', engineering, 'HQ - Floor 3');

  // IT Ops desktop, disposed (immutable record)
  const a6 = await register('AST-1006', 'Desktop OptiPlex 7090', 'Desktop', 'Dell', 'OptiPlex 7090', itOps, 'Warehouse');
  await dispose(a6, 'End of life');

  // IT Ops network switch (registration only)
  await register('AST-1007', 'Core Switch CS-48', 'Networking', 'Cisco', 'Catalyst 9300', itOps, 'Data Centre - Rack 1');

  // Finance laptop, unassigned
  await register('AST-1008', 'HP EliteBook 840 (spare)', 'Laptop', 'HP', 'EliteBook 840 G10', finance, 'HQ - Floor 4');

  // ── Verify the whole chain before reporting success ─────────────────────
  const full = await verifyFullChain();
  if (!full.verified) fail(`Seeded chain failed verification: ${JSON.stringify(full.violations.slice(0, 3))}`);
  const assetsChecked = await Asset.find({}, 'assetId').lean();
  for (const a of assetsChecked) {
    const r = await verifyAssetChain(a.assetId);
    if (!r.verified) fail(`Asset ${a.assetId} failed verification after seeding.`);
  }

  console.log('\n[seed] Development dataset created and verified.');
  console.log(`[seed] Departments: ${await Department.countDocuments()}, users: ${await User.countDocuments()}, assets: ${await Asset.countDocuments()}, ledger blocks: ${full.totalBlocks}`);
  console.log('\n[seed] Development accounts (password for all: see below):');
  for (const a of accounts) console.log(`  ${a.role.padEnd(9)} ${a.email}${a.status === 'INACTIVE' ? '  (INACTIVE)' : ''}`);
  if (!process.env.SEED_PASSWORD) console.log(`\n[seed] Generated password for all accounts (shown once): ${password}`);
  else console.log('\n[seed] Password for all accounts is taken from SEED_PASSWORD.');

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[seed] Failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { main };
