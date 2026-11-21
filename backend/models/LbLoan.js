const mongoose = require('../lib/pgdoc');

// A loan of one copy (PRD E18). `activeCopy` is only set while the copy is out and is unique, so two desks cannot lend the same copy.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  copyId: { type: mongoose.Schema.Types.ObjectId, required: true }, titleId: { type: mongoose.Schema.Types.ObjectId, required: true }, barcode: { type: String, default: '' }, titleName: { type: String, default: '' },
  cardId: { type: mongoose.Schema.Types.ObjectId, required: true }, holderType: { type: String, default: 'student' }, holderId: { type: mongoose.Schema.Types.ObjectId, required: true }, holderName: { type: String, default: '' },
  kind: { type: String, enum: ['loan', 'textbook'], default: 'loan' }, year: { type: String, default: '' },     // textbooks are issued for a school year
  issuedAt: { type: Date, default: Date.now }, dueOn: { type: Date, required: true }, returnedAt: { type: Date, default: null },
  renewals: { type: Number, default: 0 }, status: { type: String, enum: ['open', 'returned', 'lost'], default: 'open' },
  conditionOut: { type: String, default: 'good' }, conditionIn: { type: String, default: '' },
  issuedByName: { type: String, default: '' }, returnedByName: { type: String, default: '' }, policyVersion: { type: Number, default: 1 },
  activeCopy: { type: String },
  remindedOn: { type: String, default: '' }, overdueNotedOn: { type: String, default: '' },
}, { timestamps: true });
schema.index({ activeCopy: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, dueOn: 1 });
schema.index({ schoolId: 1, cardId: 1, status: 1 });
schema.index({ schoolId: 1, titleId: 1, status: 1 });
schema.index({ schoolId: 1, kind: 1, year: 1, status: 1 });
module.exports = mongoose.model('LbLoan', schema);
