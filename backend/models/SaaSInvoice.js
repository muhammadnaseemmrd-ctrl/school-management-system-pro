const mongoose = require('../lib/pgdoc');
// What a buyer owes Aulensia for a plan (PRD E28). Paid by recording the money through the same path as every other payment.
const line = new mongoose.Schema({ label: { type: String, required: true }, amountPKR: { type: Number, required: true } }, { _id: false });
const schema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, default: null },
  leadId: { type: mongoose.Schema.Types.ObjectId, default: null },
  schoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
  buyerName: { type: String, default: '' }, buyerEmail: { type: String, default: '' }, schoolName: { type: String, default: '' },
  planSlug: { type: String, required: true }, planLabel: { type: String, default: '' }, billingPeriod: { type: String, enum: ['monthly', 'yearly'], required: true },
  lines: { type: [line], default: [] }, totalPKR: { type: Number, required: true, min: 1 },
  issuedAt: { type: Date, default: Date.now }, dueAt: { type: Date, required: true },
  status: { type: String, enum: ['Issued', 'Paid', 'Void'], default: 'Issued' },
  paidAt: Date, paymentId: { type: mongoose.Schema.Types.ObjectId, default: null }, method: { type: String, default: '' }, reference: { type: String, default: '' },
  voidReason: { type: String, default: '' }, voidedAt: Date,
  reminderAt: { type: Date, default: null }, reminders: { type: Number, default: 0 },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ status: 1, dueAt: 1 });
schema.index({ schoolId: 1, issuedAt: -1 });
schema.index({ quoteId: 1 });
schema.index({ leadId: 1 });
module.exports = mongoose.model('SaaSInvoice', schema);
