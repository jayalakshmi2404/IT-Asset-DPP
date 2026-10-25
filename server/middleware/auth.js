const { verifyToken } = require('../utils/token');
const User = require('../models/User');

/**
 * Authenticates the bearer token and loads the CURRENT user record.
 * - unknown, inactive or deleted accounts are rejected immediately
 * - tokens issued before a logout, password change, or role/status change
 *   carry a stale tokenVersion and are rejected
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Your session is invalid or has expired. Please sign in again.' });
  }

  try {
    const user = await User.findById(decoded.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, message: 'Invalid or inactive account.' });
    }
    if (decoded.tv !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Your session has ended. Please sign in again.' });
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth };
