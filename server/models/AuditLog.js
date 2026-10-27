const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'ASSET_CREATED',
  'ASSET_UPDATED',
  'LIFECYCLE_EVENT_CREATED',
  'ALLOCATION',
  'MAINTENANCE',
  'TRANSFER',
  'DISPOSAL',
  'QR_GENERATED',
  'PUBLIC_VERIFICATION',
  'INTEGRITY_VERIFICATION',
  'INTEGRITY_VIOLATION_DETECTED',
  'USER_CREATED',
  'USER_UPDATED',
  'UNAUTHORIZED_ACCESS',
  'PASSWORD_CHANGED',
  'ROLE_CHANGED',
  'SESSION_REVOKED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'ANCHOR_CREATED',
  'ANCHOR_VERIFICATION',
  'ANCHOR_VIOLATION_DETECTED',
];

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for anonymous public actions
    userName: { type: String, default: 'PUBLIC' },
    role: { type: String, default: 'PUBLIC' },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    entity: { type: String, default: '' }, // e.g. 'Asset', 'LifecycleEvent', 'User'
    entityId: { type: String, default: '' },
    assetId: { type: String, default: '', index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    result: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
