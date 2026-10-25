const Asset = require('../models/Asset');
const LifecycleEvent = require('../models/LifecycleEvent');
const AuditLog = require('../models/AuditLog');
const { assetScopeFilter, visibleAssetObjectIds } = require('../services/access/scope');
const { hasPermission, PERMISSIONS, scopeFor } = require('../services/access/permissions');
const { AppError } = require('../middleware/errorHandler');

// GET /api/reports/overview — dashboard cards. Global for ADMIN/AUDITOR, scoped for MANAGER.
async function overview(req, res, next) {
  try {
    if (!hasPermission(req.user.role, PERMISSIONS.REPORTS_SCOPED)) {
      throw new AppError('You do not have permission to view system statistics.', 403);
    }
    const scope = assetScopeFilter(req.user);
    const match = Object.keys(scope).length ? { $match: scope } : { $match: {} };

    const [total, active, maintenance, disposed] = await Promise.all([
      Asset.countDocuments(scope),
      Asset.countDocuments({ $and: [scope, { status: 'ACTIVE' }] }),
      Asset.countDocuments({ $and: [scope, { status: 'MAINTENANCE' }] }),
      Asset.countDocuments({ $and: [scope, { status: 'DISPOSED' }] }),
    ]);

    const [byCategory, byDepartment, byStatus] = await Promise.all([
      Asset.aggregate([match, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Asset.aggregate([match, { $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Asset.aggregate([match, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    res.json({
      success: true,
      data: {
        scope: scopeFor(req.user.role),
        totalAssets: total,
        activeAssets: active,
        underMaintenance: maintenance,
        disposedAssets: disposed,
        byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
        byCategory: byCategory.map((c) => ({ category: c._id || 'Uncategorized', count: c.count })),
        byDepartment: byDepartment.map((d) => ({ department: d._id || 'Unassigned', count: d.count })),
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/lifecycle — distribution and activity; verification counts are global-only
async function lifecycleReport(req, res, next) {
  try {
    if (!hasPermission(req.user.role, PERMISSIONS.REPORTS_SCOPED)) {
      throw new AppError('You do not have permission to view lifecycle reports.', 403);
    }

    const isGlobal = Object.keys(assetScopeFilter(req.user)).length === 0;
    const ledgerFilter = isGlobal ? {} : { asset: { $in: await visibleAssetObjectIds(req.user) } };

    const byType = await LifecycleEvent.aggregate([{ $match: ledgerFilter }, { $group: { _id: '$eventType', count: { $sum: 1 } } }]);
    const eventOrder = ['REGISTRATION', 'ALLOCATION', 'MAINTENANCE', 'TRANSFER', 'DISPOSAL'];
    const distribution = eventOrder.map((type) => ({
      eventType: type,
      count: byType.find((b) => b._id === type)?.count || 0,
    }));

    const data = {
      scope: scopeFor(req.user.role),
      distribution,
      maintenanceActivity: distribution.find((d) => d.eventType === 'MAINTENANCE').count,
      transfers: distribution.find((d) => d.eventType === 'TRANSFER').count,
      disposals: distribution.find((d) => d.eventType === 'DISPOSAL').count,
      verification: null,
    };

    if (hasPermission(req.user.role, PERMISSIONS.REPORTS_GLOBAL)) {
      const [success, failed] = await Promise.all([
        AuditLog.countDocuments({ action: { $in: ['PUBLIC_VERIFICATION', 'INTEGRITY_VERIFICATION'] }, result: 'SUCCESS' }),
        AuditLog.countDocuments({ action: { $in: ['PUBLIC_VERIFICATION', 'INTEGRITY_VIOLATION_DETECTED'] }, result: 'FAILURE' }),
      ]);
      data.verification = { success, failed };
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { overview, lifecycleReport };
