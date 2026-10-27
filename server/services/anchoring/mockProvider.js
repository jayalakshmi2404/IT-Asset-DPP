const crypto = require('crypto');
const { encodePayload, decodePayload } = require('./provider');

/**
 * MOCK / SIMULATED anchor provider. Free and offline: no RPC URL, no wallet key, no network.
 *
 * It is NOT a blockchain. Its "transactions" are rows in the app database (collection mockanchortxs),
 * so anyone with database access can change them. Use it to demonstrate the anchoring workflow,
 * never as evidence of a real on-chain record.
 *
 * Every reference starts with MOCK-SIM- and every block reference with MOCK-BLOCK-, so a simulated
 * anchor can never be mistaken for an Ethereum transaction hash (0x + 64 hex characters).
 * References are deterministic: the same block always produces the same simulated reference.
 */
const MOCK_REF_PREFIX = 'MOCK-SIM-';
const MOCK_SIGNER = 'MOCK-SIGNER';

function createMockProvider({ MockAnchorTx }) {
  return {
    name: 'mock',
    simulated: true,
    network: 'MOCK (no network)',
    address: MOCK_SIGNER,

    async submit(payload) {
      const digest = crypto.createHash('sha256').update(`mock|${payload.blockIndex}|${payload.blockHash}`).digest('hex');
      const ref = `${MOCK_REF_PREFIX}${digest.slice(0, 24)}`;
      const existing = await MockAnchorTx.findOne({ ref }).lean();
      if (!existing) {
        await MockAnchorTx.create({
          ref,
          payload: encodePayload(payload),
          from: MOCK_SIGNER,
          blockRef: `MOCK-BLOCK-${payload.blockIndex}`,
        });
      }
      return { ref, submittedAt: new Date(), simulated: true };
    },

    async fetch(ref) {
      const tx = await MockAnchorTx.findOne({ ref }).lean();
      if (!tx) return { found: false, simulated: true };
      return {
        found: true,
        from: tx.from,
        payload: decodePayload(tx.payload),
        failed: false,
        confirmed: true, // the simulation confirms immediately and says so in the UI
        confirmations: 1,
        blockRef: tx.blockRef,
        simulated: true,
      };
    },
  };
}

module.exports = { createMockProvider, MOCK_REF_PREFIX, MOCK_SIGNER };
