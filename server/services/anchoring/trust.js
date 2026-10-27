/**
 * Read-only "trust" helpers used by public and provenance views.
 *
 * Everything here reads only the application's own database. No RPC call is made, so ordinary page
 * loads never spend free-tier RPC quota. The on-chain check runs only when an administrator asks
 * for it (POST /api/anchors/refresh and GET /api/anchors).
 *
 * Labels are chosen so a simulated record can never be presented as a real blockchain confirmation.
 */

const SEPOLIA_EXPLORER_TX = 'https://sepolia.etherscan.io/tx/';
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** Public Sepolia explorer link for a real anchor. Simulated anchors never get one. */
function explorerUrlFor(record) {
  if (!record || record.simulated || record.provider !== 'ethereum') return null;
  return TX_HASH.test(record.txRef) ? `${SEPOLIA_EXPLORER_TX}${record.txRef}` : null;
}

function modeLabelFor(record) {
  return record.simulated ? 'MOCK / SIMULATED' : 'Ethereum Sepolia (testnet)';
}

/**
 * Compares an anchor with the local ledger only (no network).
 * Returns MATCHES_LEDGER, LEDGER_BLOCK_MISSING or LEDGER_HASH_CHANGED.
 */
function localCheckFrom(record, blocksByIndex) {
  const block = blocksByIndex.get(record.blockIndex);
  if (!block) return 'LEDGER_BLOCK_MISSING';
  return block.currentHash === record.blockHash ? 'MATCHES_LEDGER' : 'LEDGER_HASH_CHANGED';
}

async function blocksFor(HashBlock, indexes) {
  if (indexes.length === 0) return new Map();
  const blocks = await HashBlock.find({ index: { $in: indexes } }).lean();
  return new Map(blocks.map((b) => [b.index, b]));
}

/** Non-sensitive summary for the public verification page. Hashes and counts only. */
async function publicAnchorSummary({ HashBlock, AnchorRecord }) {
  const records = await AnchorRecord.find().sort({ blockIndex: -1 }).lean();
  const counts = { confirmed: 0, pending: 0, failed: 0, simulated: 0, real: 0 };
  for (const r of records) {
    if (r.status === 'CONFIRMED') {
      counts.confirmed += 1;
      if (r.simulated) counts.simulated += 1;
      else counts.real += 1;
    } else if (r.status === 'PENDING') counts.pending += 1;
    else if (r.status === 'FAILED') counts.failed += 1;
  }

  if (records.length === 0) {
    return { configured: false, counts, latest: null, checkedWith: 'LOCAL_LEDGER_ONLY' };
  }

  const latest = records[0];
  const blocks = await blocksFor(HashBlock, [latest.blockIndex]);
  return {
    configured: true,
    counts,
    checkedWith: 'LOCAL_LEDGER_ONLY',
    latest: {
      blockIndex: latest.blockIndex,
      blockHash: latest.blockHash,
      status: latest.status,
      simulated: Boolean(latest.simulated),
      modeLabel: modeLabelFor(latest),
      network: latest.network || '',
      submittedAt: latest.submittedAt,
      confirmedAt: latest.confirmedAt || null,
      explorerUrl: latest.status === 'CONFIRMED' ? explorerUrlFor(latest) : null,
      localCheck: localCheckFrom(latest, blocks),
    },
  };
}

/**
 * Labels each lifecycle event of one asset. Every event is in the hash chain; an event is
 * "anchored" only when a CONFIRMED anchor covers its block and still matches the local ledger.
 * Coverage labels: ANCHORED_REAL, ANCHORED_SIMULATED, ANCHOR_PENDING, ANCHOR_PROBLEM, HASH_CHAIN_ONLY.
 */
async function coverageForEvents(events, { HashBlock, AnchorRecord }) {
  if (events.length === 0) return [];
  const anchors = await AnchorRecord.find().sort({ blockIndex: 1 }).lean();
  const blocks = await blocksFor(HashBlock, anchors.map((a) => a.blockIndex));
  const usable = anchors.map((a) => ({ ...a, localCheck: localCheckFrom(a, blocks) }));

  return events.map((evt) => {
    const covering = usable.filter((a) => a.blockIndex >= evt.blockIndex);
    const confirmed = covering.find((a) => a.status === 'CONFIRMED' && a.localCheck === 'MATCHES_LEDGER');
    if (confirmed) {
      return {
        label: confirmed.simulated ? 'ANCHORED_SIMULATED' : 'ANCHORED_REAL',
        anchorBlockIndex: confirmed.blockIndex,
        explorerUrl: explorerUrlFor(confirmed),
      };
    }
    if (covering.some((a) => a.status === 'PENDING')) {
      return { label: 'ANCHOR_PENDING', anchorBlockIndex: null, explorerUrl: null };
    }
    if (covering.length > 0) {
      return { label: 'ANCHOR_PROBLEM', anchorBlockIndex: null, explorerUrl: null };
    }
    return { label: 'HASH_CHAIN_ONLY', anchorBlockIndex: null, explorerUrl: null };
  });
}

module.exports = { explorerUrlFor, modeLabelFor, localCheckFrom, publicAnchorSummary, coverageForEvents, SEPOLIA_EXPLORER_TX };
