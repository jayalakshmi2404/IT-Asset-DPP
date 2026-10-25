import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import VerificationResult from '../components/verification/VerificationResult';
import { publicVerifyApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { extractDppId } from '../utils/dppId';
import Icon from '../components/common/Icon';

// The camera code is loaded only when the person asks to scan.
const QrScanner = lazy(() => import('../components/verification/QrScanner'));

const NOT_A_PASSPORT = 'That is not an asset passport code. Enter a DPP ID such as DPP-AST-001, or scan the QR label on the asset.';

/** Public, unauthenticated check of a Digital Product Passport. Shows no owner or personal names. */
export default function PublicVerification() {
  const { dppId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [inputError, setInputError] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    if (!dppId) {
      setResult(null);
      setError('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const res = await publicVerifyApi.byDppId(dppId);
        if (!cancelled) setResult(res.data.data);
      } catch (err) {
        if (!cancelled) {
          setResult(null);
          setError(err.response?.status === 404 ? 'No passport matches this code.' : apiErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dppId]);

  /** Shared path for typed input and scanned codes: validate, then open the passport route. */
  function openCode(text) {
    const id = extractDppId(text);
    if (!id) {
      setInputError(NOT_A_PASSPORT);
      return false;
    }
    setInputError('');
    setScanning(false);
    navigate(`/verify/${encodeURIComponent(id)}`);
    return true;
  }

  function submit(e) {
    e.preventDefault();
    const value = input.trim();
    if (!value) {
      setInputError('Enter a DPP ID first.');
      return;
    }
    openCode(value);
  }

  function handleScan(text) {
    // The scanner delivers only the first decoded value and releases the camera before calling back.
    setScanError('');
    if (!extractDppId(text)) {
      setScanning(false);
      setScanError(NOT_A_PASSPORT);
      return;
    }
    openCode(text);
  }

  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <header className="border-b border-white/[0.06] px-4 py-4 sm:px-8">
        <Link to="/verify" className="flex items-center gap-2.5 text-sm font-semibold text-white">
          <img src="/assets/logo-mark.svg" alt="" className="h-7 w-7" />
          Asset Passport Verification
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <form onSubmit={submit} role="search" className="card mb-4 p-5">
          <label htmlFor="dpp-input" className="label">Passport or DPP ID</label>
          <div className="flex gap-2">
            <input
              id="dpp-input"
              className="input"
              placeholder="Enter the DPP ID printed on the QR label"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputError('');
              }}
              aria-invalid={inputError ? 'true' : 'false'}
              aria-describedby={inputError ? 'dpp-input-error' : undefined}
            />
            <button type="submit" className="btn-primary shrink-0"><Icon name="search" className="h-4 w-4" /> Verify</button>
          </div>
          {inputError && <p id="dpp-input-error" role="alert" className="mt-2 text-sm text-rose-500">{inputError}</p>}
        </form>

        <div className="mb-8 flex justify-center">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setScanError('');
              setScanning((on) => !on);
            }}
            aria-expanded={scanning}
          >
            {scanning ? 'Stop scanning' : 'Scan a QR code with the camera'}
          </button>
        </div>

        {scanError && <p role="alert" className="-mt-6 mb-6 text-center text-sm text-rose-500">{scanError}</p>}

        {scanning && (
          <section aria-label="Camera scanner" className="card mb-8 p-5">
            <Suspense fallback={<p className="text-center text-sm text-ink-400">Loading scanner…</p>}>
              <QrScanner onScan={handleScan} onError={(text) => setScanError(text)} />
            </Suspense>
          </section>
        )}

        {loading && <p role="status" className="text-center text-sm text-ink-400">Checking the record…</p>}
        {error && <div role="alert" className="card p-5 text-center text-sm text-rose-200 ring-1 ring-inset ring-rose-400/25">{error}</div>}
        {!loading && result && <VerificationResult result={result} />}
        {!dppId && !result && <p className="text-center text-sm text-ink-400">Scan the QR code on an asset, or enter its DPP ID above.</p>}
      </main>
    </div>
  );
}
