const Asset = require('../models/Asset');
const LifecycleEvent = require('../models/LifecycleEvent');
const { AppError } = require('../middleware/errorHandler');
const { verifyAssetChain } = require('../services/verification/verifyChain');
const { logAction } = require('../services/audit/auditLogger');

/**
 * Public, login-free view. Deliberately omits: owner / assignee names, performer
 * names, metadata, and free-text maintenance notes. Those can name employees.
 */
function publicDescription(event) {
  // Maintenance notes are free text and may name people; publish a neutral summary.
  return event.eventType === 'MAINTENANCE' ? 'Maintenance event recorded.' : event.description;
}

async function buildPublicResult(asset) {
  const [events, integrity] = await Promise.all([
    LifecycleEvent.find({ asset: asset._id }).sort({ timestamp: 1 }).lean(),
    verifyAssetChain(asset.assetId),
  ]);

  return {
    status: integrity.status,
    verified: integrity.verified,
    message: integrity.verified ? 'Asset Verified Successfully' : 'Integrity Violation Detected',
    asset: {
      assetId: asset.assetId,
      name: asset.name,
      category: asset.category,
      status: asset.status,
      dppId: asset.dppId,
      departmentName: asset.department || '',
    },
    totalEvents: events.length,
    chainStatus: integrity.verified ? 'VERIFIED' : 'VIOLATION_DETECTED',
    violations: integrity.violations.map((v) => ({ eventType: v.eventType, reason: v.reason })),
    lifecycle: events.map((e) => ({
      eventType: e.eventType,
      description: publicDescription(e),
      timestamp: e.timestamp,
      currentHash: e.currentHash,
    })),
    checkedAt: integrity.checkedAt,
    footer: integrity.verified
      ? 'Every lifecycle record matches its SHA-256 hash-chain entry.'
      : 'One or more lifecycle records do not match their SHA-256 hash-chain entries.',
  };
}

async function logPublicLookup(asset, reason, result, ip, id) {
  await logAction({
    user: null,
    action: 'PUBLIC_VERIFICATION',
    entity: 'Asset',
    entityId: asset ? asset._id : id,
    assetId: asset ? asset.assetId : '',
    result,
    metadata: reason ? { reason } : {},
    ip,
  });
}

// GET /api/verify/:dppId  (public — no auth)
async function verifyByDppId(req, res, next) {
  try {
    const dppId = String(req.params.dppId);
    const asset = await Asset.findOne({ dppId });
    if (!asset) {
      await logPublicLookup(null, 'not_found', 'FAILURE', req.ip, dppId);
      throw new AppError('No asset found for this DPP ID.', 404);
    }

    const result = await buildPublicResult(asset);
    await logPublicLookup(asset, null, result.verified ? 'SUCCESS' : 'FAILURE', req.ip);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /api/verify/asset/:assetId  (public — no auth)
async function verifyByAssetId(req, res, next) {
  try {
    const assetId = String(req.params.assetId);
    const asset = await Asset.findOne({ assetId });
    if (!asset) {
      await logPublicLookup(null, 'not_found', 'FAILURE', req.ip, assetId);
      throw new AppError('No asset found with this Asset ID.', 404);
    }

    const result = await buildPublicResult(asset);
    await logPublicLookup(asset, null, result.verified ? 'SUCCESS' : 'FAILURE', req.ip);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { verifyByDppId, verifyByAssetId };
