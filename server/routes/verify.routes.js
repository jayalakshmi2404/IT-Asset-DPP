const express = require('express');
const router = express.Router();
const { verifyByDppId, verifyByAssetId } = require('../controllers/publicVerifyController');

// Public — intentionally NO requireAuth here
router.get('/asset/:assetId', verifyByAssetId);
router.get('/:dppId', verifyByDppId);

module.exports = router;
