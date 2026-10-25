import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const getQr = vi.fn();
vi.mock('../src/services/resources', () => ({ assetApi: { getQr: (...a) => getQr(...a), generateQr: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import DppCard from '../src/components/dpp/DppCard';

const asset = { assetId: 'AST-001', dppId: 'DPP-AST-001', name: 'Laptop <A>', qrGenerated: false };
const issuedQr = {
  dppId: 'DPP-AST-001',
  assetId: 'AST-001',
  qrGenerated: true,
  qrImage: 'data:image/png;base64,AAAA',
  verificationUrl: 'http://localhost:5173/verify/DPP-AST-001',
};

describe('DppCard QR display', () => {
  beforeEach(() => {
    getQr.mockReset();
  });

  it('does not show a QR image before a QR has been issued, even if the server sends one', async () => {
    getQr.mockResolvedValue({ data: { data: { ...issuedQr, qrGenerated: false } } });
    render(<DppCard asset={asset} canIssueQr={false} />);
    await waitFor(() => expect(getQr).toHaveBeenCalled());
    expect(screen.queryByAltText(/QR code for DPP-AST-001/)).toBeNull();
    expect(screen.getByText(/No QR has been issued/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download QR' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Print QR label' })).toBeDisabled();
  });

  it('shows the QR image and enables download and print once issued', async () => {
    getQr.mockResolvedValue({ data: { data: issuedQr } });
    render(<DppCard asset={asset} canIssueQr={false} />);
    expect(await screen.findByAltText('QR code for DPP-AST-001')).toHaveAttribute('src', issuedQr.qrImage);
    expect(screen.getByRole('button', { name: 'Download QR' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Print QR label' })).toBeEnabled();
  });

  it('shows a clear error when the QR cannot be loaded, instead of a blank card', async () => {
    // axios rejects with an Error that carries the HTTP response, so build one the same way.
    const err = Object.assign(new Error('Request failed with status code 404'), { response: { status: 404, data: { message: 'Asset not found.' } } });
    getQr.mockImplementation(() => Promise.reject(err));
    render(<DppCard asset={asset} canIssueQr={false} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Asset not found/);
  });
});
