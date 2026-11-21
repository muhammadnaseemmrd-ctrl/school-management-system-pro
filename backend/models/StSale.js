const mongoose = require('../lib/pgdoc');

// A sale or a pickup that has been reserved and is waiting to be paid (PRD E18). Prices are copied at the time of sale, so a later price change never alters a receipt.
const line = { skuId: mongoose.Schema.Types.ObjectId, sku: String, name: String, qty: Number, price: Number, gross: Number, total: Number, refunded: { type: Number, default: 0 }, refundedQty: { type: Number, default: 0 } };
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  receiptNo: { type: String }, orderNo: { type: String },
  status: { type: String, enum: ['reserved', 'paid', 'partly_refunded', 'refunded', 'cancelled', 'expired'], default: 'paid' },
  lines: [line], subtotal: { type: Number, default: 0 }, discount: { type: Number, default: 0 }, discountReason: { type: String, default: '' }, total: { type: Number, default: 0 },
  method: { type: String, enum: ['cash', 'bank', 'wallet', 'account'], default: 'cash' }, reference: { type: String, default: '' }, tendered: { type: Number, default: 0 }, change: { type: Number, default: 0 },
  buyerType: { type: String, default: '' }, buyerId: { type: mongoose.Schema.Types.ObjectId, default: null }, buyerName: { type: String, default: '' },
  shiftId: { type: mongoose.Schema.Types.ObjectId, default: null }, tillId: { type: mongoose.Schema.Types.ObjectId, default: null },
  cashierId: { type: mongoose.Schema.Types.ObjectId, default: null }, cashierName: { type: String, default: '' },
  refundedTotal: { type: Number, default: 0 },
  paidAt: { type: Date, default: null }, holdUntil: { type: Date, default: null }, requestedBy: { type: String, default: '' },
  ckey: { type: String },
  note: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, receiptNo: 1 }, { unique: true });
schema.index({ ckey: 1 }, { unique: true });
schema.index({ schoolId: 1, orderNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, shiftId: 1 });
schema.index({ schoolId: 1, buyerId: 1, status: 1 });
module.exports = mongoose.model('StSale', schema);
