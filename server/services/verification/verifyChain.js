const HashBlock = require('../../models/HashBlock');
const LifecycleEvent = require('../../models/LifecycleEvent');
const { hashEventData, computeBlockHash, GENESIS_HASH } = require('../blockchain/hashCrypto');

const GENESIS_EVENT_ID = 'GENESIS';

/**
 * Verification is strict: it recomputes every hash from the STORED data and never applies
 * defaults, repairs or assumptions. Any difference is reported as a violation. Nothing here
 * returns "verified" unless every check passed against a non-empty record set.
 */

/** Recomputes an event's data hash from its stored record. Returns null if the record cannot be hashed. */
function recalcEventHash(record) {
  try {
    return hashEventData({
      assetId: record.assetId,
      eventId: record.eventId,
      eventType: record.eventType,
      description: record.description,
      performedByName: record.performedByName,
      timestamp: record.timestamp,
      metadata: record.metadata,
    });
  } catch {
    return null;
  }
}

/** Recomputes a block's own hash from its stored fields. Returns null if the block cannot be hashed. */
function recalcBlockHash(block) {
  try {
    return computeBlockHash({
      index: block.index,
      timestamp: block.timestamp,
      assetId: block.assetId,
      eventId: block.eventId,
      eventDataHash: block.eventDataHash,
      previousHash: block.previousHash,
    });
  } catch {
    return null;
  }
}

/**
 * Read-only explanation for an event-data mismatch. It never changes the result: a mismatch stays
 * a violation. It only tells an administrator WHY the stored record differs from what the block
 * recorded, so the cause (legacy field missing, whitespace drift, or a real edit) can be judged.
 */
function diagnoseEventMismatch(event, block) {
  const hints = [];
  if (event.description === undefined || event.description === null) {
    hints.push('The stored record has no description. Records written before the field existed hash differently.');
  } else if (typeof event.description === 'string' && event.description !== event.description.trim()) {
    hints.push('The stored description has leading or trailing whitespace that was not present when it was hashed.');
  }
  if (event.metadata === undefined || event.metadata === null) {
    hints.push('The stored record has no metadata object.');
  }

  // Would the block's hash match if the write-time defaults had been applied? If so the data
  // looks like a legacy record written without those fields. It is still NOT verified.
  const withDefaults = recalcEventHash({
    ...event,
    description: event.description ?? '',
    performedByName: event.performedByName ?? '',
    metadata: event.metadata ?? {},
  });
  if (withDefaults && withDefaults === block.eventDataHash) {
    hints.push('The block hash matches once write-time defaults are applied. This points to a legacy record, not proof of tampering, but it still requires administrator review.');
  }
  return hints;
}

function unavailable(message) {
  return { status: 'UNAVAILABLE', verified: false, totalBlocks: 0, totalEvents: 0, checkedAt: new Date().toISOString(), violations: [], message };
}

/**
 * Verifies the ENTIRE global hash chain, block by block:
 *  1. Block 0 is the genesis block; indexes are sequential (no missing or reordered blocks)
 *  2. previousHash of block N equals currentHash of block N-1
 *  3. each block's currentHash recalculates from its stored fields
 *  4. each block references exactly one lifecycle record; the record exists, points back to the
 *     same block index, asset, and hashes, and its data still hashes to eventDataHash
 *  5. every lifecycle record in the database is referenced by a block (no orphaned records)
 */
async function verifyFullChain() {
  const blocks = await HashBlock.find().sort({ index: 1 }).lean();
  if (blocks.length === 0) {
    return unavailable('Ledger is empty: no genesis block exists yet. Nothing has been verified.');
  }

  const events = await LifecycleEvent.find({}).lean();
  const eventById = new Map(events.map((e) => [e.eventId, e]));
  const referencedEventIds = new Set();
  const violations = [];
  let expectedPrevHash = GENESIS_HASH;

  blocks.forEach((block, i) => {
    const push = (reason, extra = {}) => violations.push({ blockIndex: block.index, eventId: block.eventId, assetId: block.assetId, reason, ...extra });

    if (block.index !== i) {
      push(`Expected block index ${i} but found ${block.index}. Chain sequence broken (missing or reordered block).`);
    }
    if (i === 0 && block.eventId !== GENESIS_EVENT_ID) {
      push('The first ledger block is not the genesis block.');
    }
    if (block.previousHash !== expectedPrevHash) {
      push('previousHash does not match the currentHash of the prior block. Chain link broken.');
    }
    if (recalcBlockHash(block) !== block.currentHash) {
      push('Stored currentHash does not match the recalculated hash. Block record has been altered.');
    }

    // Only the genesis block at index 0 is allowed to lack a lifecycle record.
    if (!(i === 0 && block.eventId === GENESIS_EVENT_ID)) {
      if (referencedEventIds.has(block.eventId)) {
        push('Two ledger blocks reference the same lifecycle record.');
      }
      referencedEventIds.add(block.eventId);

      const event = eventById.get(block.eventId);
      if (!event) {
        push('Linked lifecycle event record is missing from the database.');
      } else {
        if (recalcEventHash(event) !== block.eventDataHash) {
          push('Lifecycle event data does not match its original recorded hash. Event was modified after creation.', {
            assetId: block.assetId,
            diagnosis: diagnoseEventMismatch(event, block),
          });
        }
        if (event.blockIndex !== block.index || event.assetId !== block.assetId) {
          push('Lifecycle record points to a different ledger block or asset than the one it is stored against.');
        }
        if (event.currentHash !== block.currentHash || event.previousHash !== block.previousHash) {
          push('Lifecycle record hash references do not match the ledger block. Possible tampering.');
        }
      }
    }

    expectedPrevHash = block.currentHash;
  });

  for (const event of events) {
    if (!referencedEventIds.has(event.eventId)) {
      violations.push({
        eventId: event.eventId,
        assetId: event.assetId,
        reason: 'Lifecycle record has no ledger block. Its block was deleted or the record was inserted outside the ledger.',
      });
    }
  }

  const verified = violations.length === 0;
  return {
    status: verified ? 'VERIFIED' : 'VIOLATION_DETECTED',
    verified,
    totalBlocks: blocks.length,
    totalEvents: events.length,
    checkedAt: new Date().toISOString(),
    violations,
    message: verified
      ? 'HASH CHAIN VERIFIED — all blocks and linked event data match their recorded hashes.'
      : 'INTEGRITY VIOLATION DETECTED — one or more blocks failed verification.',
  };
}

/**
 * Verifies the lifecycle records of a single asset against the ledger.
 *  - the asset has at least one lifecycle record, including its REGISTRATION record
 *  - every lifecycle record has a matching ledger block for the same asset and index
 *  - each record's data still hashes to the block's eventDataHash
 *  - each block's own hash still recalculates correctly
 *  - the record's stored hash references match the block
 *  - every ledger block for this asset still has its lifecycle record
 *
 * A per-asset check cannot prove the global previous-hash links. Those are proven by verifyFullChain().
 */
async function verifyAssetChain(assetId) {
  const [events, blocksForAsset] = await Promise.all([
    LifecycleEvent.find({ assetId }).sort({ blockIndex: 1 }).lean(),
    HashBlock.find({ assetId }).lean(),
  ]);
  const violations = [];

  if (events.length === 0) {
    violations.push({ reason: 'No lifecycle records exist for this asset. Every asset must have at least a REGISTRATION record.' });
  } else if (!events.some((e) => e.eventType === 'REGISTRATION')) {
    violations.push({ reason: 'The REGISTRATION record for this asset is missing.' });
  }

  const blockByEventId = new Map(blocksForAsset.map((b) => [b.eventId, b]));
  const eventIds = new Set(events.map((e) => e.eventId));

  for (const event of events) {
    const block = blockByEventId.get(event.eventId) || (await HashBlock.findOne({ eventId: event.eventId }).lean());
    if (!block) {
      violations.push({ eventId: event.eventId, eventType: event.eventType, reason: 'No matching hash-chain block found for this event.' });
      continue;
    }

    if (block.assetId !== event.assetId) {
      violations.push({ eventId: event.eventId, eventType: event.eventType, blockIndex: block.index, reason: 'The ledger block belongs to a different asset than this record.' });
      continue;
    }

    if (recalcEventHash(event) !== block.eventDataHash) {
      violations.push({
        eventId: event.eventId,
        eventType: event.eventType,
        blockIndex: block.index,
        reason: 'Event data does not match its recorded hash. Record was altered after creation.',
        diagnosis: diagnoseEventMismatch(event, block),
      });
      continue;
    }

    if (recalcBlockHash(block) !== block.currentHash) {
      violations.push({
        eventId: event.eventId,
        eventType: event.eventType,
        blockIndex: block.index,
        reason: 'Block hash does not match recalculated hash. Ledger record was altered.',
      });
    }

    if (event.blockIndex !== block.index) {
      violations.push({
        eventId: event.eventId,
        eventType: event.eventType,
        blockIndex: block.index,
        reason: 'The lifecycle record points to a different ledger block index than the block that holds it.',
      });
    }

    if (event.previousHash !== block.previousHash || event.currentHash !== block.currentHash) {
      violations.push({
        eventId: event.eventId,
        eventType: event.eventType,
        blockIndex: block.index,
        reason: 'Event hash references do not match the ledger block. Possible tampering.',
      });
    }
  }

  // Ledger blocks for this asset whose lifecycle record has been removed
  for (const block of blocksForAsset) {
    if (!eventIds.has(block.eventId)) {
      violations.push({
        eventId: block.eventId,
        blockIndex: block.index,
        reason: 'Ledger block exists but its lifecycle record is missing. Record was deleted.',
      });
    }
  }

  const verified = violations.length === 0;
  return {
    status: verified ? 'VERIFIED' : 'VIOLATION_DETECTED',
    verified,
    totalEvents: events.length,
    checkedAt: new Date().toISOString(),
    violations,
    message: verified ? 'All records verified successfully.' : 'Integrity Violation Detected for one or more lifecycle events.',
  };
}

module.exports = { verifyFullChain, verifyAssetChain, diagnoseEventMismatch };
