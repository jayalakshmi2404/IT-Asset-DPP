const Department = require('../models/Department');
const User = require('../models/User');
const Asset = require('../models/Asset');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/audit/auditLogger');
const { scopeFor } = require('../services/access/permissions');
const { requireString, optionalString, requireObjectId } = require('../utils/security');

const CODE_PATTERN = /^[A-Z0-9-]{2,12}$/;

function present(dept) {
  return { id: String(dept._id), name: dept.name, code: dept.code || '' };
}

// GET /api/departments   (ADMIN, AUDITOR all; MANAGER only departments they manage)
async function listDepartments(req, res, next) {
  try {
    const filter = {};
    if (scopeFor(req.user.role) === 'DEPARTMENTS') filter._id = { $in: req.user.managedDepartmentIds };
    const departments = await Department.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: departments.map(present) });
  } catch (err) {
    next(err);
  }
}

function parseDepartmentFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) out.name = requireString(body.name, 'Department name', { max: 80 });
  if (body.code !== undefined) {
    const code = optionalString(body.code, 'Code', 12);
    if (code && !CODE_PATTERN.test(code.toUpperCase())) throw new AppError('Code must be 2-12 letters, digits or hyphens.', 400);
    out.code = code ? code.toUpperCase() : undefined;
  }
  return out;
}

// POST /api/departments   (ADMIN)
async function createDepartment(req, res, next) {
  try {
    const fields = parseDepartmentFields(req.body);
    if (await Department.exists({ name: fields.name })) throw new AppError('A department with this name already exists.', 409);
    const dept = await Department.create({ ...fields, createdBy: req.user._id });
    await logAction({ user: req.user, action: 'DEPARTMENT_CREATED', entity: 'Department', entityId: dept._id, metadata: { name: dept.name }, ip: req.ip });
    res.status(201).json({ success: true, data: present(dept) });
  } catch (err) {
    next(err);
  }
}

// PUT /api/departments/:id   (ADMIN)
async function updateDepartment(req, res, next) {
  try {
    const id = requireObjectId(req.params.id, 'Department id');
    const dept = await Department.findById(id);
    if (!dept) throw new AppError('Department not found.', 404);

    const fields = parseDepartmentFields(req.body, { partial: true });
    if (fields.name && fields.name !== dept.name) {
      if (await Department.exists({ name: fields.name, _id: { $ne: dept._id } })) {
        throw new AppError('A department with this name already exists.', 409);
      }
      const previousName = dept.name;
      dept.name = fields.name;
      // Keep denormalized display names in step with the department record.
      await Asset.updateMany({ departmentId: dept._id }, { $set: { department: fields.name } });
      await User.updateMany({ departmentId: dept._id }, { $set: { department: fields.name } });
      await logAction({ user: req.user, action: 'DEPARTMENT_UPDATED', entity: 'Department', entityId: dept._id, metadata: { from: previousName, to: fields.name }, ip: req.ip });
    }
    if (fields.code !== undefined) dept.code = fields.code;
    await dept.save();

    res.json({ success: true, data: present(dept) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDepartments, createDepartment, updateDepartment };
