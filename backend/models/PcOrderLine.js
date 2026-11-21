const mongoose = require('../lib/pgdoc');

// One line of an order (PRD E19). "receivable" is what can still arrive, so two people booking the same delivery cannot receive more than was ordered.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, orderId: { type: mongoose.Schema.Types.ObjectId, required: true }, n: { type: Number, default: 1 }, description: { type: String, default: '' },
  qty: { type: Number, default: 1 }, unit: { type: String, default: '' }, unitPrice: { type: Number, default: 0 }, amount: { type: Number, default: 0 },
  receivedQty: { type: Number, default: 0 }, rejectedQty: { type: Number, default: 0 }, receivable: { type: Number, default: 0 }, tagged: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, orderId: 1, n: 1 }, { unique: true });
module.exports = mongoose.model('PcOrderLine', schema);
