const express = require('express');
const router = express.Router();
const { overview, lifecycleReport } = require('../controllers/reportController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.get('/overview', requireAuth, requirePermission(P.REPORTS_SCOPED), overview);
router.get('/lifecycle', requireAuth, requirePermission(P.REPORTS_SCOPED), lifecycleReport);

module.exports = router;
