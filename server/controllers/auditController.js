const AuditLog = require('../models/AuditLog');
const { AUDIT_ACTIONS } = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');
const { escapeRegex, requireEnum, clampInt } = require('../utils/security');

// GET /api/audit-logs?page=&limit=&action=&assetId=&result=&from=&to=   (ADMIN, AUDITOR — read only)
async function listAuditLogs(req, res, next) {
  try {
    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 200, fallback: 25 });
    const filter = {};

    if (req.query.action) filter.action = requireEnum(req.query.action, AUDIT_ACTIONS, 'action');
    if (req.query.result) filter.result = requireEnum(req.query.result, ['SUCCESS', 'FAILURE'], 'result');
    if (typeof req.query.assetId === 'string' && req.query.assetId.trim()) {
      filter.assetId = new RegExp(`^${escapeRegex(req.query.assetId.trim().slice(0, 60))}$`, 'i');
    }
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) {
        const from = new Date(req.query.from);
        if (Number.isNaN(from.getTime())) throw new AppError('from is not a valid date.', 400);
        filter.timestamp.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(req.query.to);
        if (Number.isNaN(to.getTime())) throw new AppError('to is not a valid date.', 400);
        filter.timestamp.$lte = to;
      }
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs };
