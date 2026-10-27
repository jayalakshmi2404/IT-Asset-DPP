const mongoose = require('mongoose');

/**
 * SIMULATED external transactions for the mock anchor provider. Not a blockchain.
 * Stored in the app database so the demo works offline. Every row is simulated.
 */
const mockAnchorTxSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, unique: true, index: true }, // always starts with MOCK-SIM-
    payload: { type: String, required: true }, // DPP-ANCHOR|v1|<index>|<hash>
    from: { type: String, required: true }, // MOCK-SIGNER
    blockRef: { type: String, required: true }, // MOCK-BLOCK-<index>
    simulated: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MockAnchorTx', mockAnchorTxSchema);
