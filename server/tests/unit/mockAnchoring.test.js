const crypto = require('crypto');
const { createAnchorService } = require('../../services/anchoring/anchorService');
const { createMockProvider, MOCK_REF_PREFIX } = require('../../services/anchoring/mockProvider');
const { createEthereumProvider, ProviderError } = require('../../services/anchoring/provider');
const { loadProvider, describeProvider } = require('../../services/anchoring');
const { validateConfig } = require('../../config/env');

const h = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** In-memory stand-ins for the three models the anchoring code uses. */
function q(result) {
  return { sort() { return this; }, lean: async () => result };
}
function fakeStores(blocks) {
  const mockTxs = [];
  const records = [];
  let seq = 0;
  return {
    blocks, mockTxs, records,
    HashBlock: {
      findOne(filter) {
        if (!filter) return q(blocks.length ? blocks[blocks.length - 1] : null);
        return q(blocks.find((b) => b.index === filter.index) || null);
      },
    },
    AnchorRecord: {
      async create(doc) { const rec = { _id: `r${++seq}`, ...doc, toObject() { return { ...this }; } }; records.push(rec); return rec; },
      findOne(filter) { return q(records.find((r) => r.blockIndex === filter.blockIndex) || null); },
      find(filter = {}) { return q(records.filter((r) => !filter.status || r.status === filter.status).map((r) => ({ ...r }))); },
      async updateOne(filter, update) { const rec = records.find((r) => r._id === filter._id); if (rec) Object.assign(rec, update.$set); return {}; },
      async deleteOne(filter) { const i = records.findIndex((r) => r._id === filter._id); if (i >= 0) records.splice(i, 1); return {}; },
    },
    MockAnchorTx: {
      findOne(filter) { return q(mockTxs.find((t) => t.ref === filter.ref) || null); },
      async create(doc) { mockTxs.push({ ...doc }); return doc; },
    },
  };
}
function makeBlocks(n) {
  const out = [];
  let prev = '0'.repeat(64);
  for (let i = 0; i < n; i++) {
    const currentHash = h(`b${i}${prev}`);
    out.push({ index: i, eventId: `E${i}`, previousHash: prev, currentHash });
    prev = currentHash;
  }
  return out;
}

describe('mock provider: setup needs nothing external', () => {
  test('ANCHOR_PROVIDER=mock loads without RPC URL, private key or network', () => {
    const provider = loadProvider({ ANCHOR_PROVIDER: 'mock' }, { MockAnchorTx: fakeStores([]).MockAnchorTx });
    expect(provider.name).toBe('mock');
    expect(provider.simulated).toBe(true);
  });

  test('configuration validation accepts mock with no anchor secrets at all', () => {
    expect(validateConfig({ MONGODB_URI: 'mongodb+srv://u:p@c.example.net/d', JWT_SECRET: 'x'.repeat(40), ANCHOR_PROVIDER: 'mock' })).toEqual([]);
  });

  test('ANCHOR_PROVIDER unset or "none" stays disabled', () => {
    expect(loadProvider({})).toBeNull();
    expect(describeProvider(null)).toMatchObject({ kind: 'none', label: 'Disabled — Anchoring Not Enabled', real: false });
  });
});

describe('mock provider: simulated anchoring', () => {
  test('the reference is clearly simulated and never looks like an Ethereum transaction hash', async () => {
    const stores = fakeStores(makeBlocks(2));
    const provider = createMockProvider({ MockAnchorTx: stores.MockAnchorTx });
    const { ref } = await provider.submit({ blockIndex: 1, blockHash: stores.blocks[1].currentHash });
    expect(ref.startsWith(MOCK_REF_PREFIX)).toBe(true);
    expect(/^0x[0-9a-fA-F]{64}$/.test(ref)).toBe(false);
  });

  test('references are deterministic and submitting twice stores one simulated row', async () => {
    const stores = fakeStores(makeBlocks(2));
    const provider = createMockProvider({ MockAnchorTx: stores.MockAnchorTx });
    const payload = { blockIndex: 1, blockHash: stores.blocks[1].currentHash };
    const a = await provider.submit(payload);
    const b = await provider.submit(payload);
    expect(a.ref).toBe(b.ref);
    expect(stores.mockTxs).toHaveLength(1);
    expect(stores.mockTxs[0].from).toBe('MOCK-SIGNER');
  });

  test('a valid simulated anchor verifies end to end and every row is marked simulated', async () => {
    const stores = fakeStores(makeBlocks(3));
    const provider = createMockProvider({ MockAnchorTx: stores.MockAnchorTx });
    const svc = createAnchorService({ provider, HashBlock: stores.HashBlock, AnchorRecord: stores.AnchorRecord });

    const created = await svc.anchorLatest({ userName: 'Admin' });
    expect(created.record).toMatchObject({ simulated: true, network: 'MOCK (no network)', blockIndex: 2, status: 'PENDING' });
    await svc.refreshAnchors();
    const result = await svc.verifyAnchors();
    expect(result.status).toBe('VERIFIED');
    expect(result.anchors.every((a) => a.simulated === true)).toBe(true);
  });

  test('a recorded anchor whose payload no longer matches the block hash is detected', async () => {
    const stores = fakeStores(makeBlocks(3));
    const provider = createMockProvider({ MockAnchorTx: stores.MockAnchorTx });
    const svc = createAnchorService({ provider, HashBlock: stores.HashBlock, AnchorRecord: stores.AnchorRecord });
    await svc.anchorLatest();
    await svc.refreshAnchors();
    stores.mockTxs[0].payload = `DPP-ANCHOR|v1|2|${h('not the block')}`;
    const result = await svc.verifyAnchors();
    expect(result.status).toBe('VIOLATION_DETECTED');
    expect(result.violations.some((v) => /does not carry the stored block hash/.test(v.reason))).toBe(true);
  });
});

describe('UI labels: the mock is never presented as a real transaction', () => {
  test('exact labels for each provider', () => {
    expect(describeProvider(createMockProvider({ MockAnchorTx: fakeStores([]).MockAnchorTx })).label)
      .toBe('Mock Mode — Simulated, No Real Blockchain');
    expect(describeProvider({ name: 'ethereum', chainId: 11155111 }).label)
      .toBe('Ethereum Sepolia — Real Testnet Transaction');
  });

  test('mock labels never mention Ethereum or a real transaction', () => {
    const info = describeProvider(createMockProvider({ MockAnchorTx: fakeStores([]).MockAnchorTx }));
    expect(info.real).toBe(false);
    expect(info.label).not.toMatch(/Ethereum|Sepolia|Real Testnet/);
  });
});

describe('Ethereum mode refuses unsafe or wrong configuration', () => {
  const base = { MONGODB_URI: 'mongodb+srv://u:p@c.example.net/d', JWT_SECRET: 'x'.repeat(40) };

  test('ethereum mode without RPC URL or key is a configuration error (no silent mock fallback)', () => {
    const problems = validateConfig({ ...base, ANCHOR_PROVIDER: 'ethereum' }).join('\n');
    expect(problems).toMatch(/ANCHOR_RPC_URL/);
    expect(problems).toMatch(/ANCHOR_PRIVATE_KEY/);
  });

  test('a non-positive chain id is refused', () => {
    const problems = validateConfig({ ...base, ANCHOR_PROVIDER: 'ethereum', ANCHOR_RPC_URL: 'https://rpc.example.org', ANCHOR_PRIVATE_KEY: '0x' + 'a'.repeat(64), ANCHOR_CHAIN_ID: '0' });
    expect(problems.join('\n')).toMatch(/ANCHOR_CHAIN_ID/);
  });

  test('an RPC endpoint on the wrong chain is refused before any transaction is sent', async () => {
    const sent = [];
    const fakeEthers = {
      JsonRpcProvider: class {},
      Wallet: class { constructor() { this.address = '0x' + '3'.repeat(40); } async sendTransaction(tx) { sent.push(tx); return { hash: '0x1' }; } },
      hexlify: (b) => '0x' + Buffer.from(b).toString('hex'),
      toUtf8Bytes: (s) => Buffer.from(s),
      toUtf8String: (x) => x,
    };
    const provider = createEthereumProvider({
      ethers: fakeEthers, privateKey: '0x' + '1'.repeat(64), expectedChainId: 11155111,
      rpc: { async getNetwork() { return { chainId: 1n }; } },
    });
    await expect(provider.submit({ blockIndex: 0, blockHash: h('x') })).rejects.toBeInstanceOf(ProviderError);
    expect(sent).toHaveLength(0);
  });
});

describe('no secret leakage', () => {
  const SECRET_KEY = '0x' + 'f0'.repeat(32);
  const SECRET_URL = 'https://eth-sepolia.g.alchemy.com/v2/SUPER-SECRET-API-KEY-123';

  test('a bad private key is not echoed in the error', () => {
    const fakeEthers = {
      JsonRpcProvider: class {},
      Wallet: class { constructor() { throw new Error(`invalid private key ${SECRET_KEY}`); } },
    };
    try {
      createEthereumProvider({ ethers: fakeEthers, rpcUrl: SECRET_URL, privateKey: SECRET_KEY });
      throw new Error('expected failure');
    } catch (err) {
      expect(err.message).not.toContain(SECRET_KEY);
      expect(err.message).not.toContain('SUPER-SECRET');
      expect(err.message).not.toContain(SECRET_URL);
    }
  });

  test('an RPC failure that would include the URL is replaced with a generic message', async () => {
    const fakeEthers = { JsonRpcProvider: class {}, Wallet: class { constructor() { this.address = '0x' + '4'.repeat(40); } }, toUtf8String: () => '' };
    const provider = createEthereumProvider({
      ethers: fakeEthers, privateKey: SECRET_KEY,
      rpc: { async getNetwork() { throw new Error(`request to ${SECRET_URL} failed`); } },
    });
    try {
      await provider.fetch('0xabc');
      throw new Error('expected failure');
    } catch (err) {
      expect(err.message).not.toContain('SUPER-SECRET');
      expect(err.message).not.toContain(SECRET_KEY);
    }
  });

  test('provider objects and their description expose no key or URL', () => {
    const fakeEthers = { JsonRpcProvider: class {}, Wallet: class { constructor() { this.address = '0x' + '5'.repeat(40); } }, toUtf8String: () => '' };
    const provider = createEthereumProvider({ ethers: fakeEthers, rpcUrl: SECRET_URL, privateKey: SECRET_KEY, rpc: {} });
    const dump = JSON.stringify({ provider, info: describeProvider(provider) });
    expect(dump).not.toContain(SECRET_KEY.slice(2));
    expect(dump).not.toContain('SUPER-SECRET');
    expect(dump).not.toContain(SECRET_URL);
  });
});
