const mongoose = require('../lib/pgdoc');

// A supplier bill (PRD E19), matched to the order and what was received before anyone pays it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, billNo: { type: String }, vendorId: { type: mongoose.Schema.Types.ObjectId, required: true }, vendorName: { type: String, default: '' }, orderId: { type: mongoose.Schema.Types.ObjectId, required: true }, poNo: { type: String, default: '' },
  invoiceNo: { type: String, required: true }, invoiceKey: { type: String, required: true }, invoiceDate: { type: String, default: '' }, dueOn: { type: String, default: '' },
  amount: { type: Number, required: true }, tax: { type: Number, default: 0 }, documentRef: { type: String, default: '' }, note: { type: String, default: '' },
  match: { type: String, enum: ['matched', 'within_tolerance', 'exception'], default: 'matched' }, matchNote: { type: String, default: '' }, receivedValue: { type: Number, default: 0 }, orderBalance: { type: Number, default: 0 },
  status: { type: String, enum: ['entered', 'approved', 'rejected', 'paid', 'void'], default: 'entered' },
  enteredById: { type: mongoose.Schema.Types.ObjectId, default: null }, enteredByName: { type: String, default: '' },
  approvedById: { type: mongoose.Schema.Types.ObjectId, default: null }, approvedByName: { type: String, default: '' }, approvedAt: { type: Date, default: null }, exceptionReason: { type: String, default: '' }, sole: { type: Boolean, default: false },
  pay: { method: String, reference: String, paidOn: String, paidById: mongoose.Schema.Types.ObjectId, paidByName: String, bankSnapshot: String },
  credits: [{ amount: Number, reason: String, at: Date, byName: String }], creditTotal: { type: Number, default: 0 },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, billNo: 1 }, { unique: true });
schema.index({ schoolId: 1, vendorId: 1, invoiceKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, dueOn: 1 });
schema.index({ schoolId: 1, orderId: 1 });
module.exports = mongoose.model('PcInvoice', schema);
