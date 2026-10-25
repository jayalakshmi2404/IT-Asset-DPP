import React, { useEffect, useRef, useState } from 'react';

/** Maps a camera or permission failure to a message the user can act on. */
export function cameraErrorMessage(err) {
  const name = err?.name || '';
  const text = `${err?.message || ''}`;
  if (name === 'NotAllowedError' || /permission/i.test(text)) {
    return 'Camera permission was denied. Allow camera access in your browser settings, or enter the DPP ID instead.';
  }
  if (name === 'NotFoundError' || /no camera|requested device not found/i.test(text)) {
    return 'No camera was found on this device. Enter the DPP ID instead.';
  }
  if (name === 'NotReadableError' || /in use|could not start video source/i.test(text)) {
    return 'The camera is in use by another application. Close it and try again, or enter the DPP ID instead.';
  }
  return 'The camera could not be started. Enter the DPP ID instead.';
}

/**
 * Camera QR scanner (html5-qrcode). Lifecycle rules:
 *  - the camera starts once when the component mounts and is released when it unmounts,
 *    including when unmounting happens before the camera has finished starting
 *  - only the first decoded value is passed to onScan; repeated frames are ignored
 *  - unsupported browsers, denied permission and camera errors each get their own message
 */
export default function QrScanner({ onScan, onError }) {
  const containerId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState('starting'); // starting | running | unsupported | error | stopped
  const [message, setMessage] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    handledRef.current = false;

    const fail = (text, nextStatus = 'error') => {
      setStatus(nextStatus);
      setMessage(text);
      onErrorRef.current?.(text);
    };

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      fail('This browser cannot use the camera for scanning. Enter the DPP ID instead.', 'unsupported');
      return undefined;
    }

    import('html5-qrcode')
      .then(async ({ Html5Qrcode }) => {
        if (cancelled) return;
        const scanner = new Html5Qrcode(containerId.current);
        scannerRef.current = scanner;
        try {
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decodedText) => {
              if (handledRef.current) return; // repeated callbacks for the same frame or code
              handledRef.current = true;
              releaseScanner(scanner);
              setStatus('stopped');
              onScanRef.current?.(decodedText);
            },
            () => {
              /* per-frame decode miss while no QR code is in view: expected, ignored */
            }
          );
          if (cancelled) {
            await releaseScanner(scanner);
            return;
          }
          setStatus('running');
        } catch (err) {
          if (cancelled) return;
          fail(cameraErrorMessage(err));
        }
      })
      .catch(() => {
        if (!cancelled) fail('The scanner could not be loaded. Enter the DPP ID instead.');
      });

    return () => {
      cancelled = true;
      releaseScanner(scannerRef.current);
      scannerRef.current = null;
    };
  }, []);

  return (
    <div>
      <div id={containerId.current} className="mx-auto max-w-xs overflow-hidden rounded-xl border border-ink-200 bg-black" />
      {status === 'starting' && <p className="mt-3 text-center text-sm text-ink-400">Requesting camera access…</p>}
      {(status === 'error' || status === 'unsupported') && <p role="alert" className="mt-3 text-center text-sm text-rose-500">{message}</p>}
    </div>
  );
}

/** Stops the camera if it is running, then clears the scanner's DOM. Safe to call more than once. */
async function releaseScanner(scanner) {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
  } catch {
    /* already stopped */
  }
  try {
    scanner.clear();
  } catch {
    /* nothing to clear */
  }
}
