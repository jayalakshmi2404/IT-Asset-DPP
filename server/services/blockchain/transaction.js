const mongoose = require('mongoose');
const { AppError } = require('../../middleware/errorHandler');

/**
 * Runs `work(session)` inside a MongoDB transaction so the hash-chain block, the lifecycle
 * record and the asset update either all commit or none do.
 *
 * - Transactions need a replica set or a MongoDB Atlas cluster. On a standalone server the
 *   write is REFUSED (503); there is no fallback that writes ledger records without a transaction.
 * - The result is returned only after the commit succeeds, so a failed write is never reported
 *   as successful.
 * - Concurrent writers race for the next block index. The loser gets a duplicate-key error on the
 *   hashblocks index, and the whole unit is retried from scratch against the new chain head.
 * - The session is always ended, including on failure.
 */
const MAX_ATTEMPTS = 4;

const STANDALONE_MESSAGE =
  'MongoDB is not running as a replica set, so lifecycle writes cannot be made atomic. ' +
  'Set MONGODB_URI to a MongoDB Atlas (mongodb+srv://) or replica-set connection string and restart. ' +
  'Nothing was saved. See docs/ATLAS_SETUP.md.';

/** MongoDB's own refusal to run a transaction on a standalone server. Matches the driver's exact wording only. */
function isStandaloneError(err) {
  return /Transaction numbers are only allowed on a replica set member or mongos|Transactions are not supported/i.test(err?.message || '');
}

/** Duplicate key on the hashblocks collection: another writer appended the same chain position first. */
function isChainRace(err) {
  return err?.code === 11000 && /hashblocks/i.test(err.message || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withLedgerTransaction(work) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(
        async () => {
          result = await work(session);
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
      );
      return result;
    } catch (err) {
      if (isStandaloneError(err)) {
        throw new AppError(STANDALONE_MESSAGE, 503);
      }
      if (isChainRace(err)) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(10 + Math.floor(Math.random() * 40) * attempt);
          continue;
        }
        throw new AppError('Other lifecycle changes were saved at the same moment. Nothing was saved for this request; please retry.', 409);
      }
      // Business-rule errors (AppError), validation and connection errors propagate unchanged.
      throw err;
    } finally {
      await session.endSession().catch(() => {});
    }
  }
  // Unreachable: the loop either returns or throws. Kept as a safety net.
  throw new AppError('The operation could not be completed. Nothing was saved.', 409);
}

module.exports = { withLedgerTransaction, isStandaloneError, isChainRace, MAX_ATTEMPTS };
