const { hasPermission } = require('../services/access/permissions');
const { logAction } = require('../services/audit/auditLogger');

/**
 * Requires the caller to hold AT LEAST ONE of the listed permissions.
 * Must run after requireAuth. Refusals are written to the audit log.
 * Data-level scope is applied separately in the controllers (scope.js).
 */
function requirePermission(...permissions) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const allowed = permissions.some((p) => hasPermission(req.user.role, p));
    if (!allowed) {
      await logAction({
        user: req.user,
        action: 'UNAUTHORIZED_ACCESS',
        entity: 'Route',
        entityId: req.originalUrl.split('?')[0],
        result: 'FAILURE',
        metadata: { requiredPermissions: permissions, method: req.method },
        ip: req.ip,
      });
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
    }

    return next();
  };
}

module.exports = { requirePermission };
