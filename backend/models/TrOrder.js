const mongoose = require('../lib/pgdoc');

// What a learner is buying and how it is paid (PRD E17). Proof that money was sent is kept apart from the administrator's confirmation: only a confirmed instalment opens access.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  orderNo: { type: String, required: true },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrLearner', required: true },
  kind: { type: String, enum: ['course', 'bundle'], default: 'course' },
  courseId: { type: mongoose.Schema.Types.ObjectId, default: null },
  bundleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  cohortId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '' },
  list: { type: Number, default: 0 }, discount: { type: Number, default: 0 }, net: { type: Number, default: 0 },
  tax: { type: Number, default: 0 }, total: { type: Number, default: 0 },
  coupon: { code: String, attribution: String },
  policyVersion: { type: Number, default: 0 }, taxPercent: { type: Number, default: 0 }, refundDays: { type: Number, default: 0 },
  accessAfter: { type: String, default: 'first' },
  currency: { type: String, default: 'PKR' },
  installments: [{ _id: false, no: Number, amount: Number, due: Date, status: { type: String, default: 'due' }, proof: { type: mongoose.Schema.Types.Mixed, default: null }, paidAt: Date, reference: String, method: String, receiptNo: String, confirmedBy: String }],
  status: { type: String, enum: ['pending', 'part_paid', 'paid', 'cancelled', 'part_refunded', 'refunded'], default: 'pending' },
  refunds: [{ _id: false, at: Date, amount: Number, reason: String, byName: String, override: Boolean, revoked: Boolean }],
  refunded: { type: Number, default: 0 },
  rev: { type: Number, default: 0 },                                  // every change is a compare-and-set on this counter
  refs: [String],                                                      // payment references already confirmed on this order
  source: { type: String, default: 'storefront' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, orderNo: 1 }, { unique: true });
schema.index({ schoolId: 1, learnerId: 1, createdAt: -1 });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, courseId: 1 });
schema.index({ schoolId: 1, refs: 1 });
module.exports = mongoose.model('TrOrder', schema);
