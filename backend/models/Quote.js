const mongoose = require('../lib/pgdoc');
// A priced offer to a lead or an existing school (PRD E28). The buyer sees it through a private link and accepts or declines.
const line = new mongoose.Schema({ label: { type: String, required: true, maxlength: 160 }, amountPKR: { type: Number, required: true } }, { _id: false });
const history = new mongoose.Schema({ at: { type: Date, default: Date.now }, by: { type: String, default: '' }, action: { type: String, default: '' }, note: { type: String, default: '' } }, { _id: false });
const schema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, default: null },
  schoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
  buyerName: { type: String, default: '' }, buyerEmail: { type: String, default: '' }, schoolName: { type: String, default: '' },
  planSlug: { type: String, required: true, lowercase: true }, planLabel: { type: String, default: '' },
  billingPeriod: { type: String, enum: ['monthly', 'yearly'], required: true },
  lines: { type: [line], default: [] },
  subtotalPKR: { type: Number, default: 0 }, discountPercent: { type: Number, default: 0, min: 0, max: 50 }, discountReason: { type: String, default: '' }, discountPKR: { type: Number, default: 0 },
  totalPKR: { type: Number, required: true, min: 1 },
  validUntil: { type: Date, required: true },
  terms: { type: String, default: '', maxlength: 4000 }, note: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired', 'Withdrawn'], default: 'Draft' },
  tokenHash: { type: String, default: '' },
  sentAt: Date, acceptedAt: Date, acceptedByName: { type: String, default: '' }, acceptedByEmail: { type: String, default: '' }, acceptedIpHash: { type: String, default: '' }, acceptedTermsHash: { type: String, default: '' },
  declinedAt: Date, declineReason: { type: String, default: '' },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdByName: { type: String, default: '' },
  history: { type: [history], default: [] },
}, { timestamps: true });
schema.index({ tokenHash: 1 });
schema.index({ status: 1, validUntil: 1 });
schema.index({ leadId: 1 });
schema.index({ schoolId: 1, createdAt: -1 });
module.exports = mongoose.model('Quote', schema);
