const HashBlock = require('../../models/HashBlock');
const { GENESIS_HASH, sha256, hashEventData, computeBlockHash } = require('./hashCrypto');

/**
 * Ensures the genesis block (index 0) exists. Safe to call repeatedly and from
 * concurrent requests: a duplicate-key error means another request created it.
 */
async function ensureGenesisBlock() {
  const existing = await HashBlock.findOne({ index: 0 });
  if (existing) return existing;

  const timestamp = new Date(0); // fixed epoch so genesis is deterministic
  const eventDataHash = sha256('GENESIS_BLOCK::IT_ASSET_DPP');
  const currentHash = computeBlockHash({
    index: 0,
    timestamp,
    assetId: 'GENESIS',
    eventId: 'GENESIS',
    eventDataHash,
    previousHash: GENESIS_HASH,
  });

  try {
    return await HashBlock.create({
      index: 0,
      timestamp,
      assetId: 'GENESIS',
      eventId: 'GENESIS',
      eventDataHash,
      previousHash: GENESIS_HASH,
      currentHash,
    });
  } catch (err) {
    if (err.code === 11000) return HashBlock.findOne({ index: 0 });
    throw err;
  }
}

/**
 * Appends a block for one lifecycle event. MUST be called inside a transaction
 * (see transaction.js) with the session passed in, so that reading the chain head
 * and inserting the next block are part of the same atomic unit.
 *
 * Returns { previousHash, currentHash, blockIndex, eventDataHash }.
 */
async function appendBlock({ assetId, eventId, eventType, description, performedByName, timestamp, metadata, session }) {
  const latest = await HashBlock.findOne().sort({ index: -1 }).session(session);
  if (!latest) {
    throw new Error('Hash chain has no genesis block; start the server once to create it.');
  }

  const previousHash = latest.currentHash;
  const nextIndex = latest.index + 1;

  const eventDataHash = hashEventData({ assetId, eventId, eventType, description, performedByName, timestamp, metadata });
  const currentHash = computeBlockHash({
    index: nextIndex,
    timestamp,
    assetId,
    eventId,
    eventDataHash,
    previousHash,
  });

  await HashBlock.create(
    [
      {
        index: nextIndex,
        timestamp,
        assetId,
        eventId,
        eventDataHash,
        previousHash,
        currentHash,
      },
    ],
    { session }
  );

  return { previousHash, currentHash, blockIndex: nextIndex, eventDataHash };
}

module.exports = {
  GENESIS_HASH,
  sha256,
  hashEventData,
  computeBlockHash,
  ensureGenesisBlock,
  appendBlock,
};
