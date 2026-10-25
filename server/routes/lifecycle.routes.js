const express = require('express');
const router = express.Router();
const { listAllLifecycle, recentLifecycle } = require('../controllers/lifecycleController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.get('/', requireAuth, requirePermission(P.LIFECYCLE_READ), listAllLifecycle);
router.get('/recent', requireAuth, requirePermission(P.LIFECYCLE_READ), recentLifecycle);

module.exports = router;
