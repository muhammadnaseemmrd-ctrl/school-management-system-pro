const mongoose = require('../lib/pgdoc');
// A logo, background or signature image used by templates, with where it came from and the right to use it (CAP-0438).
// An asset's picture never changes; a replacement is a new asset.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['logo', 'background', 'signature', 'seal', 'pattern', 'other'], default: 'other' },
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredFile', required: true },
  fileKey: { type: String, required: true },
  mime: { type: String, default: 'image/png' }, size: { type: Number, default: 0 },
  widthPx: { type: Number, default: 0 }, heightPx: { type: Number, default: 0 },
  license: { kind: { type: String, enum: ['owned', 'licensed', 'cc', 'public-domain', 'unknown'], default: 'unknown' }, source: { type: String, default: '' }, attribution: { type: String, default: '' }, reference: { type: String, default: '' } },
  verified: { type: Boolean, default: false },                    // an administrator has checked the right to use it
  verifiedByName: { type: String, default: '' }, verifiedAt: Date,
  origin: { type: String, enum: ['upload', 'import', 'base'], default: 'upload' },
  retired: { type: Boolean, default: false },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, retired: 1, createdAt: -1 });
module.exports = mongoose.model('StudioAsset', schema);
