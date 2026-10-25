import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Replace the camera library with a controllable fake.
const scannerState = { instances: [], startError: null, callbacks: [] };
vi.mock('html5-qrcode', () => {
  class Html5Qrcode {
    constructor(id) {
      this.id = id;
      this.isScanning = false;
      this.stop = vi.fn(async () => {
        this.isScanning = false;
      });
      this.clear = vi.fn();
      scannerState.instances.push(this);
    }
    start(_config, _opts, onSuccess) {
      scannerState.callbacks.push(onSuccess);
      if (scannerState.startError) return Promise.reject(scannerState.startError);
      this.isScanning = true;
      return Promise.resolve();
    }
  }
  return { Html5Qrcode };
});

import QrScanner, { cameraErrorMessage } from '../src/components/verification/QrScanner';

describe('QrScanner', () => {
  beforeEach(() => {
    scannerState.instances = [];
    scannerState.callbacks = [];
    scannerState.startError = null;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  });
  afterEach(() => {
    delete navigator.mediaDevices;
  });

  it('reports the camera as running once it starts', async () => {
    render(<QrScanner onScan={() => {}} />);
    await waitFor(() => expect(scannerState.instances).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/Requesting camera access/)).toBeNull());
  });

  it('passes only the first decoded value and releases the camera', async () => {
    const onScan = vi.fn();
    render(<QrScanner onScan={onScan} />);
    await waitFor(() => expect(scannerState.callbacks).toHaveLength(1));
    const decode = scannerState.callbacks[0];
    await act(async () => {
      decode('https://x.test/verify/DPP-AST-001');
      decode('https://x.test/verify/DPP-AST-001'); // repeated callback for the same code
    });
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('https://x.test/verify/DPP-AST-001');
    expect(scannerState.instances[0].stop).toHaveBeenCalled();
  });

  it('releases the camera on unmount', async () => {
    const { unmount } = render(<QrScanner onScan={() => {}} />);
    await waitFor(() => expect(scannerState.instances[0].isScanning).toBe(true));
    unmount();
    expect(scannerState.instances[0].stop).toHaveBeenCalled();
    await waitFor(() => expect(scannerState.instances[0].clear).toHaveBeenCalled());
  });

  it('shows a permission-specific message when the camera is denied', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    scannerState.startError = denied;
    const onError = vi.fn();
    render(<QrScanner onScan={() => {}} onError={onError} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied/i);
    expect(onError).toHaveBeenCalled();
  });

  it('explains an unsupported browser without trying to start a camera', async () => {
    delete navigator.mediaDevices;
    render(<QrScanner onScan={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot use the camera/i);
    expect(scannerState.instances).toHaveLength(0);
  });
});

describe('cameraErrorMessage', () => {
  it('maps each common failure to a distinct, actionable message', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/permission/i);
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toMatch(/No camera/);
    expect(cameraErrorMessage({ name: 'NotReadableError' })).toMatch(/in use/);
    expect(cameraErrorMessage(new Error('something else'))).toMatch(/could not be started/);
  });
});
