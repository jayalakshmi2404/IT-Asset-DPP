const { createEthereumProvider, SEPOLIA_CHAIN_ID } = require('./provider');
const { createMockProvider } = require('./mockProvider');

/**
 * Chooses the anchor provider from ANCHOR_PROVIDER.
 *   none      – anchoring disabled (default). Nothing is ever sent anywhere.
 *   mock      – simulated, offline, free. Needs no RPC URL or key. Never a real transaction.
 *   ethereum  – real transactions on the chain named by ANCHOR_CHAIN_ID (Sepolia by default).
 * An invalid ethereum configuration is an error. It never falls back to mock.
 */
function loadProvider(env = process.env, deps = {}) {
  const kind = String(env.ANCHOR_PROVIDER || 'none').trim().toLowerCase();
  if (kind === 'none') return null;
  if (kind === 'mock') {
    const MockAnchorTx = deps.MockAnchorTx || require('../../models/MockAnchorTx');
    return createMockProvider({ MockAnchorTx });
  }
  if (kind === 'ethereum') {
    const ethers = deps.ethers || require('ethers');
    return createEthereumProvider({
      ethers,
      rpcUrl: env.ANCHOR_RPC_URL,
      privateKey: env.ANCHOR_PRIVATE_KEY,
      minConfirmations: Number(env.ANCHOR_MIN_CONFIRMATIONS || 1),
      expectedChainId: Number(env.ANCHOR_CHAIN_ID || SEPOLIA_CHAIN_ID),
    });
  }
  throw new Error('ANCHOR_PROVIDER must be "none", "mock" or "ethereum".');
}

/** What the UI shows. The labels are fixed so a simulated result is never presented as a real transaction. */
function describeProvider(provider) {
  if (!provider) {
    return { kind: 'none', label: 'Disabled — Anchoring Not Enabled', simulated: false, real: false };
  }
  if (provider.simulated) {
    return { kind: 'mock', label: 'Mock Mode — Simulated, No Real Blockchain', simulated: true, real: false };
  }
  const sepolia = provider.chainId === SEPOLIA_CHAIN_ID;
  return {
    kind: 'ethereum',
    label: sepolia ? 'Ethereum Sepolia — Real Testnet Transaction' : `Ethereum chain ${provider.chainId} — Real Transaction`,
    simulated: false,
    real: true,
  };
}

let cached;
let cachedKey;
/** Cached per configuration, so changing ANCHOR_PROVIDER in tests takes effect. */
function getProvider() {
  const key = [process.env.ANCHOR_PROVIDER, process.env.ANCHOR_CHAIN_ID, process.env.ANCHOR_RPC_URL].join('|');
  if (cached === undefined || cachedKey !== key) {
    cached = loadProvider();
    cachedKey = key;
  }
  return cached;
}

function resetProviderCache() {
  cached = undefined;
  cachedKey = undefined;
}

module.exports = { loadProvider, getProvider, describeProvider, resetProviderCache };
