const express = require('express');
const router = express.Router();
const { login, me, logout, changeOwnPassword } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../services/access/permissions');

router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, requirePermission(PERMISSIONS.PROFILE_READ), me);
router.put('/me/password', requireAuth, requirePermission(PERMISSIONS.PROFILE_WRITE), changeOwnPassword);

module.exports = router;
