const mongoose = require('mongoose');

const ASSET_STATUSES = ['ACTIVE', 'MAINTENANCE', 'DISPOSED', 'TRANSFERRED'];

const assetSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, unique: true, trim: true, index: true }, // human-facing e.g. AST-001
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, required: true, trim: true, index: true },
    brand: { type: String, trim: true, default: '' },
    model: { type: String, trim: true, default: '' },
    serialNumber: { type: String, trim: true, unique: true, sparse: true, index: true },
    purchaseDate: { type: Date, required: true },
    purchaseCost: { type: Number, min: 0, default: 0 },
    warranty: { type: String, trim: true, default: '' },
    status: { type: String, enum: ASSET_STATUSES, default: 'ACTIVE', index: true },

    // Ownership is enforced by stable IDs. These are only changed through lifecycle
    // events (ALLOCATION / TRANSFER), never by a plain asset update.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },

    // Denormalized display values, derived by the server from the references above.
    owner: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '', index: true },
    location: { type: String, trim: true, default: '', index: true },

    description: { type: String, trim: true, default: '' },
    dppId: { type: String, required: true, unique: true, index: true }, // DPP-<assetId>
    qrGenerated: { type: Boolean, default: false },
    qrGeneratedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assetSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Asset', assetSchema);
module.exports.ASSET_STATUSES = ASSET_STATUSES;
