const mongoose = require('../lib/pgdoc');

// A bank reconciliation (PRD E23): the ledger balance of a bank account against the bank's own statement, with every difference explained.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true }, ym: { type: String, required: true }, asOf: { type: String, required: true },
  statementBalance: { type: Number, default: 0 }, ledgerBalance: { type: Number, default: 0 },
  items: [{ kind: String, text: String, amount: Number }], explained: { type: Number, default: 0 }, difference: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'signed'], default: 'draft' },
  preparedById: { type: mongoose.Schema.Types.ObjectId, default: null }, preparedByName: { type: String, default: '' },
  signedById: { type: mongoose.Schema.Types.ObjectId, default: null }, signedByName: { type: String, default: '' }, signedAt: { type: Date, default: null }, sole: { type: Boolean, default: false },
  note: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1, ym: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('AcRecon', schema);
