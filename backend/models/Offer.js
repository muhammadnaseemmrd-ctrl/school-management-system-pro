const mongoose = require('../lib/pgdoc');

// Promotional offer created by the platform owner (Super Admin) and shown to school admins.
const offerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    code: { type: String, default: '', uppercase: true, trim: true },
    discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    discountValue: { type: Number, default: 0, min: 0 }, // percent (0-100) or PKR off per month
    planSlugs: { type: [String], default: [] }, // empty = every plan
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Query paths (indexing is part of the schema, so every environment gets it)
offerSchema.index({ isActive: 1, validUntil: 1 });

module.exports = mongoose.model('Offer', offerSchema);
