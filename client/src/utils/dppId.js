const DPP_ID = /^DPP-[A-Za-z0-9._-]{1,120}$/;
const VERIFY_PATH = /\/verify\/([^/?#\s]+)/;

/**
 * Turns what a user typed or a camera decoded into a DPP ID.
 * Accepts a bare DPP ID ("DPP-AST-001") or the full verification URL that the QR code encodes
 * ("https://host/verify/DPP-AST-001"). Returns null for anything else, so an unrelated QR code
 * is reported instead of being sent to the server.
 */
export function extractDppId(text) {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  if (!value) return null;

  const fromUrl = value.match(VERIFY_PATH);
  if (fromUrl) {
    let decoded;
    try {
      decoded = decodeURIComponent(fromUrl[1]);
    } catch {
      return null;
    }
    return DPP_ID.test(decoded) ? decoded : null;
  }

  return DPP_ID.test(value) ? value : null;
}

export default extractDppId;
