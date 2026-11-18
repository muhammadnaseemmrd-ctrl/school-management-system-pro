const mongoose = require('../lib/pgdoc');

// Credit note, write-off, refund or concession. Needs a second person to approve (maker-checker). Kept forever.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  type: { type: String, enum: ['credit-note', 'write-off', 'refund', 'concession'], required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  paymentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  amount: { type: Number, required: true, min: 1 },
  reasonCode: { type: String, required: true },
  note: { type: String, default: '' },
  status: { type: String, enum: ['Requested', 'Approved', 'Rejected'], default: 'Requested' },
  requestedBy: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' },
  decidedBy: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  voucherNo: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, invoiceId: 1 });
schema.index({ schoolId: 1, paymentId: 1 });

module.exports = mongoose.model('FeeAdjustment', schema);
