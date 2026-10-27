/**
 * Fixed wording for anchor states. Simulated results must never be described as on-chain proof.
 * The server sends the label codes; the text lives here so every screen says the same thing.
 */
export const COVERAGE_LABELS = {
  ANCHORED_REAL: {
    text: 'Anchored on Sepolia (testnet)',
    note: 'A real testnet transaction holds this block hash.',
    tone: 'emerald',
  },
  ANCHORED_SIMULATED: {
    text: 'MOCK / SIMULATED anchor',
    note: 'Simulated inside this application. This is not on-chain proof.',
    tone: 'violet',
  },
  ANCHOR_PENDING: {
    text: 'Anchor pending',
    note: 'Waiting for the transaction to be confirmed.',
    tone: 'amber',
  },
  ANCHOR_PROBLEM: {
    text: 'Anchor mismatch',
    note: 'The anchored block no longer matches the ledger.',
    tone: 'rose',
  },
  HASH_CHAIN_ONLY: {
    text: 'Hash chain only',
    note: 'Recorded in the local hash chain. Not yet covered by an anchor.',
    tone: 'slate',
  },
};

export const TONE_CLASSES = {
  emerald: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30',
  violet: 'bg-violet-400/15 text-violet-200 ring-violet-300/30',
  amber: 'bg-amber-400/15 text-amber-200 ring-amber-400/30',
  rose: 'bg-rose-400/15 text-rose-200 ring-rose-400/30',
  slate: 'bg-white/5 text-ink-300 ring-white/10',
};

export const LOCAL_CHECK_TEXT = {
  MATCHES_LEDGER: 'The latest anchored block still matches this application’s ledger.',
  LEDGER_HASH_CHANGED: 'The latest anchored block no longer matches the ledger.',
  LEDGER_BLOCK_MISSING: 'The latest anchored block is missing from the ledger.',
};

export const EXPLORER_NAME = 'Sepolia Etherscan';
