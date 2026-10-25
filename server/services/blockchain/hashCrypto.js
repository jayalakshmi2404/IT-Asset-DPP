const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

/**
 * Converts a value into the exact JSON-safe shape that gets hashed. This is the ONE
 * canonical form used by both the write path and the verification path:
 *   - object keys are sorted, so key insertion order never matters
 *   - undefined / function / symbol properties are omitted (JSON semantics), so an
 *     absent field and an undefined field hash identically
 *   - undefined array items and non-finite numbers become null (JSON semantics)
 *   - Dates become their ISO-8601 UTC string; invalid Dates throw
 */
function toCanonical(value) {
  if (value === null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Invalid Date cannot be hashed');
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined || typeof item === 'function' || typeof item === 'symbol' ? null : toCanonical(item)));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      out[key] = toCanonical(item);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

/** Deterministic JSON string of a value in canonical form. */
function stableStringify(value) {
  return JSON.stringify(toCanonical(value));
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Strict ISO timestamp used in every hash. Throws on an unreadable value instead of guessing. */
function isoTimestamp(timestamp) {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(d.getTime())) throw new TypeError('Invalid timestamp cannot be hashed');
  return d.toISOString();
}

/**
 * Normalises the free-form fields of a NEW lifecycle event before it is hashed AND stored.
 * The writer stores exactly these values, so the stored record always equals what was hashed.
 * The verifier does NOT call this: it hashes the stored record as it is, so a record that was
 * changed or that lacks a field written by an older build is reported, not silently repaired.
 */
function canonicalEventFields({ description, performedByName, metadata } = {}) {
  return {
    description: typeof description === 'string' ? description.trim() : '',
    performedByName: typeof performedByName === 'string' ? performedByName.trim() : '',
    metadata: JSON.parse(JSON.stringify(metadata ?? {})),
  };
}

/**
 * Hash of the raw event payload only (what actually happened), independent of chain position.
 * Used to detect whether the event DATA was altered.
 */
function hashEventData({ assetId, eventId, eventType, description, performedByName, timestamp, metadata }) {
  const payload = {
    assetId,
    eventId,
    eventType,
    description,
    performedByName,
    timestamp: isoTimestamp(timestamp),
    metadata,
  };
  return sha256(stableStringify(payload));
}

/**
 * The block's own hash: binds index + timestamp + assetId + eventId + eventDataHash +
 * previousHash together. Changing ANY of these, or the order of blocks, breaks the chain.
 */
function computeBlockHash({ index, timestamp, assetId, eventId, eventDataHash, previousHash }) {
  const payload = { index, timestamp: isoTimestamp(timestamp), assetId, eventId, eventDataHash, previousHash };
  return sha256(stableStringify(payload));
}

module.exports = {
  GENESIS_HASH,
  sha256,
  stableStringify,
  toCanonical,
  isoTimestamp,
  canonicalEventFields,
  hashEventData,
  computeBlockHash,
};
