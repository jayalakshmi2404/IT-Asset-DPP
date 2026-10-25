const crypto = require('crypto');

function generateEventId() {
  return `EVT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function buildDppId(assetId) {
  return `DPP-${assetId}`;
}

module.exports = { generateEventId, buildDppId };
