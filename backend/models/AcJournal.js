const mongoose = require('../lib/pgdoc');

// A journal entry (PRD E23). Drafts and submitted entries keep their lines here; once posted the lines are copied to AcLine and nothing can change.
const line = { code: String, debit: { type: Number, default: 0 }, credit: { type: Number, default: 0 }, memo: { type: String, default: '' }, fundId: { type: String, default: '' }, campusId: { type: String, default: '' }, costCentre: { type: String, default: '' } };
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  number: { type: String, required: true }, date: { type: String, required: true }, ym: { type: String, required: true },
  type: { type: String, enum: ['manual', 'opening', 'adjusting', 'system', 'reversal'], default: 'manual' },
  status: { type: String, enum: ['draft', 'submitted', 'rejected', 'posting', 'posted'], default: 'draft' },
  memo: { type: String, default: '' }, reference: { type: String, default: '' }, lines: [line],
  totalDebit: { type: Number, default: 0 }, totalCredit: { type: Number, default: 0 },
  sourceType: { type: String, default: '' }, sourceId: { type: String, default: '' }, sourceKey: { type: String }, shifted: { type: Boolean, default: false },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, default: null }, reversedBy: { type: mongoose.Schema.Types.ObjectId, default: null }, reversalReason: { type: String, default: '' },
  flags: [{ kind: String, text: String }], warnings: [String],
  preparedById: { type: mongoose.Schema.Types.ObjectId, default: null }, preparedByName: { type: String, default: '' },
  submittedAt: { type: Date, default: null }, decidedById: { type: mongoose.Schema.Types.ObjectId, default: null }, decidedByName: { type: String, default: '' }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
  postedAt: { type: Date, default: null }, hash: { type: String, default: '' },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
schema.index({ sourceKey: 1 }, { unique: true });                              // a source posts each revision once
schema.index({ reversalOf: 1 }, { unique: true });                              // a journal is reversed once
schema.index({ schoolId: 1, status: 1, date: -1 });
schema.index({ schoolId: 1, ym: 1, status: 1 });
schema.index({ schoolId: 1, sourceType: 1, sourceId: 1 });
module.exports = mongoose.model('AcJournal', schema);
