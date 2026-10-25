const assert = require('node:assert/strict');
const { GENESIS_HASH, hashEventData, computeBlockHash, stableStringify } = require('../../services/blockchain/hashCrypto');

// Builds a chain exactly as the server does, without a database.
function buildChain(events) {
  const blocks = [];
  let previousHash = GENESIS_HASH;

  events.forEach((evt, i) => {
    const eventDataHash = hashEventData(evt);
    const index = i + 1;
    const currentHash = computeBlockHash({
      index,
      timestamp: evt.timestamp,
      assetId: evt.assetId,
      eventId: evt.eventId,
      eventDataHash,
      previousHash,
    });
    blocks.push({ index, ...evt, eventDataHash, previousHash, currentHash });
    previousHash = currentHash;
  });

  return blocks;
}

function verifyChain(blocks) {
  let expectedPrev = GENESIS_HASH;
  const violations = [];

  for (const block of blocks) {
    if (block.previousHash !== expectedPrev) {
      violations.push({ index: block.index, reason: 'previousHash mismatch' });
    }

    const recalculatedEventHash = hashEventData(block);
    if (recalculatedEventHash !== block.eventDataHash) {
      violations.push({ index: block.index, reason: 'event data hash mismatch' });
    }

    const recalculatedBlockHash = computeBlockHash({
      index: block.index,
      timestamp: block.timestamp,
      assetId: block.assetId,
      eventId: block.eventId,
      eventDataHash: block.eventDataHash,
      previousHash: block.previousHash,
    });
    if (recalculatedBlockHash !== block.currentHash) {
      violations.push({ index: block.index, reason: 'block hash mismatch' });
    }

    expectedPrev = block.currentHash;
  }

  return { verified: violations.length === 0, violations };
}

const sampleLifecycle = [
  { assetId: 'AST-001', eventId: 'EVT-1', eventType: 'REGISTRATION', description: 'Asset registered', performedByName: 'Admin', timestamp: '2026-01-01T00:00:00.000Z', metadata: {} },
  { assetId: 'AST-001', eventId: 'EVT-2', eventType: 'ALLOCATION', description: 'Allocated to IT', performedByName: 'Manager', timestamp: '2026-01-02T00:00:00.000Z', metadata: { departmentId: 'd1' } },
  { assetId: 'AST-001', eventId: 'EVT-3', eventType: 'MAINTENANCE', description: 'RAM upgraded', performedByName: 'Admin', timestamp: '2026-01-03T00:00:00.000Z', metadata: { result: 'Completed' } },
  { assetId: 'AST-001', eventId: 'EVT-4', eventType: 'TRANSFER', description: 'Transferred to Finance', performedByName: 'Manager', timestamp: '2026-01-04T00:00:00.000Z', metadata: { newDepartmentId: 'd2' } },
  { assetId: 'AST-001', eventId: 'EVT-5', eventType: 'DISPOSAL', description: 'End of life', performedByName: 'Admin', timestamp: '2026-01-05T00:00:00.000Z', metadata: { reason: 'EOL' } },
];

describe('SHA-256 hash chain', () => {
  test('first block links to the genesis hash', () => {
    assert.equal(buildChain(sampleLifecycle)[0].previousHash, GENESIS_HASH);
  });

  test('each block links to the previous block currentHash', () => {
    const chain = buildChain(sampleLifecycle);
    for (let i = 1; i < chain.length; i++) assert.equal(chain[i].previousHash, chain[i - 1].currentHash);
  });

  test('hashing is deterministic for identical input', () => {
    assert.equal(hashEventData(sampleLifecycle[0]), hashEventData(sampleLifecycle[0]));
  });

  test('hashing is independent of object key order (stableStringify)', () => {
    const a = { assetId: 'AST-001', eventId: 'EVT-1', eventType: 'REGISTRATION', description: 'x', performedByName: 'Admin', timestamp: '2026-01-01T00:00:00.000Z', metadata: { a: 1, b: 2 } };
    const b = { metadata: { b: 2, a: 1 }, timestamp: '2026-01-01T00:00:00.000Z', performedByName: 'Admin', description: 'x', eventType: 'REGISTRATION', eventId: 'EVT-1', assetId: 'AST-001' };
    assert.equal(hashEventData(a), hashEventData(b));
    assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  test('a clean chain verifies', () => {
    const result = verifyChain(buildChain(sampleLifecycle));
    assert.equal(result.verified, true);
    assert.equal(result.violations.length, 0);
  });

  test('TAMPER: editing an event description after the fact is caught', () => {
    const chain = buildChain(sampleLifecycle);
    chain[2] = { ...chain[2], description: 'RAM upgraded to 64GB (tampered)' };
    const result = verifyChain(chain);
    assert.equal(result.verified, false);
    assert.ok(result.violations.some((v) => v.index === chain[2].index && v.reason === 'event data hash mismatch'));
  });

  test('TAMPER: swapping block order breaks previousHash linkage', () => {
    const chain = buildChain(sampleLifecycle);
    const result = verifyChain([chain[0], chain[2], chain[1], chain[3], chain[4]]);
    assert.equal(result.verified, false);
    assert.ok(result.violations.length > 0);
  });

  test('TAMPER: altering a stored currentHash is caught, and the next link breaks too', () => {
    const chain = buildChain(sampleLifecycle);
    chain[3] = { ...chain[3], currentHash: 'f'.repeat(64) };
    const result = verifyChain(chain);
    assert.equal(result.verified, false);
    assert.ok(result.violations.some((v) => v.index === chain[3].index && v.reason === 'block hash mismatch'));
    assert.ok(result.violations.some((v) => v.index === chain[4].index && v.reason === 'previousHash mismatch'));
  });

  test('TAMPER: changing metadata (e.g. a transfer destination) is caught', () => {
    const chain = buildChain(sampleLifecycle);
    chain[3] = { ...chain[3], metadata: { newDepartmentId: 'attacker-dept' } };
    assert.equal(verifyChain(chain).verified, false);
  });
});
