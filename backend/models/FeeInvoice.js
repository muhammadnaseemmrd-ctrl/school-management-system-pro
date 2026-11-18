const mongoose = require('../lib/pgdoc');

// One authoritative invoice for a set of fee lines. A fee line can sit on only one live invoice.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  number: { type: String, required: true },
  challanCode: { type: String, required: true },
  period: { type: String, default: '' },
  issueDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  lines: [{ key: String, kind: String, title: String, amount: Number, discount: Number, net: Number,
    discounts: [{ ruleId: String, name: String, amount: Number }], installment: Number, chargeId: String, lateFee: { type: Boolean, default: false } }],
  total: { type: Number, default: 0 },          // sum of line nets, whole PKR
  adjusted: { type: Number, default: 0 },       // credit notes, write-offs and concessions approved after issue
  writtenOff: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },           // allocations net of refunds
  status: { type: String, enum: ['Open', 'PartiallyPaid', 'Paid', 'WrittenOff', 'Void'], default: 'Open' },
  lateFeeApplied: { type: Boolean, default: false },
  voidReason: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
schema.index({ schoolId: 1, challanCode: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('FeeInvoice', schema);
