const { AppError } = require('../../middleware/errorHandler');
const { decodePayload } = require('./provider');
const { explorerUrlFor } = require('./trust');

/** Placeholder while a reservation is being submitted. Refresh never queries the chain for it. */
const RESERVED_REF = 'RESERVED';

/**
 * Anchors the latest ledger block to an external chain and verifies earlier anchors.
 *
 * Dependencies are injected (provider, HashBlock, AnchorRecord) so the logic can be tested
 * without a database or network. What an anchor proves, and what it does not, is in docs/ANCHORING.md.
 */
function createAnchorService({ provider, HashBlock, AnchorRecord }) {
  function requireProvider() {
    if (!provider) {
      throw new AppError('External anchoring is not enabled. Set ANCHOR_PROVIDER in the server environment.', 503);
    }
  }

  /** Anchors the current head of the ledger. Idempotent: an already-anchored head is returned unchanged. */
  async function anchorLatest({ userName = '' } = {}) {
    requireProvider();
    const head = await HashBlock.findOne().sort({ index: -1 }).lean();
    if (!head) throw new AppError('The ledger is empty. Nothing to anchor.', 409);

    const existing = await AnchorRecord.findOne({ blockIndex: head.index }).lean();
    if (existing) return { record: existing, created: false };

    // Reserve the block first. The unique blockIndex index lets only one request win, so a
    // concurrent request never submits a second transaction for the same block.
    let reservation;
    try {
      reservation = await AnchorRecord.create({
        blockIndex: head.index,
        blockHash: head.currentHash,
        provider: provider.name,
        txRef: RESERVED_REF,
        status: 'PENDING',
        submittedAt: new Date(),
        statusNote: 'Reserved. The transaction is being submitted.',
        createdByName: userName,
        simulated: Boolean(provider.simulated),
        network: provider.network || '',
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await AnchorRecord.findOne({ blockIndex: head.index }).lean();
        if (winner) return { record: winner, created: false };
      }
      throw err;
    }

    let sent;
    try {
      sent = await provider.submit({ blockIndex: head.index, blockHash: head.currentHash });
    } catch (err) {
      // Nothing was sent, so the reservation is released and the block can be anchored again later.
      await AnchorRecord.deleteOne({ _id: reservation._id }).catch(() => {});
      throw err;
    }

    // From here a transaction exists on the chain. The reservation is never deleted now.
    try {
      await AnchorRecord.updateOne({ _id: reservation._id }, { $set: { txRef: sent.ref, submittedAt: sent.submittedAt, statusNote: '' } });
    } catch {
      throw new AppError(
        `The anchor transaction ${sent.ref} was sent, but its local record could not be saved. Ask an administrator to check it before retrying.`,
        500
      );
    }
    return {
      record: {
        blockIndex: head.index,
        blockHash: head.currentHash,
        provider: provider.name,
        txRef: sent.ref,
        status: 'PENDING',
        submittedAt: sent.submittedAt,
        statusNote: '',
        createdByName: userName,
        simulated: Boolean(provider.simulated),
        network: provider.network || '',
      },
      created: true,
    };
  }

  /**
   * An anchor can be checked only by the provider that made it. A simulated anchor is checked
   * only by the mock provider, and a real anchor only by the ethereum provider with the same name.
   */
  function canCheck(rec) {
    if (!provider) return false;
    if (Boolean(rec.simulated) !== Boolean(provider.simulated)) return false;
    return Boolean(provider.simulated) || rec.provider === provider.name;
  }

  /** Moves PENDING anchors to CONFIRMED or FAILED once the chain reports them. RPC errors skip a row. */
  async function refreshAnchors() {
    requireProvider();
    const pending = await AnchorRecord.find({ status: 'PENDING' }).lean();
    const updated = [];
    const unavailable = [];
    for (const rec of pending) {
      if (rec.txRef === RESERVED_REF) continue; // submission not finished; nothing to query yet
      if (!canCheck(rec)) {
        unavailable.push({ blockIndex: rec.blockIndex, reason: 'This anchor was made by another provider and cannot be checked with the current setting.' });
        continue;
      }
      let remote;
      try {
        remote = await provider.fetch(rec.txRef);
      } catch {
        unavailable.push({ blockIndex: rec.blockIndex, reason: 'Could not reach the RPC endpoint. Try again later.' });
        continue;
      }
      if (!remote.found) continue; // not visible yet; stays PENDING

      let status = null;
      let note = '';
      if (remote.failed) {
        status = 'FAILED';
        note = 'The anchor transaction reverted on chain.';
      } else if (remote.confirmed) {
        const matches = remote.payload && remote.payload.blockIndex === rec.blockIndex && remote.payload.blockHash === rec.blockHash;
        const fromOurs = remote.from && remote.from.toLowerCase() === String(provider.address || '').toLowerCase();
        if (matches && fromOurs) {
          status = 'CONFIRMED';
        } else {
          status = 'FAILED';
          note = 'The on-chain transaction does not carry this block hash, or was not sent by the configured account.';
        }
      }
      if (status) {
        const set = { status, statusNote: note };
        if (status === 'CONFIRMED') set.confirmedAt = new Date();
        await AnchorRecord.updateOne({ _id: rec._id }, { $set: set });
        updated.push({ blockIndex: rec.blockIndex, status });
      }
    }
    return { checked: pending.length, updated, unavailable };
  }

  /**
   * Checks every anchor against the ledger and, where the active provider can, against its chain.
   *   VERIFIED            every confirmed anchor matches and was checked.
   *   VIOLATION_DETECTED  a real mismatch, a failed anchor, or a changed ledger block.
   *   UNAVAILABLE         the check could not be completed (RPC error, no provider, or another provider's anchors).
   *   PENDING             nothing is confirmed yet.
   * Nothing is reported as verified unless every confirmed anchor was actually checked.
   */
  async function verifyAnchors() {
    const records = await AnchorRecord.find().sort({ blockIndex: 1 }).lean();
    const checkedAt = new Date().toISOString();
    if (records.length === 0) {
      return { status: 'NO_ANCHORS', verified: false, provider: provider ? provider.name : null, anchors: [], violations: [], notices: [], checkedAt,
        message: 'No ledger block has been anchored yet. Nothing has been verified externally.' };
    }

    const violations = [];
    const notices = [];
    const anchors = [];
    let confirmed = 0;
    let pending = 0;
    let checkedCount = 0;

    for (const rec of records) {
      const row = {
        blockIndex: rec.blockIndex,
        blockHash: rec.blockHash,
        txRef: rec.txRef,
        status: rec.status,
        simulated: Boolean(rec.simulated),
        network: rec.network || '',
        submittedAt: rec.submittedAt,
        confirmedAt: rec.confirmedAt || null,
        explorerUrl: rec.status === 'CONFIRMED' ? explorerUrlFor(rec) : null,
        problems: [],
        checked: false,
      };
      const push = (reason) => {
        row.problems.push(reason);
        violations.push({ blockIndex: rec.blockIndex, reason });
      };
      const notice = (reason) => {
        row.problems.push(reason);
        notices.push({ blockIndex: rec.blockIndex, reason });
      };

      if (rec.status === 'PENDING') {
        pending += 1;
      } else if (rec.status === 'FAILED') {
        push(rec.statusNote || 'The anchor failed earlier.');
      } else {
        confirmed += 1;
        // Local ledger check: always runs, in every mode.
        const block = await HashBlock.findOne({ index: rec.blockIndex }).lean();
        if (!block) {
          push('The anchored block is missing from the ledger. The chain was shortened or rewritten after the anchor.');
        } else if (block.currentHash !== rec.blockHash) {
          push('The anchored block hash changed after anchoring. The ledger was rewritten after this anchor.');
        }

        if (!canCheck(rec)) {
          notice(`This anchor was made with the ${rec.provider} provider${rec.simulated ? ' (simulated)' : ''}. The current setting cannot check it, so it is not verified.`);
        } else {
          try {
            const remote = await provider.fetch(rec.txRef);
            if (!remote.found) {
              push('The anchor transaction cannot be found on the external chain.');
            } else {
              const payload = remote.payload;
              if (!payload || payload.blockIndex !== rec.blockIndex || payload.blockHash !== rec.blockHash) {
                push('The external transaction does not carry the stored block hash.');
              }
              if (remote.from && remote.from.toLowerCase() !== String(provider.address || '').toLowerCase()) {
                push('The external transaction was not sent by the configured account.');
              }
              row.checked = true;
              checkedCount += 1;
            }
          } catch {
            notice('Could not reach the RPC endpoint to check this anchor. Try again later.');
          }
        }
      }
      anchors.push(row);
    }

    let status = 'PENDING';
    if (violations.length > 0) status = 'VIOLATION_DETECTED';
    else if (notices.length > 0) status = 'UNAVAILABLE';
    else if (confirmed > 0) status = 'VERIFIED';
    const verified = status === 'VERIFIED';

    const failed = records.filter((r) => r.status === 'FAILED').length;
    const simulatedCount = records.filter((r) => r.simulated).length;
    return {
      status,
      verified,
      provider: provider ? provider.name : null,
      confirmedCount: confirmed,
      pendingCount: pending,
      failedCount: failed,
      simulatedCount,
      realCount: records.length - simulatedCount,
      checkedOnChainCount: checkedCount,
      anchors,
      violations,
      notices,
      checkedAt,
    };
  }

  return { anchorLatest, refreshAnchors, verifyAnchors };
}

module.exports = { createAnchorService, decodePayload };
