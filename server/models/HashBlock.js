const mongoose = require('mongoose');

/**
 * Append-only hash-chain ledger.
 * Every LifecycleEvent produces exactly one HashBlock.
 * index is a GLOBAL, strictly increasing sequence across the whole chain
 * (genesis block = index 0), independent of which asset the event belongs to.
 * This mirrors a single shared ledger rather than one chain per asset,
 * matching the project's "append-only hash-chain ledger" requirement.
 */
const hashBlockSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, unique: true, index: true },
    timestamp: { type: Date, required: true },
    assetId: { type: String, required: true, index: true }, // 'GENESIS' for block 0
    eventId: { type: String, required: true, index: true },
    eventDataHash: { type: String, required: true }, // sha256 of the raw event payload
    previousHash: { type: String, required: true },
    currentHash: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HashBlock', hashBlockSchema);
