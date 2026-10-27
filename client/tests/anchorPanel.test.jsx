import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/resources', () => ({
  anchorApi: { list: vi.fn(), create: vi.fn(), refresh: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

import AnchorPanel from '../src/components/verification/AnchorPanel';
import { anchorApi } from '../src/services/resources';
import toast from 'react-hot-toast';

const ADMIN = { name: 'Admin', role: 'ADMIN' };
const AUDITOR = { name: 'Auditor', role: 'AUDITOR' };
const EMPLOYEE = { name: 'Employee', role: 'EMPLOYEE' };

describe('AnchorPanel', () => {
  beforeEach(() => {
    anchorApi.list.mockReset();
    anchorApi.create.mockReset();
    anchorApi.refresh.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  const MOCK_ROW = {
    blockIndex: 2,
    blockHash: 'c'.repeat(64),
    txRef: 'MOCK-SIM-' + 'd'.repeat(24),
    status: 'CONFIRMED',
    simulated: true,
    network: 'MOCK (no network)',
    submittedAt: '2026-10-25T10:00:00.000Z',
  };


  it('says plainly that nothing is verified when no block has been anchored', async () => {
    anchorApi.list.mockResolvedValue({ data: { data: { status: 'NO_ANCHORS', verified: false, provider: 'mock', providerInfo: { kind: 'mock' }, anchors: [], violations: [] } } });
    render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText(/No block has been simulated yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Simulate anchor/ })).toBeTruthy();
  });

  it('auditors can see the status but get no write buttons', async () => {
    anchorApi.list.mockResolvedValue({ data: { data: { status: 'NO_ANCHORS', verified: false, anchors: [], violations: [] } } });
    render(<AnchorPanel user={AUDITOR} />);
    await waitFor(() => expect(anchorApi.list).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Anchor latest block/ })).toBeNull();
  });

  it('shows a violation reason when an anchored block changed', async () => {
    anchorApi.list.mockResolvedValue({
      data: {
        data: {
          status: 'VIOLATION_DETECTED',
          verified: false,
          provider: 'ethereum',
          anchors: [{ blockIndex: 3, blockHash: 'a'.repeat(64), txRef: '0x' + 'b'.repeat(64), status: 'CONFIRMED' }],
          violations: [{ blockIndex: 3, reason: 'The anchored block hash changed after anchoring.' }],
        },
      },
    });
    render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText(/changed after anchoring/)).toBeTruthy();
    expect(screen.getByText('CONFIRMED')).toBeTruthy();
  });

  it('renders nothing for roles without anchor access', () => {
    const { container } = render(<AnchorPanel user={EMPLOYEE} />);
    expect(container.textContent).toBe('');
    expect(anchorApi.list).not.toHaveBeenCalled();
  });

  it('mock mode shows the simulated label, MOCK tags, and never mentions Sepolia or a real transaction', async () => {
    anchorApi.list.mockResolvedValue({
      data: { data: { status: 'VERIFIED', verified: true, provider: 'mock', providerInfo: { kind: 'mock' }, anchors: [MOCK_ROW], violations: [] } },
    });
    const { container } = render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText('Mock Mode — Simulated, No Real Blockchain')).toBeTruthy();
    expect(screen.getAllByText('MOCK / SIMULATED').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Simulate anchor \(latest block\)/ })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Sepolia|Real Testnet/);
  });

  it('disabled mode shows the disabled label and offers no anchor button', async () => {
    anchorApi.list.mockResolvedValue({
      data: { data: { status: 'NO_ANCHORS', verified: false, provider: null, providerInfo: { kind: 'none' }, anchors: [], violations: [] } },
    });
    render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText('Disabled — Anchoring Not Enabled')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Simulate anchor|Anchor latest block/ })).toBeNull();
  });

  it('ethereum mode is labelled as a real Sepolia testnet transaction', async () => {
    anchorApi.list.mockResolvedValue({
      data: { data: { status: 'PENDING', verified: false, provider: 'ethereum', providerInfo: { kind: 'ethereum' }, anchors: [], violations: [] } },
    });
    render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText('Ethereum Sepolia — Real Testnet Transaction')).toBeTruthy();
    expect(screen.queryByText('MOCK / SIMULATED')).toBeNull();
  });

  it('admin simulation shows the success message that says it is not a blockchain transaction', async () => {
    anchorApi.list.mockResolvedValue({
      data: { data: { status: 'NO_ANCHORS', verified: false, provider: 'mock', providerInfo: { kind: 'mock' }, anchors: [], violations: [] } },
    });
    anchorApi.create.mockResolvedValue({ data: { success: true, created: true, providerInfo: { kind: 'mock' }, data: MOCK_ROW } });
    render(<AnchorPanel user={ADMIN} />);
    fireEvent.click(await screen.findByRole('button', { name: /Simulate anchor/ }));
    await waitFor(() => expect(anchorApi.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Simulated anchor created. This is not a blockchain transaction.'));
  });

  it('a rejected simulation shows the server message', async () => {
    anchorApi.list.mockResolvedValue({
      data: { data: { status: 'NO_ANCHORS', verified: false, provider: 'mock', providerInfo: { kind: 'mock' }, anchors: [], violations: [] } },
    });
    anchorApi.create.mockRejectedValue({ response: { data: { message: 'Anchoring is disabled on this server.' } } });
    render(<AnchorPanel user={ADMIN} />);
    fireEvent.click(await screen.findByRole('button', { name: /Simulate anchor/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Anchoring is disabled on this server.'));
  });

  it('a failed anchor check is shown as unavailable, never as disabled', async () => {
    anchorApi.list.mockRejectedValue({ response: { data: { message: 'Could not read the anchor transaction from the RPC endpoint.' } } });
    render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText('Unavailable — Anchors Could Not Be Checked')).toBeTruthy();
    expect(screen.queryByText('Disabled — Anchoring Not Enabled')).toBeNull();
    expect(screen.queryByRole('button', { name: /Simulate anchor|Anchor latest block/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Re-check/ })).toBeTruthy();
  });

  it('checks that were not made are listed as not checked', async () => {
    anchorApi.list.mockResolvedValue({
      data: { data: { status: 'UNAVAILABLE', verified: false, provider: 'ethereum', providerInfo: { kind: 'ethereum' }, anchors: [], violations: [],
        notices: [{ blockIndex: 4, reason: 'Could not reach the RPC endpoint to check this anchor. Try again later.' }] } },
    });
    render(<AnchorPanel user={ADMIN} />);
    expect(await screen.findByText('Not checked')).toBeTruthy();
    expect(screen.getByText(/Block #4: Could not reach the RPC endpoint/)).toBeTruthy();
  });
});
