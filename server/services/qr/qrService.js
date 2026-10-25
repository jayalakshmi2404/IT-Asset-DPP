const QRCode = require('qrcode');

/**
 * Builds the public verification URL a QR code should resolve to.
 * The base comes from PUBLIC_BASE_URL (for deployment), falling back to CLIENT_URL and then to
 * the local dev address. Intentionally exposes ONLY the DPP id: no owner, serial number,
 * credentials, tokens or other internal identifiers.
 */
function buildVerificationUrl(dppId) {
  const base = (process.env.PUBLIC_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/verify/${encodeURIComponent(dppId)}`;
}

/**
 * Returns a QR code as a base64 PNG data URL, encoding only the
 * public verification URL.
 */
async function generateQrDataUrl(dppId) {
  const url = buildVerificationUrl(dppId);
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
  return { url, dataUrl };
}

module.exports = { buildVerificationUrl, generateQrDataUrl };
