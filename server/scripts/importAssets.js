/**
 * Command-line bulk import. The same validation and write path as the web/API import.
 *
 *   npm run import:assets -- path\to\assets.csv                       # DRY RUN: validate only
 *   npm run import:assets -- path\to\assets.csv --commit --as admin@yourcompany.test
 *   Optional: --report path\to\failed-rows.csv   (default: next to the input file)
 *
 * Validation is all-or-nothing: if any row is invalid, nothing is written. Valid rows are written
 * one at a time, each in its own ledger transaction. See docs/IMPORT_EXPORT.md.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { assertConfig } = require('../config/env');
const { prepareImport, commitImport } = require('../services/assets/bulkImport');
const { toCsv, MAX_IMPORT_BYTES } = require('../services/csv/csv');
const { logAction } = require('../services/audit/auditLogger');
const User = require('../models/User');

const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--as', '--report']);
function parseArgs(list) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < list.length; i += 1) {
    if (VALUE_FLAGS.has(list[i])) {
      flags[list[i]] = list[i + 1];
      i += 1;
    } else if (list[i].startsWith('--')) {
      flags[list[i]] = true;
    } else {
      positional.push(list[i]);
    }
  }
  return { positional, flags };
}
const { positional, flags } = parseArgs(args);
const file = positional[0] || null;
const COMMIT = flags['--commit'] === true;
const ACTOR_EMAIL = flags['--as'] || null;
const REPORT = flags['--report'] || (file ? path.join(path.dirname(file), `${path.basename(file, path.extname(file))}-failed-rows.csv`) : null);

async function main() {
  if (!file) throw new Error('Give the CSV file path: npm run import:assets -- <file.csv>');
  const stat = fs.statSync(file);
  if (stat.size > MAX_IMPORT_BYTES) throw new Error('The file is larger than 2 MB. Split it into smaller files.');
  const text = fs.readFileSync(file, 'utf8');

  await connectDB();
  const prepared = await prepareImport(text);

  console.log(`File: ${file}`);
  console.log(`Rows: ${prepared.totalRows}   valid: ${prepared.validCount}   with errors: ${prepared.totalRows - prepared.validCount}`);
  if (prepared.ignoredColumns.length) console.log(`Ignored columns: ${prepared.ignoredColumns.join(', ')}`);
  if (prepared.unknownColumns.length) console.log(`Unknown columns (not imported): ${prepared.unknownColumns.join(', ')}`);

  const ownerRows = prepared.rows.filter((r) => r.warnings.length).length;
  if (ownerRows) console.log(`Note: owner is not imported (${ownerRows} row(s) had an owner). Assign owners after import through Lifecycle → Allocate.`);

  if (prepared.errorCount) {
    console.log('\nRow errors:');
    for (const row of prepared.rows) {
      for (const e of row.errors) console.log(`  row ${e.row} ${e.assetId ? `(${e.assetId}) ` : ''}[${e.field}] ${e.message}`);
    }
    if (REPORT) {
      const failed = prepared.rows.flatMap((r) => r.errors.map((e) => ({ row: e.row, assetId: e.assetId, field: e.field, message: e.message })));
      fs.writeFileSync(REPORT, toCsv([
        { key: 'row', header: 'row' }, { key: 'assetId', header: 'assetId' }, { key: 'field', header: 'field' }, { key: 'message', header: 'message' },
      ], failed));
      console.log(`\nRow errors written to: ${REPORT}`);
    }
  }

  if (!COMMIT) {
    console.log(prepared.canCommit
      ? '\nDRY RUN: this file is valid. Nothing was written. Re-run with --commit --as <admin email> to import.'
      : '\nDRY RUN: fix the errors above. Nothing was written.');
    return;
  }
  if (!prepared.canCommit) {
    throw new Error('Refusing to import: the file has validation errors, so nothing was written.');
  }
  if (!ACTOR_EMAIL) throw new Error('--commit needs --as <email of an active ADMIN>, so the import is recorded in the audit log.');

  const actor = await User.findOne({ email: ACTOR_EMAIL.toLowerCase().trim(), role: 'ADMIN', status: 'ACTIVE' });
  if (!actor) throw new Error(`No active ADMIN with email ${ACTOR_EMAIL}.`);

  const result = await commitImport(prepared, { actor, ip: 'cli' });
  console.log(`\nImported ${result.succeeded.length} of ${result.attempted} asset(s).`);
  if (result.failed.length) {
    console.log('Rows that were NOT imported:');
    for (const f of result.failed) console.log(`  row ${f.row} (${f.assetId}): ${f.message}`);
    if (REPORT) {
      fs.writeFileSync(REPORT, toCsv([
        { key: 'row', header: 'row' }, { key: 'assetId', header: 'assetId' }, { key: 'field', header: 'field' }, { key: 'message', header: 'message' },
      ], result.failed));
      console.log(`Failed rows written to: ${REPORT}`);
    }
    process.exitCode = 1;
  }
  await logAction({ user: actor, action: 'ASSETS_IMPORTED', entity: 'Asset', entityId: 'IMPORT', metadata: { file: path.basename(file), imported: result.succeeded.length, failed: result.failed.length }, ip: 'cli' });
}

assertConfig();
main()
  .catch((err) => {
    console.error(`[import:assets] ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
