const crypto = require('crypto');
const { createEthereumProvider, classifyRpcError, ProviderError } = require('../../services/anchoring/provider');
const { createAnchorService } = require('../../services/anchoring/anchorService');
const { publicAnchorSummary, coverageForEvents, explorerUrlFor } = require('../../services/anchoring/trust');

const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SECRET_URL = 'https://eth-sepolia.g.alchemy.com/v2/LEAK-ME-123';
const SECRET_KEY = '0x' + 'ab'.repeat(32);
const TX = '0x' + '1'.repeat(64);

/** Sorted, chainable list query: find(...).sort({k: dir}).lean() */
function list(rows) {
  let out = rows;
  return {
    sort(spec) {
      const [[k, d]] = Object.entries(spec);
      out = [...out].sort((a, b) => (a[k] - b[k]) * d);
      return this;
    },
    lean: async () => out.map((r) => ({ ...r })),
  };
}
function one(row) {
  return { sort() { return this; }, lean: async () => (row ? { ...row } : null) };
}

function makeBlocks(n) {
  const blocks = [];
  let prev = '0'.repeat(64);
  for (let i = 0; i < n; i++) {
    const currentHash = h(`b${i}${prev}`);
    blocks.push({ index: i, currentHash, previousHash: prev });
    prev = currentHash;
  }
  return blocks;
}

function models(blocks) {
  const records = [];
  let seq = 0;
  const HashBlock = {
    findOne(filter) {
      if (!filter) return one(blocks[blocks.length - 1]);
      return one(blocks.find((b) => b.index === filter.index));
    },
    find(filter = {}) {
      const ids = filter.index && filter.index.$in;
      return list(ids ? blocks.filter((b) => ids.includes(b.index)) : blocks);
    },
  };
  const AnchorRecord = {
    records,
    async create(doc) {
      const rec = { _id: `r${++seq}`, ...doc };
      records.push(rec);
      return rec;
    },
    findOne(filter) { return one(records.find((r) => r.blockIndex === filter.blockIndex)); },
    find(filter = {}) { return list(records.filter((r) => !filter.status || r.status === filter.status)); },
    async updateOne(filter, update) {
      const rec = records.find((r) => r._id === filter._id);
      if (rec) Object.assign(rec, update.$set);
      return {};
    },
    async deleteOne(filter) {
      const i = records.findIndex((r) => r._id === filter._id);
      if (i >= 0) records.splice(i, 1);
      return {};
    },
  };
  return { HashBlock, AnchorRecord };
}

function fakeEthers({ sendError } = {}) {
  return {
    JsonRpcProvider: class {},
    Wallet: class {
      constructor() { this.address = '0x' + '3'.repeat(40); }
      async sendTransaction() {
        if (sendError) throw sendError;
        return { hash: TX };
      }
    },
    hexlify: (b) => '0x' + Buffer.from(b).toString('hex'),
    toUtf8Bytes: (s) => Buffer.from(s),
    toUtf8String: () => '',
  };
}

const okRpc = { async getNetwork() { return { chainId: 11155111n }; } };

describe('RPC error classification never echoes the endpoint or key', () => {
  test('insufficient funds gets an actionable, safe message', () => {
    const msg = classifyRpcError({ code: 'INSUFFICIENT_FUNDS', message: `insufficient funds ${SECRET_URL}` }, 'fallback');
    expect(msg).toMatch(/test ETH/);
    expect(msg).not.toContain('LEAK-ME');
  });

  test('rate limiting and timeouts are named clearly', () => {
    expect(classifyRpcError({ status: 429 }, 'x')).toMatch(/rate-limiting/);
    expect(classifyRpcError({ code: 'TIMEOUT' }, 'x')).toMatch(/did not answer in time/);
  });

  test('an unknown error returns the fixed fallback, never its own text', () => {
    expect(classifyRpcError(new Error(`boom ${SECRET_URL} ${SECRET_KEY}`), 'Fixed fallback.')).toBe('Fixed fallback.');
  });
});

describe('RPC calls are bounded and failures are safe', () => {
  test('a hanging RPC call times out instead of waiting forever', async () => {
    const hanging = { getNetwork: () => new Promise(() => {}) };
    const provider = createEthereumProvider({ ethers: fakeEthers(), privateKey: SECRET_KEY, rpc: hanging, timeoutMs: 20 });
    const err = await provider.submit({ blockIndex: 0, blockHash: h('x') }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toMatch(/did not answer in time/);
    expect(err.message).not.toContain(SECRET_KEY.slice(2));
  });

  test('insufficient test ETH is reported without the RPC URL or key', async () => {
    const provider = createEthereumProvider({
      ethers: fakeEthers({ sendError: Object.assign(new Error(`insufficient funds ${SECRET_URL}`), { code: 'INSUFFICIENT_FUNDS' }) }),
      privateKey: SECRET_KEY,
      rpc: okRpc,
    });
    const err = await provider.submit({ blockIndex: 0, blockHash: h('x') }).catch((e) => e);
    expect(err.message).toMatch(/test ETH/);
    expect(err.message).not.toContain('LEAK-ME');
    expect(err.message).not.toContain(SECRET_KEY.slice(2));
  });
});

describe('anchor creation is race-safe and never double-submits', () => {
  test('a block already reserved by a concurrent request is returned without a second transaction', async () => {
    const { HashBlock, AnchorRecord } = models(makeBlocks(3));
    const winner = { _id: 'w', blockIndex: 2, blockHash: 'x', txRef: TX, status: 'PENDING' };
    AnchorRecord.create = async () => { throw Object.assign(new Error('E11000'), { code: 11000 }); };
    AnchorRecord.findOne = (f) => one(f.blockIndex === 2 ? winner : null);
    const submit = jest.fn();
    const svc = createAnchorService({ provider: { name: 'ethereum', submit }, HashBlock, AnchorRecord });
    const result = await svc.anchorLatest();
    expect(result.created).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  test('a failed submission releases the reservation so the block can be retried', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    const provider = { name: 'ethereum', submit: jest.fn().mockRejectedValue(new ProviderError('not sent')) };
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await expect(svc.anchorLatest()).rejects.toThrow('not sent');
    expect(AnchorRecord.records).toHaveLength(0);
  });

  test('if the transaction was sent but saving fails, the hash is reported and the reservation is kept', async () => {
    const { HashBlock, AnchorRecord } = models(makeBlocks(3));
    AnchorRecord.updateOne = async () => { throw new Error('db down'); };
    const provider = { name: 'ethereum', submit: jest.fn().mockResolvedValue({ ref: TX, submittedAt: new Date() }) };
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await expect(svc.anchorLatest()).rejects.toThrow(TX);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(AnchorRecord.records).toHaveLength(1);
    expect(AnchorRecord.records[0].txRef).toBe('RESERVED');
  });

  test('refresh never queries the chain for a reservation that has no transaction yet', async () => {
    const { HashBlock, AnchorRecord } = models(makeBlocks(3));
    AnchorRecord.records.push({ _id: 'r1', blockIndex: 2, blockHash: 'x', txRef: 'RESERVED', status: 'PENDING' });
    const fetch = jest.fn();
    const svc = createAnchorService({ provider: { name: 'ethereum', fetch }, HashBlock, AnchorRecord });
    const result = await svc.refreshAnchors();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.checked).toBe(1);
  });
});

describe('public trust summary and coverage use only the local database', () => {
  test('no anchors means the public page says so', async () => {
    const { HashBlock, AnchorRecord } = models(makeBlocks(2));
    const s = await publicAnchorSummary({ HashBlock, AnchorRecord });
    expect(s.configured).toBe(false);
    expect(s.latest).toBeNull();
  });

  test('a simulated anchor is labelled as simulated and never gets an explorer link', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push({ _id: 'r1', blockIndex: 2, blockHash: blocks[2].currentHash, txRef: 'MOCK-SIM-' + 'a'.repeat(24), status: 'CONFIRMED', simulated: true, provider: 'mock', network: 'MOCK (no network)' });
    const s = await publicAnchorSummary({ HashBlock, AnchorRecord });
    expect(s.latest.modeLabel).toBe('MOCK / SIMULATED');
    expect(s.latest.explorerUrl).toBeNull();
    expect(s.latest.localCheck).toBe('MATCHES_LEDGER');
    expect(s.counts).toMatchObject({ confirmed: 1, simulated: 1, real: 0 });
  });

  test('a real confirmed anchor links to Sepolia Etherscan, and a pending one does not', () => {
    expect(explorerUrlFor({ provider: 'ethereum', simulated: false, txRef: TX })).toBe(`https://sepolia.etherscan.io/tx/${TX}`);
    expect(explorerUrlFor({ provider: 'ethereum', simulated: false, txRef: 'not-a-hash' })).toBeNull();
    expect(explorerUrlFor({ provider: 'mock', simulated: true, txRef: TX })).toBeNull();
  });

  test('a block changed after anchoring is reported in the local check', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push({ _id: 'r1', blockIndex: 2, blockHash: blocks[2].currentHash, txRef: TX, status: 'CONFIRMED', simulated: false, provider: 'ethereum' });
    blocks[2].currentHash = '0'.repeat(64);
    const s = await publicAnchorSummary({ HashBlock, AnchorRecord });
    expect(s.latest.localCheck).toBe('LEDGER_HASH_CHANGED');
  });

  test('each event is labelled by the anchor that covers it', async () => {
    const blocks = makeBlocks(5);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push({ _id: 'r1', blockIndex: 3, blockHash: blocks[3].currentHash, txRef: 'MOCK-SIM-' + 'b'.repeat(24), status: 'CONFIRMED', simulated: true, provider: 'mock' });
    const labels = await coverageForEvents(
      [{ blockIndex: 2 }, { blockIndex: 4 }],
      { HashBlock, AnchorRecord }
    );
    expect(labels[0]).toMatchObject({ label: 'ANCHORED_SIMULATED', anchorBlockIndex: 3 });
    expect(labels[1]).toMatchObject({ label: 'HASH_CHAIN_ONLY' });
  });

  test('a pending anchor and a mismatched anchor are shown as such, not as anchored', async () => {
    const blocks = makeBlocks(5);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push({ _id: 'r1', blockIndex: 3, blockHash: blocks[3].currentHash, txRef: TX, status: 'PENDING', simulated: false, provider: 'ethereum' });
    let labels = await coverageForEvents([{ blockIndex: 2 }], { HashBlock, AnchorRecord });
    expect(labels[0].label).toBe('ANCHOR_PENDING');

    AnchorRecord.records[0].status = 'CONFIRMED';
    blocks[3].currentHash = '1'.repeat(64);
    labels = await coverageForEvents([{ blockIndex: 2 }], { HashBlock, AnchorRecord });
    expect(labels[0].label).toBe('ANCHOR_PROBLEM');
  });
});

describe('admin verification rows link real anchors to the explorer only', () => {
  test('a confirmed real anchor has an Etherscan link; a simulated one does not', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push(
      { _id: 'r1', blockIndex: 1, blockHash: blocks[1].currentHash, txRef: TX, status: 'CONFIRMED', simulated: false, provider: 'ethereum', network: 'Sepolia' },
      { _id: 'r2', blockIndex: 2, blockHash: blocks[2].currentHash, txRef: 'MOCK-SIM-' + 'c'.repeat(24), status: 'CONFIRMED', simulated: true, provider: 'mock', network: 'MOCK (no network)' }
    );
    const provider = { name: 'ethereum', address: '0x' + '3'.repeat(40), fetch: async () => ({ found: true, from: '0x' + '3'.repeat(40), payload: null }) };
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    const result = await svc.verifyAnchors();
    const real = result.anchors.find((a) => a.blockIndex === 1);
    const sim = result.anchors.find((a) => a.blockIndex === 2);
    expect(real.explorerUrl).toBe(`https://sepolia.etherscan.io/tx/${TX}`);
    expect(sim.explorerUrl).toBeNull();
    expect(result.simulatedCount).toBe(1);
    expect(result.realCount).toBe(1);
  });
});

describe('verification never reports a chain check it did not make', () => {
  const realRow = (blocks, extra = {}) => ({ _id: 'r1', blockIndex: 2, blockHash: blocks[2].currentHash, txRef: TX, status: 'CONFIRMED', simulated: false, provider: 'ethereum', ...extra });

  test('a simulated anchor is never sent to a real RPC endpoint', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push({ _id: 'r1', blockIndex: 2, blockHash: blocks[2].currentHash, txRef: 'MOCK-SIM-' + 'a'.repeat(24), status: 'CONFIRMED', simulated: true, provider: 'mock', network: 'MOCK (no network)' });
    const fetch = jest.fn();
    const provider = { name: 'ethereum', address: '0x' + '3'.repeat(40), fetch };
    const result = await createAnchorService({ provider, HashBlock, AnchorRecord }).verifyAnchors();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.verified).toBe(false);
    expect(result.notices[0].reason).toMatch(/cannot check it, so it is not verified/);
  });

  test('an RPC failure becomes UNAVAILABLE instead of an error, and is not reported as a violation', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push(realRow(blocks));
    const provider = { name: 'ethereum', address: '0x' + '3'.repeat(40), fetch: async () => { throw new ProviderError('Could not read the anchor transaction from the RPC endpoint.'); } };
    const result = await createAnchorService({ provider, HashBlock, AnchorRecord }).verifyAnchors();
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.violations).toHaveLength(0);
    expect(result.verified).toBe(false);
  });

  test('with anchoring disabled, stored anchors are not reported as verified', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push(realRow(blocks));
    const result = await createAnchorService({ provider: null, HashBlock, AnchorRecord }).verifyAnchors();
    expect(result.verified).toBe(false);
    expect(result.status).toBe('UNAVAILABLE');
  });

  test('a real anchor that matches the chain is VERIFIED only when it was actually checked', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push(realRow(blocks));
    const provider = {
      name: 'ethereum', address: '0x' + '3'.repeat(40),
      fetch: async () => ({ found: true, from: '0x' + '3'.repeat(40), payload: { blockIndex: 2, blockHash: blocks[2].currentHash } }),
    };
    const result = await createAnchorService({ provider, HashBlock, AnchorRecord }).verifyAnchors();
    expect(result.status).toBe('VERIFIED');
    expect(result.checkedOnChainCount).toBe(1);
  });

  test('a refresh with an RPC error skips that anchor instead of failing the whole request', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = models(blocks);
    AnchorRecord.records.push({ ...realRow(blocks), status: 'PENDING' });
    const provider = { name: 'ethereum', address: '0x' + '3'.repeat(40), fetch: async () => { throw new Error('boom'); } };
    const result = await createAnchorService({ provider, HashBlock, AnchorRecord }).refreshAnchors();
    expect(result.updated).toHaveLength(0);
    expect(result.unavailable).toHaveLength(1);
    expect(AnchorRecord.records[0].status).toBe('PENDING');
  });
});
