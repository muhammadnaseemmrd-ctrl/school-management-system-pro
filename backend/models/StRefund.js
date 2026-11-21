const mongoose = require('../lib/pgdoc');

// A refund asked for by one person and decided by another (PRD E18). A cashier can never approve a refund on their own sale or their own request.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  refundNo: { type: String, required: true }, saleId: { type: mongoose.Schema.Types.ObjectId, required: true }, receiptNo: { type: String, default: '' },
  lines: [{ skuId: mongoose.Schema.Types.ObjectId, sku: String, name: String, qty: Number, value: Number }], restock: { type: Boolean, default: true }, amount: { type: Number, required: true }, method: { type: String, default: 'cash' },
  reason: { type: String, required: true },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
  requestedById: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
  shiftId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, refundNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, saleId: 1 });
module.exports = mongoose.model('StRefund', schema);
