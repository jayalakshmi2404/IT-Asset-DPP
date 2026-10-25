import React, { useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import IntegrityStatus from '../components/dashboard/IntegrityStatus';
import ViolationList from '../components/verification/ViolationList';
import Icon from '../components/common/Icon';
import { integrityApi, assetApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { can, PERMISSIONS as P } from '../auth/permissions';
import { SectionCard } from './dashboards/shared';
import toast from 'react-hot-toast';

/** Whole-ledger verification (ADMIN, AUDITOR) plus a single-asset check. Results are shown only after a real check completes. */
export default function IntegrityVerification() {
  const { user } = useAuth();
  const [full, setFull] = useState(null);
  const [fullBusy, setFullBusy] = useState(false);
  const [assetId, setAssetId] = useState('');
  const [assetResult, setAssetResult] = useState(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetError, setAssetError] = useState('');
  const canAssetVerify = can(user, P.INTEGRITY_VERIFY);

  async function runFull() {
    setFullBusy(true);
    try {
      const res = await integrityApi.fullChain();
      setFull(res.data.data);
    } catch (err) {
      setFull({ status: 'UNAVAILABLE', verified: false, violations: [], message: apiErrorMessage(err) });
      toast.error(apiErrorMessage(err));
    } finally {
      setFullBusy(false);
    }
  }

  async function checkAsset(e) {
    e.preventDefault();
    const id = assetId.trim();
    if (!id) {
      setAssetError('Enter an asset ID.');
      return;
    }
    setAssetError('');
    setAssetBusy(true);
    try {
      const res = canAssetVerify ? await assetApi.verifyIntegrity(id) : await assetApi.getIntegrity(id);
      setAssetResult(res.data.data);
    } catch (err) {
      setAssetResult(null);
      setAssetError(err.response?.status === 404 ? 'No asset with that ID is visible to you.' : apiErrorMessage(err));
    } finally {
      setAssetBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Oversight" title="Integrity verification" description="Recalculates SHA-256 hashes for every block and lifecycle record and compares them with what was stored." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Full ledger"
          action={
            <button type="button" className="btn-primary" onClick={runFull} disabled={fullBusy}>
              <Icon name="shield" className="h-4 w-4" /> {fullBusy ? 'Checking…' : 'Run full check'}
            </button>
          }
        >
          <IntegrityStatus state={full ? full.status : 'PENDING'} checkedAt={full?.checkedAt} totalBlocks={full?.totalBlocks} violationCount={full?.violations?.length || 0} />
          <ViolationList violations={full?.violations || []} limit={25} />
        </SectionCard>

        <SectionCard title="Single asset">
          <form onSubmit={checkAsset} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label htmlFor="iv-asset" className="label">Asset ID</label>
              <input id="iv-asset" className="input" placeholder="e.g. AST-1001" value={assetId} onChange={(e) => setAssetId(e.target.value)} aria-invalid={Boolean(assetError)} aria-describedby={assetError ? 'iv-asset-err' : undefined} />
              {assetError && <p id="iv-asset-err" className="mt-1.5 text-xs text-rose-300">{assetError}</p>}
            </div>
            <button type="submit" className="btn-secondary sm:mt-6" disabled={assetBusy}>{assetBusy ? 'Checking…' : canAssetVerify ? 'Verify asset' : 'Check asset'}</button>
          </form>
          <div className="mt-5">
            {assetResult ? (
              <>
                <IntegrityStatus state={assetResult.status} checkedAt={assetResult.checkedAt} violationCount={assetResult.violations?.length || 0} totalBlocks={assetResult.totalEvents} />
                <ViolationList violations={assetResult.violations || []} limit={25} />
              </>
            ) : (
              <IntegrityStatus state="PENDING" />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
