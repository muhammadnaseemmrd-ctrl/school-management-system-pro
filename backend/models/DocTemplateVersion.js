const mongoose = require('../lib/pgdoc');
// One saved design. Only a Draft can change. Review, Published and Archived versions are frozen, so anything printed from a
// version can be explained later.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocTemplate', required: true },
  version: { type: Number, required: true },
  state: { type: String, enum: ['Draft', 'Review', 'Published', 'Archived'], default: 'Draft' },
  layout: { type: mongoose.Schema.Types.Mixed, required: true },   // { paper, sides:[{key, background, layers:[]}] }
  theme: { type: mongoose.Schema.Types.Mixed, default: {} },         // { primary, accent, ink, paper }
  locales: { type: [String], default: ['en'] },
  note: { type: String, default: '' },
  report: { type: mongoose.Schema.Types.Mixed, default: {} },       // last validation: { errors, warnings, contrast, fields }
  hash: { type: String, default: '' },                              // sha256 of layout+theme, set when frozen
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  submittedById: mongoose.Schema.Types.ObjectId, submittedByName: { type: String, default: '' }, submittedAt: Date,
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  publishedAt: Date, archivedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, templateId: 1, version: -1 }, { unique: true });
schema.index({ schoolId: 1, state: 1, updatedAt: -1 });
module.exports = mongoose.model('DocTemplateVersion', schema);
