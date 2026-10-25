import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import DppCard from '../components/dpp/DppCard';
import LifecycleTimeline from '../components/lifecycle/LifecycleTimeline';
import AddLifecycleEventModal from '../components/lifecycle/AddLifecycleEventModal';
import { CardSkeleton } from '../components/common/LoadingSkeleton';
import { assetApi, lifecycleApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { can, canAny, PERMISSIONS as P } from '../auth/permissions';
import { formatCurrency, formatDate } from '../utils/format';
import toast from 'react-hot-toast';

export default function AssetDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [asset, setAsset] = useState(null);
  const [events, setEvents] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showEvent, setShowEvent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, e] = await Promise.all([assetApi.get(id), lifecycleApi.listForAsset(id, { limit: 100 })]);
      setAsset(a.data.data);
      setEvents(e.data.data);
      setNotFound(false);
      try {
        const i = await assetApi.getIntegrity(id);
        setIntegrity({ state: i.data.data.status, checkedAt: i.data.data.checkedAt, totalEvents: i.data.data.totalEvents, violations: i.data.data.violations || [] });
      } catch {
        setIntegrity(null);
      }
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true);
      else toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runVerify() {
    setVerifying(true);
    try {
      const res = await assetApi.verifyIntegrity(id);
      const d = res.data.data;
      setIntegrity({ state: d.status, checkedAt: d.checkedAt, totalEvents: d.totalEvents, violations: d.violations || [] });
      toast[d.verified ? 'success' : 'error'](d.verified ? 'All lifecycle records match their hashes.' : 'Integrity violation detected.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  if (loading && !asset) return <CardSkeleton />;

  if (notFound || !asset) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-white">Asset not found</h1>
        <p className="mt-2 text-sm text-ink-400">It may not exist, or it is outside your data scope.</p>
        <Link to="/assets" className="btn-secondary mt-5 inline-flex">Back to assets</Link>
      </div>
    );
  }

  const canRecord = canAny(user, [P.LIFECYCLE_ALLOCATE, P.LIFECYCLE_DISPOSE]) && asset.status !== 'DISPOSED';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={asset.assetId}
        title={asset.name}
        description={`${asset.category}${asset.brand ? ` · ${asset.brand}` : ''}${asset.model ? ` ${asset.model}` : ''}`}
        actions={
          <>
            <StatusBadge status={asset.status} />
            {canRecord && <button type="button" className="btn-primary" onClick={() => setShowEvent(true)}>Record event</button>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card p-5 sm:p-6" aria-labelledby="details-h">
            <h2 id="details-h" className="mb-4 text-sm font-semibold text-white">Asset details</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Asset ID" value={asset.assetId} mono />
              <Detail label="Serial number" value={asset.serialNumber || '—'} mono />
              <Detail label="Department" value={asset.department || 'Unassigned'} />
              <Detail label="Location" value={asset.location || '—'} />
              <Detail label="Purchase date" value={formatDate(asset.purchaseDate)} />
              <Detail label="Purchase cost" value={formatCurrency(asset.purchaseCost)} />
              <Detail label="Warranty" value={asset.warranty || '—'} />
              <Detail label="Description" value={asset.description || '—'} wide />
            </dl>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="timeline-h">
            <h2 id="timeline-h" className="mb-4 text-sm font-semibold text-white">Lifecycle history</h2>
            <LifecycleTimeline events={events} />
          </section>
        </div>

        <div className="xl:col-span-1">
          <DppCard
            asset={asset}
            canIssueQr={can(user, P.QR_ISSUE)}
            canVerify={can(user, P.INTEGRITY_VERIFY)}
            integrity={integrity}
            onVerify={runVerify}
            verifying={verifying}
            onQrIssued={load}
          />
        </div>
      </div>

      {showEvent && (
        <AddLifecycleEventModal
          asset={asset}
          user={user}
          onClose={() => setShowEvent(false)}
          onCreated={() => {
            setShowEvent(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, value, mono, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-ink-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
