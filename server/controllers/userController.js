const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/audit/auditLogger');
const { publicUser } = require('../services/presenters');
const { scopeFor } = require('../services/access/permissions');
const { assertDepartmentInScope } = require('../services/access/scope');
const { escapeRegex, requireString, requireObjectId, optionalObjectId, requireEnum, clampInt } = require('../utils/security');

const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'AUDITOR'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPDATABLE_FIELDS = ['name', 'role', 'status', 'departmentId', 'managedDepartmentIds', 'password'];

function parseManagedDepartments(value, role) {
  if (role !== 'MANAGER') return [];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AppError('managedDepartmentIds must be a list.', 400);
  const ids = [...new Set(value.map((v) => requireObjectId(String(v), 'managedDepartmentIds item')))];
  return ids;
}

async function assertDepartmentsExist(ids) {
  if (!ids.length) return;
  const count = await Department.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw new AppError('One or more departments do not exist.', 400);
}

// GET /api/users?page=&limit=&search=&role=&status=   (ADMIN)
async function listUsers(req, res, next) {
  try {
    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 20 });
    const filter = {};
    if (req.query.role) filter.role = requireEnum(req.query.role, ROLES, 'role');
    if (req.query.status) filter.status = requireEnum(req.query.status, ['ACTIVE', 'INACTIVE'], 'status');
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const pattern = new RegExp(escapeRegex(req.query.search.trim().slice(0, 100)), 'i');
      filter.$or = [{ name: pattern }, { email: pattern }];
    }

    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(publicUser),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/users   (ADMIN)
async function createUser(req, res, next) {
  try {
    const name = requireString(req.body.name, 'Name', { max: 120 });
    const email = requireString(req.body.email, 'Email', { max: 254 }).toLowerCase();
    const password = requireString(req.body.password, 'Password', { min: 8, max: 128 });
    const role = requireEnum(req.body.role, ROLES, 'Role');
    if (!EMAIL_PATTERN.test(email)) throw new AppError('Email address is not valid.', 400);

    const departmentId = optionalObjectId(req.body.departmentId, 'departmentId');
    const managedIds = parseManagedDepartments(req.body.managedDepartmentIds, role);
    await assertDepartmentsExist([...(departmentId ? [departmentId] : []), ...managedIds]);

    if (await User.exists({ email })) throw new AppError('A user with this email already exists.', 409);

    const dept = departmentId ? await Department.findById(departmentId).lean() : null;
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      status: 'ACTIVE',
      departmentId: dept ? dept._id : null,
      department: dept ? dept.name : '',
      managedDepartmentIds: managedIds,
    });

    await logAction({ user: req.user, action: 'USER_CREATED', entity: 'User', entityId: user._id, metadata: { role }, ip: req.ip });

    res.status(201).json({ success: true, data: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/:id   (ADMIN)  — explicit allowlist; unknown fields are rejected
async function updateUser(req, res, next) {
  try {
    const targetId = requireObjectId(req.params.id, 'User id');
    const unknown = Object.keys(req.body || {}).filter((k) => !UPDATABLE_FIELDS.includes(k));
    if (unknown.length) {
      throw new AppError(`These fields cannot be changed here: ${unknown.join(', ')}.`, 400);
    }

    const user = await User.findById(targetId);
    if (!user) throw new AppError('User not found.', 404);

    const isSelf = String(user._id) === String(req.user._id);
    const previousRole = user.role;
    const changes = [];

    const nextRole = req.body.role !== undefined ? requireEnum(req.body.role, ROLES, 'Role') : user.role;
    const nextStatus =
      req.body.status !== undefined ? requireEnum(req.body.status, ['ACTIVE', 'INACTIVE'], 'Status') : user.status;

    // Safety rails: an administrator cannot lock themselves out, and the last
    // active administrator cannot be demoted or disabled.
    if (isSelf && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE')) {
      throw new AppError('You cannot remove your own administrator access or deactivate your own account.', 400);
    }
    if (user.role === 'ADMIN' && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE')) {
      const otherActiveAdmins = await User.countDocuments({ role: 'ADMIN', status: 'ACTIVE', _id: { $ne: user._id } });
      if (otherActiveAdmins === 0) throw new AppError('At least one active administrator must remain.', 409);
    }

    if (req.body.name !== undefined) {
      user.name = requireString(req.body.name, 'Name', { max: 120 });
      changes.push('name');
    }
    if (nextRole !== user.role) {
      user.role = nextRole;
      changes.push('role');
    }
    if (nextStatus !== user.status) {
      user.status = nextStatus;
      changes.push('status');
    }

    if (req.body.departmentId !== undefined) {
      const departmentId = optionalObjectId(req.body.departmentId, 'departmentId');
      if (departmentId) {
        const dept = await Department.findById(departmentId).lean();
        if (!dept) throw new AppError('Department not found.', 400);
        user.departmentId = dept._id;
        user.department = dept.name;
      } else {
        user.departmentId = null;
        user.department = '';
      }
      changes.push('departmentId');
    }

    if (req.body.managedDepartmentIds !== undefined || nextRole !== previousRole) {
      const ids = parseManagedDepartments(req.body.managedDepartmentIds ?? user.managedDepartmentIds, nextRole);
      await assertDepartmentsExist(ids);
      user.managedDepartmentIds = ids.map((id) => new mongoose.Types.ObjectId(id));
      changes.push('managedDepartmentIds');
    }

    let passwordChanged = false;
    if (req.body.password !== undefined) {
      const password = requireString(req.body.password, 'Password', { min: 8, max: 128 });
      user.passwordHash = await bcrypt.hash(password, 12);
      passwordChanged = true;
      changes.push('password');
    }

    // Any change to credentials, role or status ends the user's existing sessions.
    if (changes.some((c) => ['role', 'status', 'password'].includes(c))) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    await user.save();

    await logAction({
      user: req.user,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: user._id,
      metadata: { changes },
      ip: req.ip,
    });
    if (previousRole !== user.role) {
      await logAction({
        user: req.user,
        action: 'ROLE_CHANGED',
        entity: 'User',
        entityId: user._id,
        metadata: { from: previousRole, to: user.role },
        ip: req.ip,
      });
    }
    if (passwordChanged) {
      await logAction({ user: req.user, action: 'PASSWORD_CHANGED', entity: 'User', entityId: user._id, metadata: { byAdministrator: true }, ip: req.ip });
    }

    res.json({ success: true, data: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/assignable?departmentId=   (ADMIN, MANAGER within scope)
// Lists the employee accounts an asset may be allocated to. Used by allocation forms
// so the client never has to guess identifiers.
async function listAssignableUsers(req, res, next) {
  try {
    const filter = { role: 'EMPLOYEE', status: 'ACTIVE' };
    if (req.query.departmentId) {
      const departmentId = requireObjectId(req.query.departmentId, 'departmentId');
      assertDepartmentInScope(req.user, departmentId);
      filter.departmentId = departmentId;
    } else if (scopeFor(req.user.role) === 'DEPARTMENTS') {
      filter.departmentId = { $in: req.user.managedDepartmentIds };
    }

    const users = await User.find(filter).sort({ name: 1 }).select('name departmentId department').lean();
    res.json({
      success: true,
      data: users.map((u) => ({ id: String(u._id), name: u.name, departmentId: u.departmentId ? String(u.departmentId) : null, department: u.department || '' })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, listAssignableUsers };
