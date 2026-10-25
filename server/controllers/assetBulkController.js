const Asset = require('../models/Asset');
const { AppError } = require('../middleware/errorHandler');
const { buildAssetFilter } = require('./assetController');
const { prepareImport, commitImport } = require('../services/assets/bulkImport');
const { toCsv, CsvLimitError, MAX_IMPORT_BYTES } = require('../services/csv/csv');
const { logAction } = require('../services/audit/auditLogger');
const { publicAsset } = require('../services/presenters');
const { requireObjectId } = require('../utils/security');

const MAX_EXPORT_ROWS = 5000;

/**
 * Export columns. The list is fixed and documented (docs/IMPORT_EXPORT.md). Owner names, internal
 * IDs, creator and hash data are deliberately excluded: they are either personal or internal.
 */
const EXPORT_COLUMNS = [
  { key: 'assetId', header: 'assetId' },
  { key: 'name', header: 'name' },
  { key: 'category', header: 'category' },
  { key: 'brand', header: 'brand' },
  { key: 'model', header: 'model' },
  { key: 'serialNumber', header: 'serialNumber' },
  { key: 'purchaseDate', header: 'purchaseDate' },
  { key: 'purchaseCost', header: 'purchaseCost' },
  { key: 'warranty', header: 'warranty' },
  { key: 'status', header: 'status' },
  { key: 'department', header: 'department' },
  { key: 'location', header: 'location' },
  { key: 'description', header: 'description' },
  { key: 'dppId', header: 'dppId' },
  { key: 'qrGenerated', header: 'qrGenerated' },
];

function exportRow(asset) {
  const a = publicAsset(asset);
  return {
    assetId: a.assetId,
    name: a.name,
    category: a.category,
    brand: a.brand,
    model: a.model,
    serialNumber: a.serialNumber,
    purchaseDate: a.purchaseDate ? new Date(a.purchaseDate).toISOString().slice(0, 10) : '',
    purchaseCost: a.purchaseCost,
    warranty: a.warranty,
    status: a.status,
    department: a.department,
    location: a.location,
    description: a.description,
    dppId: a.dppId,
    qrGenerated: a.qrGenerated ? 'yes' : 'no',
  };
}

// GET /api/assets/export?format=csv&category=&status=&departmentId=&search=&ids=id1,id2
// Same filters and data scope as the list. `ids` restricts to selected assets (still within scope).
async function exportAssets(req, res, next) {
  try {
    if (req.query.format && req.query.format !== 'csv') {
      throw new AppError('Only CSV export is available. Use format=csv.', 400);
    }
    const filter = buildAssetFilter(req.user, req.query);
    if (typeof req.query.ids === 'string' && req.query.ids.trim()) {
      const ids = req.query.ids.split(',').map((v) => v.trim()).filter(Boolean);
      if (ids.length > MAX_EXPORT_ROWS) throw new AppError(`Select at most ${MAX_EXPORT_ROWS} assets per export.`, 400);
      filter.$and.push({ _id: { $in: ids.map((id) => requireObjectId(id, 'ids')) } });
    }

    const assets = await Asset.find(filter).sort({ assetId: 1 }).limit(MAX_EXPORT_ROWS + 1).lean();
    if (assets.length > MAX_EXPORT_ROWS) {
      throw new AppError(`This export has more than ${MAX_EXPORT_ROWS} assets. Narrow the filters and export again.`, 413);
    }

    await logAction({ user: req.user, action: 'ASSETS_EXPORTED', entity: 'Asset', entityId: 'EXPORT', metadata: { rows: assets.length }, ip: req.ip });

    const csv = toCsv(EXPORT_COLUMNS, assets.map(exportRow));
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// POST /api/assets/import?dryRun=true|false   body: text/csv (max 2 MB, 1000 data rows)
// Dry run by default is NOT applied: dryRun=true validates only; dryRun=false (or omitted) commits.
async function importAssets(req, res, next) {
  try {
    if (!req.is('text/csv') && !req.is('text/plain')) {
      throw new AppError('Send the file as text/csv.', 415);
    }
    const body = typeof req.body === 'string' ? req.body : '';
    if (!body.trim()) throw new AppError('The file is empty.', 400);
    if (Buffer.byteLength(body, 'utf8') > MAX_IMPORT_BYTES) {
      throw new AppError('The file is larger than 2 MB. Split it into smaller files.', 413);
    }

    const dryRun = req.query.dryRun === 'true';
    const prepared = await prepareImport(body);
    const summary = {
      totalRows: prepared.totalRows,
      validRows: prepared.validCount,
      invalidRows: prepared.totalRows - prepared.validCount,
      ignoredColumns: prepared.ignoredColumns,
      unknownColumns: prepared.unknownColumns,
      errors: prepared.rows.flatMap((r) => r.errors),
      warnings: prepared.rows.flatMap((r) => r.warnings.map((message) => ({ row: r.rowNumber, assetId: r.assetId, message }))),
    };

    if (dryRun) {
      return res.json({ success: true, dryRun: true, committed: false, data: summary });
    }

    const result = await commitImport(prepared, { actor: req.user, ip: req.ip });
    const ok = result.failed.length === 0;
    res.status(ok ? 201 : 207).json({
      success: ok,
      dryRun: false,
      committed: result.succeeded.length > 0,
      message: ok
        ? `${result.succeeded.length} asset(s) imported.`
        : `${result.succeeded.length} asset(s) imported; ${result.failed.length} row(s) failed. See the failed rows.`,
      data: { ...summary, succeeded: result.succeeded, failed: result.failed },
    });
  } catch (err) {
    if (err instanceof CsvLimitError) return next(new AppError(err.message, 413));
    if (err.message && /unclosed quoted field|file is empty/i.test(err.message)) return next(new AppError(err.message, 400));
    next(err);
  }
}

module.exports = { exportAssets, importAssets, EXPORT_COLUMNS, exportRow };
