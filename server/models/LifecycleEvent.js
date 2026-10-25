const mongoose = require('mongoose');

const EVENT_TYPES = ['REGISTRATION', 'ALLOCATION', 'MAINTENANCE', 'TRANSFER', 'DISPOSAL'];

const lifecycleEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true }, // EVT-<uuid-ish>
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    assetId: { type: String, required: true, index: true }, // denormalized human-facing id, for fast lookups
    eventType: { type: String, enum: EVENT_TYPES, required: true, index: true },
    description: { type: String, trim: true, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedByName: { type: String, required: true }, // denormalized for display
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // event-type-specific fields
    previousHash: { type: String, required: true },
    currentHash: { type: String, required: true, unique: true, index: true },
    blockIndex: { type: Number, required: true },
  },
  { timestamps: true }
);

lifecycleEventSchema.index({ asset: 1, timestamp: 1 });

module.exports = mongoose.model('LifecycleEvent', lifecycleEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
