const mongoose = require('../lib/pgdoc');

// A supplier (PRD E19). Bank details change only when a different administrator approves; names, tax numbers and account numbers are checked for repeats.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, nameKey: { type: String, required: true }, taxNo: { type: String, default: '' }, taxKey: { type: String },
  phone: { type: String, default: '' }, email: { type: String, default: '' }, address: { type: String, default: '' }, contact: { type: String, default: '' },
  categories: [String], status: { type: String, enum: ['active', 'blocked'], default: 'active' }, blockReason: { type: String, default: '' },
  bank: { bankName: { type: String, default: '' }, accountTitle: { type: String, default: '' }, accountNo: { type: String, default: '' }, branch: { type: String, default: '' } },
  bankKey: { type: String },
  pendingBank: { bankName: String, accountTitle: String, accountNo: String, branch: String, bankKey: String, reason: String, requestedById: mongoose.Schema.Types.ObjectId, requestedByName: String, requestedAt: Date },
  notes: { type: String, default: '' }, createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, nameKey: 1 }, { unique: true });
schema.index({ schoolId: 1, taxKey: 1 }, { unique: true });
schema.index({ schoolId: 1, bankKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, name: 1 });
module.exports = mongoose.model('PcVendor', schema);
