/**
 * Creates the demo role accounts and the demo departments. Idempotent and non-destructive.
 *
 *   npm run demo:accounts              # DRY RUN: shows what would be created. Writes nothing.
 *   npm run demo:accounts -- --yes     # creates only the missing accounts and departments
 *
 * Rules:
 *  - An account whose email already exists is left exactly as it is (password included).
 *  - Each new account gets a random password, generated here, stored only as a bcrypt hash, and
 *    printed ONCE to this terminal. Copy it then. It cannot be shown again; reset it in the app if lost.
 *  - Refuses to run when NODE_ENV is production.
 *  - Never deletes or resets anything.
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { ensureGenesisBlock } = require('../services/blockchain/hashChain');
const User = require('../models/User');
const Department = require('../models/Department');
const { DEMO_DEPARTMENTS, DEMO_ACCOUNTS } = require('../services/demo/demoData');

const APPLY = process.argv.includes('--yes');

function generatePassword() {
  // 18 random bytes, base64url: about 24 characters, no characters that need quoting in a terminal.
  return crypto.randomBytes(18).toString('base64url');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to create demo accounts: NODE_ENV is production.');
  }
  await connectDB();

  const plan = { departmentsToCreate: [], accountsToCreate: [], accountsExisting: [] };
  const departmentByName = new Map();
  for (const d of DEMO_DEPARTMENTS) {
    const found = await Department.findOne({ name: d.name }).lean();
    if (found) departmentByName.set(d.name, found);
    else plan.departmentsToCreate.push(d);
  }
  for (const acc of DEMO_ACCOUNTS) {
    if (await User.exists({ email: acc.email })) plan.accountsExisting.push(acc.email);
    else plan.accountsToCreate.push(acc);
  }

  console.log(APPLY ? 'APPLYING changes (existing records are never modified):' : 'DRY RUN. Nothing will be written. Add --yes to apply.');
  console.log(`  Departments to create: ${plan.departmentsToCreate.map((d) => d.name).join(', ') || 'none'}`);
  console.log(`  Accounts to create:    ${plan.accountsToCreate.map((a) => `${a.role} ${a.email}`).join('\n                         ') || 'none'}`);
  console.log(`  Accounts already there (left unchanged): ${plan.accountsExisting.join(', ') || 'none'}`);

  if (!APPLY) return;

  for (const d of plan.departmentsToCreate) {
    const created = await Department.create({ name: d.name, code: d.code });
    departmentByName.set(d.name, created.toObject());
  }

  const printed = [];
  for (const acc of plan.accountsToCreate) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const dept = acc.department ? departmentByName.get(acc.department) : null;
    await User.create({
      name: acc.name,
      email: acc.email,
      passwordHash,
      role: acc.role,
      status: 'ACTIVE',
      departmentId: dept ? dept._id : null,
      department: dept ? dept.name : '',
      managedDepartmentIds: acc.role === 'MANAGER' && dept ? [dept._id] : [],
    });
    printed.push({ role: acc.role, email: acc.email, password });
  }

  await ensureGenesisBlock();

  if (printed.length) {
    console.log('\nDEMO PASSWORDS. Shown once. Save them now. They are not stored in plain text anywhere:');
    for (const p of printed) console.log(`  ${p.role.padEnd(9)} ${p.email.padEnd(28)} ${p.password}`);
  } else {
    console.log('\nNo new accounts were needed. Existing passwords were not changed or printed.');
  }
}

main()
  .catch((err) => {
    console.error(`[demo:accounts] ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
