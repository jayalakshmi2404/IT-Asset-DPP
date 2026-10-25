const express = require('express');
const router = express.Router();
const { listAuditLogs } = require('../controllers/auditController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.get('/', requireAuth, requirePermission(P.AUDIT_READ), listAuditLogs);

module.exports = router;
