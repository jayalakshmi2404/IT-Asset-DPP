import React, { useEffect, useState } from 'react';
import { assetApi } from '../../services/resources';
import { apiErrorMessage } from '../../services/api';
import toast from 'react-hot-toast';
import IntegrityStatus from '../dashboard/IntegrityStatus';
import ViolationList from '../verification/ViolationList';

/**
 * The asset's Digital Product Passport. QR information is visible to anyone who
 * can see the asset. Issuing a QR is a separate permission (QR_ISSUE).
 */
export default function DppCard({ asset, canIssueQr, canVerify, integrity, onVerify, verifying, onQrIssued }) {
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingQr, setLoadingQr] = useState(true);
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingQr(true);
    setQrError('');
    assetApi
      .getQr(asset.assetId)
      .then((res) => {
        if (!cancelled) setQr(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setQr(null);
          setQrError(apiErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingQr(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.assetId]);

  async function handleGenerate() {
    setBusy(true);
    try {
      const res = await assetApi.generateQr(asset.assetId);
      setQr(res.data.data);
      toast.success('QR code issued for this passport.');
      onQrIssued?.();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // The image is shown, downloaded and printed only once a QR has actually been issued.
  const issued = Boolean(qr?.qrGenerated && qr?.qrImage);

  function handleDownload() {
    if (!issued) return;
    const link = document.createElement('a');
    link.href = qr.qrImage;
    link.download = `${asset.dppId}-qr.png`;
    link.click();
  }

  function handlePrint() {
    if (!issued) return;
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) {
      toast.error('Allow pop-ups for this site to print the QR label.');
      return;
    }
    const e = escapeHtml;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e(asset.dppId)}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px;color:#111}img{width:280px;height:280px}code{font-size:12px;word-break:break-all}</style>
</head><body><h2>${e(asset.name)}</h2><img src="${e(qr.qrImage)}" alt="QR code for ${e(asset.dppId)}"/>
<p><code>${e(asset.dppId)}</code></p><p><code>${e(qr.verificationUrl)}</code></p>
<script>window.onload=function(){window.print();};</script></body></html>`);
    win.document.close();
  }

  return (
    <section className="card p-6" aria-labelledby="dpp-heading">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-glow/10 text-cyan-glow" aria-hidden="true">◈</span>
        <h2 id="dpp-heading" className="text-sm font-semibold text-white">
          Digital Product Passport
        </h2>
      </div>

      <dl className="mb-5 space-y-2 text-sm">
        <Row label="DPP ID" value={asset.dppId} mono />
        <Row label="Asset ID" value={asset.assetId} mono />
        <Row label="QR issued" value={qr?.qrGenerated || asset.qrGenerated ? 'Yes' : 'Not yet'} />
      </dl>

      <div className="mb-5">
        <IntegrityStatus state={integrity?.state || 'PENDING'} checkedAt={integrity?.checkedAt} totalBlocks={integrity?.totalEvents} violationCount={integrity?.violations?.length || 0} compact />
        <ViolationList violations={integrity?.violations || []} limit={10} />
      </div>

      <div className="mb-5 flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5">
        {loadingQr ? (
          <div role="status" className="flex h-40 w-40 items-center justify-center text-xs text-ink-400">Loading QR…</div>
        ) : issued ? (
          <img src={qr.qrImage} alt={`QR code for ${asset.dppId}`} className="h-40 w-40 rounded-lg bg-white p-2" />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-white/[0.03] text-4xl text-ink-400" aria-hidden="true">▦</div>
        )}
        <p className="mt-3 max-w-[16rem] break-all text-center text-xs text-ink-400">
          {issued ? qr.verificationUrl : 'No QR has been issued for this passport yet.'}
        </p>
        {qrError && <p role="alert" className="mt-2 text-center text-xs text-rose-500">{qrError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {canIssueQr && (
          <button type="button" className="btn-primary" onClick={handleGenerate} disabled={busy}>
            {busy ? 'Issuing…' : issued ? 'Re-issue QR' : 'Issue QR'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={handleDownload} disabled={!issued}>
          Download QR
        </button>
        <button type="button" className="btn-secondary" onClick={handlePrint} disabled={!issued}>
          Print QR label
        </button>
        {canVerify && (
          <button type="button" className="btn-secondary" onClick={onVerify} disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify this asset'}
          </button>
        )}
      </div>
    </section>
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className={`text-right text-ink-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
