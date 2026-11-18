const mongoose = require('../lib/pgdoc');

// One credit from a bank statement. Unmatched credits are kept; nothing settles until a person confirms the match.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fileName: { type: String, default: '' },
  date: { type: Date, required: true },
  description: { type: String, default: '' },
  reference: { type: String, default: '' },
  amount: { type: Number, required: true, min: 1 },
  fingerprint: { type: String, required: true },
  status: { type: String, enum: ['Unmatched', 'Matched', 'Ignored'], default: 'Unmatched' },
  suggestion: { invoiceId: String, invoiceNumber: String, studentName: String, confidence: String, why: String },
  paymentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  ignoredReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, fingerprint: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, date: -1 });
schema.index({ schoolId: 1, batchId: 1 });

module.exports = mongoose.model('BankStatementLine', schema);
