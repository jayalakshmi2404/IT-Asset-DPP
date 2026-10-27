const { AppError } = require('../middleware/errorHandler');
const { createAnchorService } = require('../services/anchoring/anchorService');
const { getProvider, describeProvider } = require('../services/anchoring');
const HashBlock = require('../models/HashBlock');
const AnchorRecord = require('../models/AnchorRecord');
const { logAction } = require('../services/audit/auditLogger');
const { dbState } = require('../config/db');

function service() {
  return createAnchorService({ provider: getProvider(), HashBlock, AnchorRecord });
}

function requireDatabase() {
  if (dbState() !== 'connected') {
    throw new AppError('The database is unavailable, so anchors could not be checked.', 503);
  }
}

// GET /api/anchors — status and verification of all anchors (ADMIN, AUDITOR)
async function listAnchors(req, res, next) {
  try {
    requireDatabase();
    const result = await service().verifyAnchors();
    await logAction({
      user: req.user,
      action: result.status === 'VIOLATION_DETECTED' ? 'ANCHOR_VIOLATION_DETECTED' : 'ANCHOR_VERIFICATION',
      entity: 'Anchor',
      entityId: 'ALL',
      result: ['VIOLATION_DETECTED', 'UNAVAILABLE'].includes(result.status) ? 'FAILURE' : 'SUCCESS',
      metadata: { status: result.status, anchorCount: result.anchors.length },
      ip: req.ip,
    });
    res.json({ success: true, data: { ...result, providerInfo: describeProvider(getProvider()) } });
  } catch (err) {
    next(err);
  }
}

// POST /api/anchors — anchor the latest ledger block (ADMIN)
async function createAnchor(req, res, next) {
  try {
    requireDatabase();
    const { record, created } = await service().anchorLatest({ userName: req.user.name });
    await logAction({
      user: req.user,
      action: 'ANCHOR_CREATED',
      entity: 'Anchor',
      entityId: String(record.blockIndex),
      result: 'SUCCESS',
      metadata: { blockIndex: record.blockIndex, provider: record.provider, created },
      ip: req.ip,
    });
    res.status(created ? 201 : 200).json({ success: true, data: record, created, providerInfo: describeProvider(getProvider()) });
  } catch (err) {
    next(err);
  }
}

// POST /api/anchors/refresh — update pending anchors from the external chain (ADMIN)
async function refreshAnchors(req, res, next) {
  try {
    requireDatabase();
    const result = await service().refreshAnchors();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAnchors, createAnchor, refreshAnchors };
