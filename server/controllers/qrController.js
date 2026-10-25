const { generateQrDataUrl } = require('../services/qr/qrService');
const { requireVisibleAsset } = require('../services/access/scope');
const { logAction } = require('../services/audit/auditLogger');

// GET /api/assets/:id/qr — the caller's own passport QR (scoped, read-only, no state change)
async function getAssetQr(req, res, next) {
  try {
    const asset = await requireVisibleAsset(req.user, req.params.id);
    const { url, dataUrl } = await generateQrDataUrl(asset.dppId);
    res.json({ success: true, data: { dppId: asset.dppId, assetId: asset.assetId, verificationUrl: url, qrImage: dataUrl, qrGenerated: asset.qrGenerated } });
  } catch (err) {
    next(err);
  }
}

// POST /api/assets/:id/qr — records that a QR was issued (ADMIN, MANAGER within scope)
async function generateAssetQr(req, res, next) {
  try {
    const asset = await requireVisibleAsset(req.user, req.params.id);
    const { url, dataUrl } = await generateQrDataUrl(asset.dppId);

    asset.qrGenerated = true;
    asset.qrGeneratedAt = new Date();
    await asset.save();

    await logAction({ user: req.user, action: 'QR_GENERATED', entity: 'Asset', entityId: asset._id, assetId: asset.assetId, ip: req.ip });

    res.json({ success: true, data: { dppId: asset.dppId, assetId: asset.assetId, verificationUrl: url, qrImage: dataUrl, qrGenerated: true } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAssetQr, generateAssetQr };
