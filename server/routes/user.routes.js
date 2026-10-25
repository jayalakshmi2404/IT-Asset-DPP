const express = require('express');
const router = express.Router();
const { listUsers, createUser, updateUser, listAssignableUsers } = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.use(requireAuth);

// Declared before "/:id" so the literal path is never treated as an id.
router.get('/assignable', requirePermission(P.USERS_ASSIGNABLE_READ), listAssignableUsers);
router.get('/', requirePermission(P.USERS_MANAGE), listUsers);
router.post('/', requirePermission(P.USERS_MANAGE), createUser);
router.put('/:id', requirePermission(P.USERS_MANAGE), updateUser);

module.exports = router;
