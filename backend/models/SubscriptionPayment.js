const mongoose = require('../lib/pgdoc');

// What a school actually paid Aulensia for its plan (not what students paid the school).
// Rows are never edited once confirmed: a mistake is fixed by refunding and recording again.
const subscriptionPaymentSchema = new mongoose.Schema(
  {
    // Not cascaded when a school is deleted: financial history must survive.
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    schoolName: { type: String, default: '' },
    schoolCode: { type: String, default: '' },
    planSlug: { type: String, required: true, lowercase: true, trim: true },
    billingPeriod: { type: String, enum: ['monthly', 'yearly'], required: true },
    amountPKR: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['bank', 'jazzcash', 'easypaisa', 'cash', 'other'], required: true },
    reference: { type: String, default: '', trim: true },
    paidAt: { type: Date, required: true },
    coversFrom: { type: Date, required: true },
    coversTo: { type: Date, required: true },
    status: { type: String, enum: ['Confirmed', 'Refunded'], default: 'Confirmed' },
    refundedAt: Date,
    refundReason: { type: String, default: '' },
    // Frozen from the school at the moment of payment
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    commissionPercent: { type: Number, default: 0 },
    // Retrying the same request never records the same money twice
    idempotencyKey: { type: String, unique: true, sparse: true },
    // Set when plan/expiry, journal and commission have all been applied; a reconcile job finishes the rest.
    settledAt: { type: Date, default: null },
    note: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId },
    recordedByName: { type: String, default: '' },
  },
  { timestamps: true }
);
subscriptionPaymentSchema.index({ schoolId: 1, paidAt: -1 });
subscriptionPaymentSchema.index({ agentId: 1, paidAt: -1 });
subscriptionPaymentSchema.index({ status: 1, paidAt: -1 });
subscriptionPaymentSchema.index({ settledAt: 1, createdAt: 1 });

module.exports = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
