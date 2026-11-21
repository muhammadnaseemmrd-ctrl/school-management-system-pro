const mongoose = require('../lib/pgdoc');

// A charge made by the published policy (PRD E18). The amount is worked out from the policy version, never typed in. It can be paid or waived with a reason.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  fineNo: { type: String, required: true },
  cardId: { type: mongoose.Schema.Types.ObjectId, required: true }, holderType: { type: String, default: 'student' }, holderId: { type: mongoose.Schema.Types.ObjectId, required: true }, holderName: { type: String, default: '' },
  loanId: { type: mongoose.Schema.Types.ObjectId, default: null }, titleName: { type: String, default: '' }, barcode: { type: String, default: '' },
  kind: { type: String, enum: ['overdue', 'lost', 'damage'], required: true }, amount: { type: Number, required: true }, basis: { type: String, default: '' }, policyVersion: { type: Number, default: 1 },
  status: { type: String, enum: ['open', 'paid', 'waived', 'void'], default: 'open' },
  paidAt: { type: Date, default: null }, paidMethod: { type: String, default: '' }, paidRef: { type: String, default: '' }, receivedByName: { type: String, default: '' },
  waivedAt: { type: Date, default: null }, waivedByName: { type: String, default: '' }, waiveReason: { type: String, default: '' },
  refundDue: { type: Boolean, default: false }, refundNote: { type: String, default: '' },    // a lost copy came back after the fine was paid
}, { timestamps: true });
schema.index({ schoolId: 1, fineNo: 1 }, { unique: true });
schema.index({ schoolId: 1, cardId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('LbFine', schema);
