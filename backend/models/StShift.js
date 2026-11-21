const mongoose = require('../lib/pgdoc');

// One cashier's day on one till, from opening float to the counted cash at close (PRD E18).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  tillId: { type: mongoose.Schema.Types.ObjectId, required: true }, tillName: { type: String, default: '' },
  cashierId: { type: mongoose.Schema.Types.ObjectId, required: true }, cashierName: { type: String, default: '' },
  openedAt: { type: Date, default: Date.now }, openingFloat: { type: Number, default: 0 },
  closedAt: { type: Date, default: null }, countedCash: { type: Number, default: null }, expectedCash: { type: Number, default: null }, variance: { type: Number, default: null }, closeNote: { type: String, default: '' },
  totals: { sales: { type: Number, default: 0 }, cash: { type: Number, default: 0 }, other: { type: Number, default: 0 }, refundsCash: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  tillKey: { type: String }, cashierKey: { type: String },         // set only while open: one open shift per till and per cashier
  flagged: { type: Boolean, default: false },
  reviewedBy: { type: String, default: '' }, reviewedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ tillKey: 1 }, { unique: true });
schema.index({ cashierKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, openedAt: -1 });
module.exports = mongoose.model('StShift', schema);
