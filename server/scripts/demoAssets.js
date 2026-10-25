/**
 * Seeds 40 demo IT assets through the SAME trusted service the application uses. Every asset gets
 * its REGISTRATION event and ledger block from registerAsset(); lifecycle history is written with
 * recordLifecycleEvent(). No hashes are inserted by hand and no ledger write bypasses the service.
 *
 *   npm run demo:assets              # DRY RUN: lists what would be added. Writes nothing.
 *   npm run demo:assets -- --yes     # adds only assets whose Asset ID does not exist yet
 *
 * Requires the demo departments: run `npm run demo:accounts -- --yes` first.
 * Re-running is safe: existing demo assets are skipped, never changed or duplicated.
 * Refuses to run when NODE_ENV is production. Never deletes anything.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { assertConfig } = require('../config/env');
const { ensureGenesisBlock } = require('../services/blockchain/hashChain');
const { registerAsset, recordLifecycleEvent } = require('../services/lifecycleService');
const { verifyFullChain } = require('../services/verification/verifyChain');
const { demoAssets, DEMO_DOMAIN } = require('../services/demo/demoData');
const Asset = require('../models/Asset');
const User = require('../models/User');
const Department = require('../models/Department');

const APPLY = process.argv.includes('--yes');
const asArg = process.argv.indexOf('--as');
const ACTOR_EMAIL = asArg !== -1 ? process.argv[asArg + 1] : `admin@${DEMO_DOMAIN}`;

/** Maintenance START then COMPLETE, so the demo asset ends ACTIVE with a longer history. */
function maintenancePlan(state) {
  return () => {
    const starting = state === 'START';
    return {
      allowedFrom: starting ? ['ACTIVE'] : ['MAINTENANCE'],
      eventType: 'MAINTENANCE',
      description: `Maintenance ${starting ? 'started' : 'completed'}: scheduled cleaning and firmware check (demo).`,
      metadata: { maintenanceState: state, description: 'Scheduled cleaning and firmware check (demo).', result: starting ? 'In progress' : 'Completed' },
      updates: {},
      nextStatus: starting ? 'MAINTENANCE' : 'ACTIVE',
    };
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo assets: NODE_ENV is production.');
  await connectDB();

  const actor = await User.findOne({ email: ACTOR_EMAIL.toLowerCase(), role: 'ADMIN', status: 'ACTIVE' });
  if (!actor) {
    throw new Error(`No active ADMIN with email ${ACTOR_EMAIL}. Run "npm run demo:accounts -- --yes" first, or pass --as <admin email>.`);
  }

  const departments = new Map();
  for (const name of ['IT Operations', 'Finance']) {
    const d = await Department.findOne({ name }).lean();
    if (!d) throw new Error(`Department "${name}" is missing. Run "npm run demo:accounts -- --yes" first.`);
    departments.set(name, d);
  }

  const wanted = demoAssets(40);
  const existing = new Set((await Asset.find({ assetId: { $in: wanted.map((a) => a.assetId) } }).select('assetId').lean()).map((a) => a.assetId));
  const toAdd = wanted.filter((a) => !existing.has(a.assetId));

  console.log(APPLY ? `APPLYING as ${actor.email}:` : `DRY RUN as ${actor.email}. Nothing will be written. Add --yes to apply.`);
  console.log(`  Demo assets defined: ${wanted.length}`);
  console.log(`  Already present (skipped): ${wanted.length - toAdd.length}`);
  console.log(`  To add: ${toAdd.length}${toAdd.length ? ` (${toAdd[0].assetId} to ${toAdd[toAdd.length - 1].assetId})` : ''}`);
  if (!APPLY) return;

  await ensureGenesisBlock();
  let added = 0;
  let withHistory = 0;
  for (const def of toAdd) {
    const dept = departments.get(def.department);
    const { asset } = await registerAsset({
      actor,
      fields: {
        assetId: def.assetId,
        name: def.name,
        category: def.category,
        brand: def.brand,
        model: def.model,
        serialNumber: def.serialNumber,
        purchaseDate: new Date(`${def.purchaseDate}T00:00:00.000Z`),
        purchaseCost: def.purchaseCost,
        warranty: def.warranty,
        description: def.description,
        location: def.location,
        departmentId: dept._id,
        department: dept.name,
        assignedTo: null,
        owner: '',
      },
    });
    added += 1;
    if (def.maintenanceAfterRegistration) {
      await recordLifecycleEvent({ assetObjectId: asset._id, actor, plan: maintenancePlan('START') });
      await recordLifecycleEvent({ assetObjectId: asset._id, actor, plan: maintenancePlan('COMPLETE') });
      withHistory += 1;
    }
  }

  console.log(`\nAdded ${added} asset(s); ${withHistory} with maintenance history.`);
  const integrity = await verifyFullChain();
  console.log(`Full ledger: ${integrity.status} (${integrity.totalBlocks} blocks, ${integrity.totalEvents} lifecycle records).`);
  if (!integrity.verified) {
    console.error('The ledger did NOT verify after seeding. Run "npm run ledger:diagnose" and do not use this data.');
    process.exitCode = 1;
  }
}

assertConfig();
main()
  .catch((err) => {
    console.error(`[demo:assets] ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
