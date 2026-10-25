const { AppError } = require('../middleware/errorHandler');
const { verifyFullChain, verifyAssetChain } = require('../services/verification/verifyChain');
const { requireVisibleAsset } = require('../services/access/scope');
const { logAction } = require('../services/audit/auditLogger');
const { dbState } = require('../config/db');

function requireDatabase() {
  // Verification must never report success when the ledger cannot be read.
  if (dbState() !== 'connected') {
    throw new AppError('The database is unavailable, so integrity could not be verified. Nothing was marked as verified.', 503);
  }
}

// GET /api/assets/:id/integrity — read-only, scoped
async function getAssetIntegrity(req, res, next) {
  try {
    requireDatabase();
    const asset = await requireVisibleAsset(req.user, req.params.id);
    const result = await verifyAssetChain(asset.assetId);
    res.json({ success: true, data: { ...result, assetId: asset.assetId } });
  } catch (err) {
    next(err);
  }
}

// POST /api/assets/:id/verify-integrity — explicit verification, always logged
async function verifyAssetIntegrity(req, res, next) {
  try {
    requireDatabase();
    const asset = await requireVisibleAsset(req.user, req.params.id);
    const result = await verifyAssetChain(asset.assetId);

    await logAction({
      user: req.user,
      action: result.verified ? 'INTEGRITY_VERIFICATION' : 'INTEGRITY_VIOLATION_DETECTED',
      entity: 'Asset',
      entityId: asset._id,
      assetId: asset.assetId,
      result: result.verified ? 'SUCCESS' : 'FAILURE',
      metadata: { violationCount: result.violations.length },
      ip: req.ip,
    });

    res.json({ success: true, data: { ...result, assetId: asset.assetId } });
  } catch (err) {
    next(err);
  }
}

// GET /api/integrity/full-chain — whole-ledger verification (ADMIN, AUDITOR)
async function verifyFullChainHandler(req, res, next) {
  try {
    requireDatabase();
    const result = await verifyFullChain();

    await logAction({
      user: req.user,
      action: result.verified ? 'INTEGRITY_VERIFICATION' : 'INTEGRITY_VIOLATION_DETECTED',
      entity: 'HashChain',
      entityId: 'FULL_CHAIN',
      result: result.verified ? 'SUCCESS' : 'FAILURE',
      metadata: { totalBlocks: result.totalBlocks, violationCount: result.violations.length },
      ip: req.ip,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAssetIntegrity, verifyAssetIntegrity, verifyFullChainHandler };
