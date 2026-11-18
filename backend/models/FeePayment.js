const mongoose = require('../lib/pgdoc');

// Money received. Never edited: a mistake is corrected by a reversal or an approved refund, both kept.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  payerParentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', default: null },
  amount: { type: Number, required: true, min: 1 },
  method: { type: String, enum: ['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque', 'other'], required: true },
  reference: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Rejected'], default: 'Pending' },
  evidence: { kind: { type: String, default: '' }, refId: { type: String, default: '' } },   // cash-session | bank-line | proof
  receiptNo: { type: String, default: '' },
  sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  allocations: [{ invoiceId: String, invoiceNumber: String, amount: Number, at: Date }],
  refunded: { type: Number, default: 0 },
  refunds: [{ adjustmentId: String, voucherNo: String, amount: Number, at: Date }],
  idempotencyKey: { type: String, default: '' },
  note: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  confirmedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, receiptNo: 1 });
schema.index({ schoolId: 1, studentId: 1, receivedAt: -1 });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, idempotencyKey: 1 });
schema.index({ schoolId: 1, sessionId: 1 });

module.exports = mongoose.model('FeePayment', schema);
