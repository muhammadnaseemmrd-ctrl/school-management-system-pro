const mongoose = require('../lib/pgdoc');
// One sitting of a sheet: scanned, reviewed, graded, moderated and published together (PRD 5.8, E14).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  formId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true },
  sittingDate: Date,
  status: { type: String, enum: ['Scanning', 'Graded', 'Moderation', 'Approved', 'Published'], default: 'Scanning' },
  keyVersion: { type: Number, default: 0 },                    // the key the current grades came from
  gradedAt: Date, gradedById: mongoose.Schema.Types.ObjectId, gradedByName: String,
  submittedById: mongoose.Schema.Types.ObjectId, submittedByName: String, submittedAt: Date,
  resultsHash: String,
  approval: { byId: mongoose.Schema.Types.ObjectId, byName: String, at: Date, sole: Boolean, note: String },
  publish: { at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, examId: mongoose.Schema.Types.ObjectId, subjectId: mongoose.Schema.Types.ObjectId, count: Number, outOf: Number, version: Number },
  notes: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, note: String }],
  history: [{ at: Date, byName: String, action: String, detail: String }],
  createdById: mongoose.Schema.Types.ObjectId, createdByName: String,
}, { timestamps: true });
schema.index({ schoolId: 1, formId: 1, createdAt: -1 });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('OmrBatch', schema);
