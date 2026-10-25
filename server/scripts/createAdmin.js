/**
 * One-time bootstrap: creates the FIRST administrator in any environment.
 * It creates no assets and no demo data.
 *
 *   npm run create-admin -- "Full Name" admin@yourcompany.com "a-long-passphrase"
 *
 * The password must be supplied on the command line; there is no default.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { ensureGenesisBlock } = require('../services/blockchain/hashChain');
const User = require('../models/User');

async function main() {
  const [, , nameArg, emailArg, passwordArg] = process.argv;
  if (!nameArg || !emailArg || !passwordArg) {
    console.error('Usage: npm run create-admin -- "Full Name" admin@company.com "password (min 8 chars)"');
    process.exit(1);
  }

  const name = nameArg.trim().slice(0, 120);
  const email = emailArg.toLowerCase().trim();
  if (passwordArg.length < 8 || passwordArg.length > 128) {
    console.error('Password must be between 8 and 128 characters.');
    process.exit(1);
  }

  await connectDB();

  if (await User.exists({ email })) {
    console.log(`A user with email "${email}" already exists. No changes made.`);
  } else {
    const passwordHash = await bcrypt.hash(passwordArg, 12);
    await User.create({ name, email, passwordHash, role: 'ADMIN', status: 'ACTIVE' });
    await ensureGenesisBlock();
    console.log(`Administrator created: ${name} <${email}>`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed to create administrator:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
