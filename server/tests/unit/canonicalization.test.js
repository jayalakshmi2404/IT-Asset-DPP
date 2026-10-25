const assert = require('node:assert/strict');
const { GENESIS_HASH, stableStringify, canonicalEventFields, hashEventData, computeBlockHash } = require('../../services/blockchain/hashCrypto');
const { diagnoseEventMismatch } = require('../../services/verification/verifyChain');
const golden = require('../support/goldenVector.json');

const base = {
  assetId: 'AST-001',
  eventId: 'EVT-1',
  eventType: 'REGISTRATION',
  description: 'Asset registered',
  performedByName: 'Admin',
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
  metadata: { category: 'Laptop', brand: 'Dell', model: '', location: 'Lab' },
};

describe('Canonical serialization and hashing', () => {
  test('golden vector: hashes of records written before this change are unchanged', () => {
    const eventDataHash = hashEventData(base);
    const currentHash = computeBlockHash({
      index: 1,
      timestamp: base.timestamp,
      assetId: base.assetId,
      eventId: base.eventId,
      eventDataHash,
      previousHash: GENESIS_HASH,
    });
    assert.equal(eventDataHash, golden.eventDataHash);
    assert.equal(currentHash, golden.currentHash);
  });

  test('key insertion order never changes the hash', () => {
    const reordered = Object.fromEntries(Object.entries(base).reverse());
    reordered.metadata = { location: 'Lab', model: '', brand: 'Dell', category: 'Laptop' };
    assert.equal(hashEventData(reordered), hashEventData(base));
  });

  test('an absent field and an undefined field hash identically (JSON semantics)', () => {
    const absent = { ...base };
    delete absent.description;
    const undef = { ...base, description: undefined };
    assert.equal(hashEventData(absent), hashEventData(undef));
    assert.equal(stableStringify({ a: undefined, b: 1 }), '{"b":1}');
  });

  test('non-finite numbers and undefined array items follow JSON rules', () => {
    assert.equal(stableStringify([1, undefined, NaN, Infinity]), '[1,null,null,null]');
  });

  test('an unreadable timestamp throws instead of hashing a guess', () => {
    assert.throws(() => hashEventData({ ...base, timestamp: 'not-a-date' }), /Invalid timestamp/);
    assert.throws(() => stableStringify({ d: new Date('nope') }), /Invalid Date/);
  });

  test('canonicalEventFields trims free text and fills missing values, for the WRITE path only', () => {
    const fields = canonicalEventFields({ description: '  Replaced fan  ', performedByName: ' Admin ', metadata: { a: undefined, b: 'x' } });
    assert.deepEqual(fields, { description: 'Replaced fan', performedByName: 'Admin', metadata: { b: 'x' } });
    assert.deepEqual(canonicalEventFields({}), { description: '', performedByName: '', metadata: {} });
  });

  test('the stored (canonical) record hashes to the same value the writer recorded', () => {
    const written = canonicalEventFields({ description: '  Cleaning  ', performedByName: 'Admin', metadata: {} });
    const hashedAtWrite = hashEventData({ ...base, ...written });
    const stored = { ...base, ...written }; // what the database holds
    assert.equal(hashEventData(stored), hashedAtWrite);
  });
});

describe('Mismatch diagnosis (read-only, never changes a result)', () => {
  const block = (eventDataHash) => ({ eventDataHash });

  test('reports a missing description and points out a legacy default match', () => {
    const legacy = { ...base, description: undefined };
    const withDefault = hashEventData({ ...base, description: '' });
    const hints = diagnoseEventMismatch(legacy, block(withDefault));
    assert.ok(hints.some((h) => /no description/.test(h)));
    assert.ok(hints.some((h) => /not proof of tampering/.test(h)));
  });

  test('reports whitespace drift in a stored description', () => {
    const hints = diagnoseEventMismatch({ ...base, description: 'Cleaning ' }, block('0'.repeat(64)));
    assert.ok(hints.some((h) => /whitespace/.test(h)));
  });

  test('a genuine edit produces no legacy explanation', () => {
    const hints = diagnoseEventMismatch({ ...base, description: 'Edited later' }, block(hashEventData(base)));
    assert.deepEqual(hints, []);
  });
});
