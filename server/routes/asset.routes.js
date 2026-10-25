const express = require('express');
const router = express.Router();
const { listAssets, getAsset, createAsset, updateAsset } = require('../controllers/assetController');
const { listLifecycle, addLifecycleEvent } = require('../controllers/lifecycleController');
const { getAssetIntegrity, verifyAssetIntegrity } = require('../controllers/integrityController');
const { getAssetQr, generateAssetQr } = require('../controllers/qrController');
const { exportAssets, importAssets } = require('../controllers/assetBulkController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.use(requireAuth);

router.get('/', requirePermission(P.ASSETS_READ), listAssets);
router.post('/', requirePermission(P.ASSETS_WRITE), createAsset);

// Bulk operations are declared BEFORE '/:id' so 'import' and 'export' are not read as asset IDs.
// Import accepts CSV text only, with its own 2 MB limit; the app-wide JSON limit stays at 100 kB.
router.get('/export', requirePermission(P.ASSETS_READ), exportAssets);
router.post('/import', requirePermission(P.ASSETS_WRITE), express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }), importAssets);

router.get('/:id', requirePermission(P.ASSETS_READ), getAsset);
router.put('/:id', requirePermission(P.ASSETS_WRITE), updateAsset);

router.get('/:id/lifecycle', requirePermission(P.LIFECYCLE_READ), listLifecycle);
// Route admits ADMIN/MANAGER for allocation-type events; the controller separately
// requires ADMIN for DISPOSAL.
router.post('/:id/lifecycle', requirePermission(P.LIFECYCLE_ALLOCATE, P.LIFECYCLE_DISPOSE), addLifecycleEvent);

router.get('/:id/integrity', requirePermission(P.ASSETS_READ), getAssetIntegrity);
router.post('/:id/verify-integrity', requirePermission(P.INTEGRITY_VERIFY), verifyAssetIntegrity);

router.get('/:id/qr', requirePermission(P.ASSETS_READ), getAssetQr);
router.post('/:id/qr', requirePermission(P.QR_ISSUE), generateAssetQr);

module.exports = router;
