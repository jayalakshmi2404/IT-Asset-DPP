const jwt = require('jsonwebtoken');

const TOKEN_OPTIONS = {
  algorithm: 'HS256',
  issuer: 'it-asset-dpp',
  audience: 'it-asset-dpp-client',
};

/**
 * The token carries only the subject and a session version. Role, status and
 * scope are NEVER trusted from the token; the middleware reloads the user on
 * every request so administrative changes take effect immediately.
 */
function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    ...TOKEN_OPTIONS,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: [TOKEN_OPTIONS.algorithm],
    issuer: TOKEN_OPTIONS.issuer,
    audience: TOKEN_OPTIONS.audience,
  });
}

module.exports = { signToken, verifyToken };
