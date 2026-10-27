import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VerificationResult from '../src/components/verification/VerificationResult';

const TX = '0x' + 'e'.repeat(64);

function baseResult(anchoring, anchorLabel = 'HASH_CHAIN_ONLY') {
  return {
    verified: true,
    status: 'VERIFIED',
    checkedAt: '2026-10-26T04:00:00.000Z',
    asset: { assetId: 'AST-1', name: 'Laptop', status: 'ACTIVE', departmentName: 'IT', dppId: 'DPP-AST-1' },
    totalEvents: 1,
    footer: 'ok',
    violations: [],
    lifecycle: [
      { eventType: 'REGISTRATION', description: 'Registered.', timestamp: '2026-01-01T00:00:00.000Z', currentHash: 'a'.repeat(64), blockIndex: 1, anchor: { label: anchorLabel } },
    ],
    anchoring,
  };
}

describe('public verification result: anchor wording', () => {
  it('a simulated anchor is labelled MOCK / SIMULATED, says it is not on-chain proof, and has no explorer link', () => {
    const anchoring = {
      configured: true,
      counts: {},
      latest: { blockIndex: 1, status: 'CONFIRMED', simulated: true, localCheck: 'MATCHES_LEDGER', explorerUrl: null, submittedAt: '2026-10-26T03:00:00.000Z' },
    };
    const { container } = render(<VerificationResult result={baseResult(anchoring, 'ANCHORED_SIMULATED')} />);
    expect(screen.getAllByText(/MOCK \/ SIMULATED/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not blockchain proof/)).toBeTruthy();
    expect(container.querySelector('a[href*="etherscan"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Anchored on Sepolia/);
  });

  it('a real confirmed anchor links to Sepolia Etherscan with safe link attributes', () => {
    const anchoring = {
      configured: true,
      counts: {},
      latest: { blockIndex: 1, status: 'CONFIRMED', simulated: false, localCheck: 'MATCHES_LEDGER', explorerUrl: `https://sepolia.etherscan.io/tx/${TX}`, submittedAt: '2026-10-26T03:00:00.000Z' },
    };
    const { container } = render(<VerificationResult result={baseResult(anchoring, 'ANCHORED_REAL')} />);
    const link = container.querySelector('a[href*="sepolia.etherscan.io"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('Anchored on Sepolia (testnet)')).toBeTruthy();
  });

  it('a block changed after anchoring is described plainly', () => {
    const anchoring = {
      configured: true,
      latest: { blockIndex: 1, status: 'CONFIRMED', simulated: true, localCheck: 'LEDGER_HASH_CHANGED', explorerUrl: null },
    };
    render(<VerificationResult result={baseResult(anchoring, 'ANCHOR_PROBLEM')} />);
    expect(screen.getByText(/no longer matches the ledger/)).toBeTruthy();
    expect(screen.getByText('Anchor mismatch')).toBeTruthy();
  });

  it('when anchoring is not configured, the page says so and the hash chain still shows', () => {
    render(<VerificationResult result={baseResult({ configured: false, latest: null })} />);
    expect(screen.getByText(/Not enabled on this server/)).toBeTruthy();
    expect(screen.getByText('Hash chain only')).toBeTruthy();
    expect(screen.getByText('✓ Asset verified')).toBeTruthy();
  });

  it('a result without anchor fields (older server) still renders', () => {
    const r = baseResult(undefined);
    delete r.lifecycle[0].anchor;
    render(<VerificationResult result={r} />);
    expect(screen.getByText('Hash chain only')).toBeTruthy();
  });
});
