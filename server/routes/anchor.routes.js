const express = require('express');
const router = express.Router();
const { listAnchors, createAnchor, refreshAnchors } = require('../controllers/anchorController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.get('/', requireAuth, requirePermission(P.ANCHOR_READ), listAnchors);
router.post('/', requireAuth, requirePermission(P.ANCHOR_WRITE), createAnchor);
router.post('/refresh', requireAuth, requirePermission(P.ANCHOR_WRITE), refreshAnchors);

module.exports = router;
