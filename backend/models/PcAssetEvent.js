const mongoose = require('../lib/pgdoc');

// Where an asset has been and what happened to it (PRD E19). Never edited.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, assetId: { type: mongoose.Schema.Types.ObjectId, required: true }, kind: { type: String, default: 'note' }, from: { type: String, default: '' }, to: { type: String, default: '' }, note: { type: String, default: '' },
  byId: { type: mongoose.Schema.Types.ObjectId, default: null }, byName: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ schoolId: 1, assetId: 1, createdAt: -1 });
module.exports = mongoose.model('PcAssetEvent', schema);
