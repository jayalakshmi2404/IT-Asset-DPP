const mongoose = require('mongoose');

/**
 * One row per anchored ledger block. The anchor itself lives on the external chain;
 * this record only remembers which block hash was sent and where to find the transaction.
 * blockIndex is unique, so the same block is never anchored twice.
 */
const ANCHOR_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED'];

const anchorRecordSchema = new mongoose.Schema(
  {
    blockIndex: { type: Number, required: true, unique: true, index: true },
    blockHash: { type: String, required: true }, // currentHash of the anchored HashBlock
    provider: { type: String, required: true }, // e.g. 'ethereum'
    txRef: { type: String, required: true, index: true }, // transaction hash on the external chain
    status: { type: String, enum: ANCHOR_STATUSES, default: 'PENDING', index: true },
    submittedAt: { type: Date, required: true },
    confirmedAt: { type: Date },
    statusNote: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    simulated: { type: Boolean, default: false }, // true only for the mock provider
    network: { type: String, default: '' }, // e.g. 'Sepolia' or 'MOCK (no network)'
  },
  { timestamps: true }
);

module.exports = mongoose.model('AnchorRecord', anchorRecordSchema);
module.exports.ANCHOR_STATUSES = ANCHOR_STATUSES;
