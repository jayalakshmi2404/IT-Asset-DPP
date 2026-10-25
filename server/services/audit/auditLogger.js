const AuditLog = require('../../models/AuditLog');

/**
 * Central audit-log writer. Never throws — a logging failure must not
 * break the primary request. Never pass password hashes/secrets in metadata.
 */
async function logAction({ user, action, entity = '', entityId = '', assetId = '', result = 'SUCCESS', metadata = {}, ip = '' }) {
  try {
    await AuditLog.create({
      user: user?._id || user?.id || null,
      userName: user?.name || 'PUBLIC',
      role: user?.role || 'PUBLIC',
      action,
      entity,
      entityId: String(entityId || ''),
      assetId,
      result,
      metadata,
      ip,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

module.exports = { logAction };
