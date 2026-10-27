const crypto = require('crypto');
const { createAnchorService } = require('../../services/anchoring/anchorService');
const { encodePayload, decodePayload, createEthereumProvider } = require('../../services/anchoring/provider');
const { loadProvider } = require('../../services/anchoring');
const { validateConfig } = require('../../config/env');

const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ADDR = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

/** Minimal chainable query: find(...).sort(...).lean() and findOne(...).lean() */
function q(result) {
  return { sort() { return this; }, lean: async () => result };
}

function fakeModels(blocks) {
  const HashBlock = {
    blocks,
    findOne(filter) {
      if (!filter) return q(blocks.length ? blocks[blocks.length - 1] : null);
      return q(blocks.find((b) => b.index === filter.index) || null);
    },
  };
  let seq = 0;
  const records = [];
  const AnchorRecord = {
    records,
    async create(doc) {
      const rec = { _id: `r${++seq}`, ...doc, toObject() { return { ...this }; } };
      records.push(rec);
      return rec;
    },
    findOne(filter) { return q(records.find((r) => r.blockIndex === filter.blockIndex) || null); },
    find(filter = {}) {
      return q(records.filter((r) => !filter.status || r.status === filter.status).map((r) => ({ ...r })));
    },
    async updateOne(filter, update) {
      const rec = records.find((r) => r._id === filter._id);
      if (rec) Object.assign(rec, update.$set);
      return { modifiedCount: rec ? 1 : 0 };
    },
    async deleteOne(filter) {
      const i = records.findIndex((r) => r._id === filter._id);
      if (i >= 0) records.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
  };
  return { HashBlock, AnchorRecord };
}

function makeBlocks(n) {
  const blocks = [];
  let prev = '0'.repeat(64);
  for (let i = 0; i < n; i++) {
    const currentHash = h(`block-${i}-${prev}`);
    blocks.push({ index: i, eventId: `EVT-${i}`, previousHash: prev, currentHash });
    prev = currentHash;
  }
  return blocks;
}

function sepoliaRpc(chainId = 11155111n) {
  return { async getNetwork() { return { chainId }; } };
}

function fakeProvider(overrides = {}) {
  const txs = new Map();
  let n = 0;
  return {
    name: 'ethereum',
    address: ADDR,
    txs,
    async submit(payload) {
      const ref = `0xtx${++n}`;
      txs.set(ref, { found: true, from: ADDR, payload, failed: false, confirmed: true, confirmations: 3 });
      return { ref, submittedAt: new Date() };
    },
    async fetch(ref) {
      return txs.get(ref) || { found: false };
    },
    ...overrides,
  };
}

describe('payload encoding', () => {
  test('round-trips a block index and hash', () => {
    const hash = h('x');
    const text = encodePayload({ blockIndex: 7, blockHash: hash });
    expect(text).toBe(`DPP-ANCHOR|v1|7|${hash}`);
    expect(decodePayload(text)).toEqual({ blockIndex: 7, blockHash: hash });
  });

  test('rejects text that is not an anchor', () => {
    expect(decodePayload('hello')).toBeNull();
    expect(decodePayload('DPP-ANCHOR|v1|-1|' + h('x'))).toBeNull();
    expect(decodePayload('DPP-ANCHOR|v1|2|not-a-hash')).toBeNull();
    expect(decodePayload(undefined)).toBeNull();
  });
});

describe('anchorLatest', () => {
  test('anchors the current head once and returns the existing record on repeat', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = fakeModels(blocks);
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });

    const first = await svc.anchorLatest({ userName: 'Admin' });
    expect(first.created).toBe(true);
    expect(first.record.blockIndex).toBe(2);
    expect(first.record.blockHash).toBe(blocks[2].currentHash);
    expect(first.record.status).toBe('PENDING');
    expect(first.record.createdByName).toBe('Admin');

    const second = await svc.anchorLatest({ userName: 'Admin' });
    expect(second.created).toBe(false);
    expect(AnchorRecord.records).toHaveLength(1);
  });

  test('refuses when anchoring is not configured', async () => {
    const { HashBlock, AnchorRecord } = fakeModels(makeBlocks(1));
    const svc = createAnchorService({ provider: null, HashBlock, AnchorRecord });
    await expect(svc.anchorLatest()).rejects.toMatchObject({ statusCode: 503 });
  });

  test('refuses on an empty ledger', async () => {
    const { HashBlock, AnchorRecord } = fakeModels([]);
    const svc = createAnchorService({ provider: fakeProvider(), HashBlock, AnchorRecord });
    await expect(svc.anchorLatest()).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('refreshAnchors', () => {
  test('moves a pending anchor to CONFIRMED when the chain shows the same hash from our account', async () => {
    const blocks = makeBlocks(2);
    const { HashBlock, AnchorRecord } = fakeModels(blocks);
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    provider.txs.get('0xtx1').confirmed = false; // not yet mined
    expect((await svc.refreshAnchors()).updated).toEqual([]);
    expect(AnchorRecord.records[0].status).toBe('PENDING');

    provider.txs.get('0xtx1').confirmed = true;
    const result = await svc.refreshAnchors();
    expect(result.updated).toEqual([{ blockIndex: 1, status: 'CONFIRMED' }]);
    expect(AnchorRecord.records[0].status).toBe('CONFIRMED');
    expect(AnchorRecord.records[0].confirmedAt).toBeInstanceOf(Date);
  });

  test('marks FAILED when the on-chain payload carries a different hash', async () => {
    const blocks = makeBlocks(1);
    const { HashBlock, AnchorRecord } = fakeModels(blocks);
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    provider.txs.get('0xtx1').payload = { blockIndex: 0, blockHash: h('something else') };
    await svc.refreshAnchors();
    expect(AnchorRecord.records[0].status).toBe('FAILED');
    expect(AnchorRecord.records[0].statusNote).toMatch(/does not carry this block hash/);
  });

  test('marks FAILED when the transaction was sent by another account', async () => {
    const { HashBlock, AnchorRecord } = fakeModels(makeBlocks(1));
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    provider.txs.get('0xtx1').from = OTHER;
    await svc.refreshAnchors();
    expect(AnchorRecord.records[0].status).toBe('FAILED');
  });
});

describe('verifyAnchors', () => {
  test('reports NO_ANCHORS and never claims verification when nothing was anchored', async () => {
    const { HashBlock, AnchorRecord } = fakeModels(makeBlocks(2));
    const svc = createAnchorService({ provider: fakeProvider(), HashBlock, AnchorRecord });
    const result = await svc.verifyAnchors();
    expect(result.status).toBe('NO_ANCHORS');
    expect(result.verified).toBe(false);
  });

  test('VERIFIED when a confirmed anchor matches the ledger and the chain', async () => {
    const { HashBlock, AnchorRecord } = fakeModels(makeBlocks(3));
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    await svc.refreshAnchors();
    const result = await svc.verifyAnchors();
    expect(result.status).toBe('VERIFIED');
    expect(result.verified).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.confirmedCount).toBe(1);
  });

  test('detects a block rewritten after it was anchored', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = fakeModels(blocks);
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    await svc.refreshAnchors();
    blocks[2].currentHash = h('rewritten');
    const result = await svc.verifyAnchors();
    expect(result.status).toBe('VIOLATION_DETECTED');
    expect(result.verified).toBe(false);
    expect(result.violations[0].reason).toMatch(/changed after anchoring/);
  });

  test('detects an anchored block that was removed from the ledger', async () => {
    const blocks = makeBlocks(3);
    const { HashBlock, AnchorRecord } = fakeModels(blocks);
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    await svc.refreshAnchors();
    blocks.pop();
    const result = await svc.verifyAnchors();
    expect(result.violations.some((v) => /missing from the ledger/.test(v.reason))).toBe(true);
  });

  test('detects an external transaction that cannot be found', async () => {
    const { HashBlock, AnchorRecord } = fakeModels(makeBlocks(2));
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    await svc.refreshAnchors();
    provider.txs.delete('0xtx1');
    const result = await svc.verifyAnchors();
    expect(result.violations.some((v) => /cannot be found on the external chain/.test(v.reason))).toBe(true);
    expect(result.verified).toBe(false);
  });

  test('pending-only anchors are not verified', async () => {
    const { HashBlock, AnchorRecord } = fakeModels(makeBlocks(2));
    const provider = fakeProvider();
    const svc = createAnchorService({ provider, HashBlock, AnchorRecord });
    await svc.anchorLatest();
    provider.txs.get('0xtx1').confirmed = false;
    const result = await svc.verifyAnchors();
    expect(result.status).toBe('PENDING');
    expect(result.verified).toBe(false);
    expect(result.pendingCount).toBe(1);
  });
});

describe('ethereum provider (fake ethers and RPC client)', () => {
  function fakeEthers() {
    const sent = [];
    class Wallet {
      constructor(pk, client) { this.address = ADDR; this.client = client; }
      async sendTransaction(tx) { sent.push(tx); return { hash: '0xabc' }; }
    }
    return {
      sent,
      lib: {
        JsonRpcProvider: class {},
        Wallet,
        hexlify: (bytes) => '0x' + Buffer.from(bytes).toString('hex'),
        toUtf8Bytes: (s) => Buffer.from(s, 'utf8'),
        toUtf8String: (hex) => {
          if (!/^0x([0-9a-f]{2})*$/i.test(hex)) throw new Error('bad hex');
          return Buffer.from(hex.slice(2), 'hex').toString('utf8');
        },
      },
    };
  }

  test('submit sends a zero-value self transaction carrying only the anchor text', async () => {
    const { lib, sent } = fakeEthers();
    const provider = createEthereumProvider({ ethers: lib, rpc: sepoliaRpc(), privateKey: '0x' + '1'.repeat(64) });
    const hash = h('block');
    const out = await provider.submit({ blockIndex: 4, blockHash: hash });
    expect(out.ref).toBe('0xabc');
    expect(sent[0].to).toBe(ADDR);
    expect(sent[0].value).toBe(0n);
    expect(Buffer.from(sent[0].data.slice(2), 'hex').toString('utf8')).toBe(`DPP-ANCHOR|v1|4|${hash}`);
  });

  test('fetch reports confirmation only after the minimum number of confirmations', async () => {
    const { lib } = fakeEthers();
    const hash = h('block');
    let head = 10;
    const rpc = {
      ...sepoliaRpc(),
      async getTransaction() { return { from: ADDR, data: '0x' + Buffer.from(`DPP-ANCHOR|v1|1|${hash}`).toString('hex') }; },
      async getTransactionReceipt() { return { blockNumber: 10, status: 1 }; },
      async getBlockNumber() { return head; },
    };
    const provider = createEthereumProvider({ ethers: lib, rpc, privateKey: '0x' + '1'.repeat(64), minConfirmations: 3 });
    let r = await provider.fetch('0xabc');
    expect(r.found).toBe(true);
    expect(r.confirmed).toBe(false); // only 1 confirmation so far
    head = 12;
    r = await provider.fetch('0xabc');
    expect(r.confirmed).toBe(true);
    expect(r.payload).toEqual({ blockIndex: 1, blockHash: hash });
  });

  test('fetch reports reverted transactions as failed', async () => {
    const { lib } = fakeEthers();
    const rpc = {
      ...sepoliaRpc(),
      async getTransaction() { return { from: ADDR, data: '0x' }; },
      async getTransactionReceipt() { return { blockNumber: 1, status: 0 }; },
      async getBlockNumber() { return 1; },
    };
    const provider = createEthereumProvider({ ethers: lib, rpc, privateKey: '0x' + '1'.repeat(64) });
    const r = await provider.fetch('0xabc');
    expect(r.failed).toBe(true);
    expect(r.confirmed).toBe(false);
  });
});

describe('provider selection and configuration', () => {
  test('ANCHOR_PROVIDER unset or "none" disables anchoring', () => {
    expect(loadProvider({})).toBeNull();
    expect(loadProvider({ ANCHOR_PROVIDER: 'none' })).toBeNull();
  });

  test('unknown provider names are rejected', () => {
    expect(() => loadProvider({ ANCHOR_PROVIDER: 'bitcoin' })).toThrow(/must be "none", "mock" or "ethereum"/);
  });

  const base = { MONGODB_URI: 'mongodb+srv://u:p@cluster.example.net/db', JWT_SECRET: 'x'.repeat(40) };

  test('no anchor settings means no extra configuration problems', () => {
    expect(validateConfig(base)).toEqual([]);
  });

  test('ethereum mode requires an RPC URL and a well-formed key', () => {
    const problems = validateConfig({ ...base, ANCHOR_PROVIDER: 'ethereum' });
    expect(problems.join('\n')).toMatch(/ANCHOR_RPC_URL/);
    expect(problems.join('\n')).toMatch(/ANCHOR_PRIVATE_KEY/);
  });

  test('a valid ethereum configuration passes', () => {
    const problems = validateConfig({
      ...base,
      ANCHOR_PROVIDER: 'ethereum',
      ANCHOR_RPC_URL: 'https://rpc.example.org',
      ANCHOR_PRIVATE_KEY: '0x' + 'a'.repeat(64),
      ANCHOR_MIN_CONFIRMATIONS: '2',
    });
    expect(problems).toEqual([]);
  });

  test('placeholder private keys are refused', () => {
    const problems = validateConfig({
      ...base,
      ANCHOR_PROVIDER: 'ethereum',
      ANCHOR_RPC_URL: 'https://rpc.example.org',
      ANCHOR_PRIVATE_KEY: '0x<your-key-here>',
    });
    expect(problems.join('\n')).toMatch(/ANCHOR_PRIVATE_KEY/);
  });
});
