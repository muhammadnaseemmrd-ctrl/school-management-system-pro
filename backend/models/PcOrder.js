const mongoose = require('../lib/pgdoc');

// A purchase order (PRD E19). It holds the money set aside for it until the bills are paid.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, poNo: { type: String }, requisitionId: { type: mongoose.Schema.Types.ObjectId, required: true }, vendorId: { type: mongoose.Schema.Types.ObjectId, required: true }, vendorName: { type: String, default: '' },
  title: { type: String, default: '' }, costCentre: { type: String, default: '' }, category: { type: String, default: '' },
  budgetLineId: { type: mongoose.Schema.Types.ObjectId, default: null }, fundId: { type: mongoose.Schema.Types.ObjectId, default: null }, projectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  subtotal: { type: Number, default: 0 }, tax: { type: Number, default: 0 }, total: { type: Number, default: 0 },
  status: { type: String, enum: ['issued', 'part_received', 'received', 'closed', 'cancelled'], default: 'issued' },
  committedLeft: { type: Number, default: 0 }, invoicedTotal: { type: Number, default: 0 }, paidTotal: { type: Number, default: 0 },
  expectedOn: { type: String, default: '' }, terms: { type: String, default: '' }, cancelReason: { type: String, default: '' },
  issuedById: { type: mongoose.Schema.Types.ObjectId, default: null }, issuedByName: { type: String, default: '' }, closedAt: { type: Date, default: null },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, poNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, vendorId: 1, createdAt: -1 });
module.exports = mongoose.model('PcOrder', schema);
