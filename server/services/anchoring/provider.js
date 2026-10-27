/**
 * Anchor payload format and the real Ethereum-compatible provider.
 *
 * An anchor carries "DPP-ANCHOR|v1|<blockIndex>|<blockHash>" and nothing else. No asset, person or
 * event data is written on-chain.
 *
 * Secrets: the RPC URL can contain an API key (Alchemy puts it in the path) and the private key
 * signs transactions. Neither is ever included in an error message, returned by the provider, or logged.
 * `ethers` is injected so tests can run without the network.
 */
const ANCHOR_PREFIX = 'DPP-ANCHOR|v1|';
const HEX64 = /^[a-f0-9]{64}$/;
const SEPOLIA_CHAIN_ID = 11155111;

function encodePayload({ blockIndex, blockHash }) {
  return `${ANCHOR_PREFIX}${blockIndex}|${blockHash}`;
}

/** Returns { blockIndex, blockHash } or null when the text is not one of our anchors. */
function decodePayload(text) {
  if (typeof text !== 'string' || !text.startsWith(ANCHOR_PREFIX)) return null;
  const [indexText, hash] = text.slice(ANCHOR_PREFIX.length).split('|');
  const blockIndex = Number(indexText);
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || !HEX64.test(hash || '')) return null;
  return { blockIndex, blockHash: hash };
}

/** Generic message for RPC or wallet failures. The original error is dropped on purpose: it may contain the URL. */
class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderError';
    this.statusCode = 502;
  }
}

const DEFAULT_RPC_TIMEOUT_MS = 20000;

/**
 * Maps an ethers / RPC error to a safe, fixed message. Only machine-readable fields (code, status)
 * are inspected. The error text is never copied, because it can contain the RPC URL or a key.
 */
function classifyRpcError(err, fallback) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const status = err && typeof err === 'object' ? (err.status || err.statusCode) : undefined;
  if (code === 'INSUFFICIENT_FUNDS') {
    return 'The anchor account has too little Sepolia test ETH to pay gas. Get test ETH from a Sepolia faucet, then try again.';
  }
  if (code === 'NONCE_EXPIRED' || code === 'REPLACEMENT_UNDERPRICED') {
    return 'Another transaction from the anchor account is still pending. Wait for it to confirm, then try again.';
  }
  if (code === 'CALL_EXCEPTION' || code === 'UNPREDICTABLE_GAS_LIMIT') {
    return 'The network rejected the anchor transaction. Check the Sepolia network status and the account, then try again.';
  }
  if (status === 429 || code === 429 || code === 'RATE_LIMITED') {
    return 'The RPC provider is rate-limiting requests. Wait a minute, then try again.';
  }
  if (code === 'TIMEOUT') {
    return 'The RPC provider did not answer in time. Try again later.';
  }
  return fallback;
}

/** Races a promise against a timer so one slow RPC call cannot hang a request forever. */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createEthereumProvider({ ethers, rpcUrl, privateKey, minConfirmations = 1, expectedChainId = SEPOLIA_CHAIN_ID, rpc, timeoutMs = DEFAULT_RPC_TIMEOUT_MS }) {
  let client;
  let wallet;
  try {
    client = rpc || new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(privateKey, client);
  } catch {
    throw new ProviderError('The Ethereum provider could not start. Check ANCHOR_RPC_URL and ANCHOR_PRIVATE_KEY in the server environment (values are not shown).');
  }

  const safely = safelyWith(timeoutMs);

  let chainChecked = false;
  /** Refuses to continue unless the RPC endpoint is the chain we were configured for. Never falls back. */
  async function ensureChain() {
    if (chainChecked) return;
    const network = await safely(() => client.getNetwork(), 'Could not read the network from the RPC endpoint.');
    if (Number(network.chainId) !== expectedChainId) {
      throw new ProviderError(`The RPC endpoint is chain ${network.chainId}, but ANCHOR_CHAIN_ID is ${expectedChainId}. Anchoring refused.`);
    }
    chainChecked = true;
  }

  function readUtf8(hexData) {
    try {
      return ethers.toUtf8String(hexData);
    } catch {
      return null;
    }
  }

  return {
    name: 'ethereum',
    simulated: false,
    network: expectedChainId === SEPOLIA_CHAIN_ID ? 'Sepolia' : `chain ${expectedChainId}`,
    chainId: expectedChainId,
    address: wallet.address,

    /** Sends the anchor transaction and returns its hash. Confirmation is checked later by fetch(). */
    async submit(payload) {
      await ensureChain();
      const data = ethers.hexlify(ethers.toUtf8Bytes(encodePayload(payload)));
      const tx = await safely(() => wallet.sendTransaction({ to: wallet.address, value: 0n, data }), 'The anchor transaction was not sent. Check the account balance and RPC endpoint.');
      return { ref: tx.hash, submittedAt: new Date(), simulated: false };
    },

    /** Reads an anchor transaction back from the chain. */
    async fetch(ref) {
      await ensureChain();
      const tx = await safely(() => client.getTransaction(ref), 'Could not read the anchor transaction from the RPC endpoint.');
      if (!tx) return { found: false };
      const receipt = await safely(() => client.getTransactionReceipt(ref), 'Could not read the transaction receipt from the RPC endpoint.');
      const head = await safely(() => client.getBlockNumber(), 'Could not read the latest block from the RPC endpoint.');
      const confirmations = receipt ? head - receipt.blockNumber + 1 : 0;
      return {
        found: true,
        from: tx.from,
        payload: decodePayload(readUtf8(tx.data)),
        failed: Boolean(receipt && receipt.status === 0),
        confirmed: Boolean(receipt && receipt.status === 1 && confirmations >= minConfirmations),
        confirmations,
        simulated: false,
      };
    },
  };
}

/** Runs one RPC or wallet call with a timeout, and turns any failure into a safe message. */
function safelyWith(timeoutMs) {
  return async function safely(fn, message) {
    try {
      return await withTimeout(Promise.resolve().then(fn), timeoutMs);
    } catch (err) {
      throw new ProviderError(classifyRpcError(err, message));
    }
  };
}

module.exports = { ANCHOR_PREFIX, SEPOLIA_CHAIN_ID, DEFAULT_RPC_TIMEOUT_MS, ProviderError, encodePayload, decodePayload, classifyRpcError, withTimeout, createEthereumProvider };
