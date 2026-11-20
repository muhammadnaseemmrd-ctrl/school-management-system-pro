const mongoose = require('../lib/pgdoc');
// A school's look (PRD E27: ThemeVersion). Versions are never edited once published; a rollback publishes a copy of an older one.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, version: { type: Number, required: true },
  state: { type: String, enum: ['Draft', 'Published', 'Archived'], default: 'Draft' },
  tokens: { type: mongoose.Schema.Types.Mixed, default: {} }, report: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String, default: '' }, basedOn: { type: Number, default: 0 }, rollbackOf: { type: Number, default: 0 },
  createdByName: { type: String, default: '' }, publishedByName: { type: String, default: '' }, publishedAt: { type: Date }, archivedAt: { type: Date },
}, { timestamps: true });
schema.index({ schoolId: 1, version: 1 }, { unique: true });
schema.index({ schoolId: 1, state: 1 });
module.exports = mongoose.model('ThemeVersion', schema);
