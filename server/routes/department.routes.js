const express = require('express');
const router = express.Router();
const { listDepartments, createDepartment, updateDepartment } = require('../controllers/departmentController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS: P } = require('../services/access/permissions');

router.use(requireAuth);

router.get('/', requirePermission(P.DEPARTMENTS_READ), listDepartments);
router.post('/', requirePermission(P.DEPARTMENTS_MANAGE), createDepartment);
router.put('/:id', requirePermission(P.DEPARTMENTS_MANAGE), updateDepartment);

module.exports = router;
