const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken } = require('../utils/token');
const { AppError } = require('../middleware/errorHandler');
const { requireString } = require('../utils/security');
const { logAction } = require('../services/audit/auditLogger');
const { publicUser } = require('../services/presenters');

// A real bcrypt hash used to keep response timing similar when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('timing-equalisation-only', 10);

// POST /api/auth/login  (public)
async function login(req, res, next) {
  try {
    const email = requireString(req.body.email, 'Email', { max: 254 }).toLowerCase();
    const password = requireString(req.body.password, 'Password', { max: 256 });

    const user = await User.findOne({ email }).select('+passwordHash');

    // Verify the password BEFORE revealing account state, so a disabled account
    // cannot be used to discover which emails exist.
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !match) {
      await logAction({
        user: user || null,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user ? user._id : '',
        result: 'FAILURE',
        metadata: { emailSupplied: Boolean(user) },
        ip: req.ip,
      });
      throw new AppError('Invalid email or password.', 401);
    }

    if (user.status !== 'ACTIVE') {
      await logAction({ user, action: 'LOGIN_FAILED', entity: 'User', entityId: user._id, result: 'FAILURE', metadata: { reason: 'inactive' }, ip: req.ip });
      throw new AppError('This account is deactivated. Contact an administrator.', 403);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    await logAction({ user, action: 'LOGIN', entity: 'User', entityId: user._id, ip: req.ip });

    res.json({ success: true, data: { token, user: publicUser(user) } });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ success: true, data: publicUser(req.user) });
}

// POST /api/auth/logout — revokes every outstanding token for this account
async function logout(req, res, next) {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    await logAction({ user: req.user, action: 'LOGOUT', entity: 'User', entityId: req.user._id, ip: req.ip });
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/me/password — self-service password change (any active role)
async function changeOwnPassword(req, res, next) {
  try {
    const currentPassword = requireString(req.body.currentPassword, 'Current password', { max: 256 });
    const newPassword = requireString(req.body.newPassword, 'New password', { min: 8, max: 128 });
    if (newPassword === currentPassword) throw new AppError('The new password must be different from the current one.', 400);

    const user = await User.findById(req.user._id).select('+passwordHash');
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) throw new AppError('The current password is incorrect.', 401);

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    // Issue a fresh token so this device stays signed in; all others are revoked.
    const token = signToken(user);
    await logAction({ user, action: 'PASSWORD_CHANGED', entity: 'User', entityId: user._id, ip: req.ip });

    res.json({ success: true, data: { token, user: publicUser(user) }, message: 'Password updated. Other sessions were signed out.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, logout, changeOwnPassword };
