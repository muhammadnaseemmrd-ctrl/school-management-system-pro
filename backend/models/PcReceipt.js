const mongoose = require('../lib/pgdoc');

// Goods or services received against an order (PRD E19).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, grnNo: { type: String }, orderId: { type: mongoose.Schema.Types.ObjectId, required: true }, poNo: { type: String, default: '' },
  lines: [{ lineId: mongoose.Schema.Types.ObjectId, n: Number, description: String, qty: Number, rejected: Number, note: String }],
  value: { type: Number, default: 0 }, note: { type: String, default: '' }, receivedOn: { type: String, default: '' }, clientKey: { type: String },
  byId: { type: mongoose.Schema.Types.ObjectId, default: null }, byName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, grnNo: 1 }, { unique: true });
schema.index({ schoolId: 1, clientKey: 1 }, { unique: true });
schema.index({ schoolId: 1, orderId: 1, createdAt: -1 });
module.exports = mongoose.model('PcReceipt', schema);
