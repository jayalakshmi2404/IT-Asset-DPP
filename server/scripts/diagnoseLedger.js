/**
 * READ-ONLY ledger diagnosis. Writes nothing to the database.
 *
 *   npm run ledger:diagnose                    # every asset, plus the full ledger
 *   npm run ledger:diagnose -- --asset ASSET049 # one asset (Asset ID), plus the full ledger
 *
 * Output is a JSON report: each violation with its reason, affected IDs, and the read-only
 * `diagnosis` hints that explain a mismatch (missing legacy field, whitespace drift, and so on).
 * A violation is never hidden or downgraded here. Use it to decide what to investigate.
 * Any repair, if one is ever needed, is a separate, administrator-approved step (see docs/LEDGER_INTEGRITY.md).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { assertConfig } = require('../config/env');
const Asset = require('../models/Asset');
const { verifyFullChain, verifyAssetChain } = require('../services/verification/verifyChain');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function main() {
  // Keep stdout for the JSON report only: informational logs go to stderr.
  const log = console.log;
  console.log = (...args) => console.error(...args);
  assertConfig();
  await connectDB();

  const onlyAsset = argValue('--asset');
  const filter = onlyAsset ? { assetId: onlyAsset } : {};
  const assets = await Asset.find(filter).select('assetId dppId name status').lean();
  if (onlyAsset && assets.length === 0) {
    console.error(`[diagnose] No asset with Asset ID "${onlyAsset}" exists in this database.`);
    process.exitCode = 2;
    return;
  }

  const full = await verifyFullChain();
  const perAsset = [];
  for (const asset of assets) {
    const result = await verifyAssetChain(asset.assetId);
    perAsset.push({
      assetId: asset.assetId,
      dppId: asset.dppId,
      name: asset.name,
      status: result.status,
      totalEvents: result.totalEvents,
      violations: result.violations,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    database: mongoose.connection.name,
    readOnly: true,
    fullLedger: { status: full.status, totalBlocks: full.totalBlocks, totalEvents: full.totalEvents, violations: full.violations },
    assets: perAsset,
    summary: {
      assetsChecked: perAsset.length,
      assetsVerified: perAsset.filter((a) => a.status === 'VERIFIED').length,
      assetsWithViolations: perAsset.filter((a) => a.status !== 'VERIFIED').map((a) => a.assetId),
    },
  };

  console.log = log;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = full.status === 'VERIFIED' && perAsset.every((a) => a.status === 'VERIFIED') ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(`[diagnose] ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
