const mongoose = require('../lib/pgdoc');

// A request to buy something (PRD E19): quotes, approval by someone other than the requester, then a commitment against the budget and fund.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, reqNo: { type: String }, title: { type: String, required: true, trim: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, default: null }, requesterName: { type: String, default: '' }, requesterRole: { type: String, default: '' },
  costCentre: { type: String, required: true }, year: { type: String, default: '' }, category: { type: String, required: true },
  budgetLineId: { type: mongoose.Schema.Types.ObjectId, default: null }, fundId: { type: mongoose.Schema.Types.ObjectId, default: null }, projectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  items: [{ description: String, qty: Number, unit: String, unitPrice: Number, amount: Number }], total: { type: Number, default: 0 },
  justification: { type: String, default: '' }, neededBy: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected', 'ordered', 'closed', 'cancelled'], default: 'draft' },
  quotes: [{ key: String, vendorId: mongoose.Schema.Types.ObjectId, vendorName: String, amount: Number, validTo: String, note: String, receivedAt: Date, byName: String }],
  chosenQuote: { type: String, default: '' }, chosenVendorId: { type: mongoose.Schema.Types.ObjectId, default: null }, soleSourceReason: { type: String, default: '' }, chosenReason: { type: String, default: '' },
  levels: { type: Number, default: 1 }, step: { type: Number, default: 0 }, approvals: [{ byId: mongoose.Schema.Types.ObjectId, byName: String, at: Date, note: String }],
  committedAmount: { type: Number, default: 0 }, orderId: { type: mongoose.Schema.Types.ObjectId, default: null }, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, reqNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, requesterId: 1, createdAt: -1 });
module.exports = mongoose.model('PcRequisition', schema);
