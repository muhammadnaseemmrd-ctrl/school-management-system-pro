const mongoose = require('../lib/pgdoc');

// A posted journal line (PRD E23). Written once, never changed or deleted. Debits equal credits per journal.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  journalId: { type: mongoose.Schema.Types.ObjectId, required: true }, journalNo: { type: String, default: '' }, seq: { type: Number, required: true },
  date: { type: String, required: true }, ym: { type: String, required: true },
  code: { type: String, required: true }, kind: { type: String, required: true },
  debit: { type: Number, default: 0 }, credit: { type: Number, default: 0 },
  memo: { type: String, default: '' }, fundId: { type: String }, campusId: { type: String }, costCentre: { type: String },
  sourceType: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ schoolId: 1, journalId: 1, seq: 1 }, { unique: true });
schema.index({ schoolId: 1, code: 1, date: 1 });
schema.index({ schoolId: 1, ym: 1, code: 1 });
schema.index({ schoolId: 1, fundId: 1, date: 1 });
schema.index({ schoolId: 1, kind: 1, date: 1 });
module.exports = mongoose.model('AcLine', schema);
