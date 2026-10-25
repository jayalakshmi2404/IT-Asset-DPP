const express = require('express');
const router = express.Router();
const { verifyFullChainHandler } = require('../controllers/integrityController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.get('/full-chain', requireAuth, requirePermission(P.INTEGRITY_FULL_CHAIN), verifyFullChainHandler);

module.exports = router;
