const mongoose = require('../lib/pgdoc');

// A stored copy of one school's data (gzip-compressed JSON). Weekly copies are made automatically; admins can add
// manual ones. The data stays inside the platform database; downloads are produced from it with passwords removed.
const backupSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    kind: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
    createdByName: { type: String, default: '' },
    size: { type: Number, default: 0 },      // compressed bytes
    rawSize: { type: Number, default: 0 },   // JSON bytes
    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    checksum: { type: String, default: '' }, // sha256 of the uncompressed JSON, so corruption can be detected later
    lastDrillStatus: { type: String, default: '' },
    lastDrillAt: Date,
    data: { type: Buffer, select: false },
  },
  { timestamps: true }
);
backupSchema.index({ schoolId: 1, kind: 1, createdAt: -1 });

module.exports = mongoose.model('Backup', backupSchema);
