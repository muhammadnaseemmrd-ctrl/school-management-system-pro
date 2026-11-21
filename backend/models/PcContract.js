const mongoose = require('../lib/pgdoc');

// A running cost the school pays again and again: rent, internet, electricity, insurance (PRD E19).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, title: { type: String, required: true, trim: true }, kind: { type: String, default: 'other' }, vendorId: { type: mongoose.Schema.Types.ObjectId, default: null }, vendorName: { type: String, default: '' },
  amount: { type: Number, default: 0 }, frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' }, category: { type: String, default: 'Utilities' }, costCentre: { type: String, default: '' },
  startOn: { type: String, required: true }, endOn: { type: String, default: '' }, noticeDays: { type: Number, default: 30 }, noticedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'ended'], default: 'active' }, reference: { type: String, default: '' }, createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, endOn: 1 });
module.exports = mongoose.model('PcContract', schema);
