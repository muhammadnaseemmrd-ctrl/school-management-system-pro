const mongoose = require('../lib/pgdoc');
// Deductions and withholding that follow the local law. Never hard-coded: a person enters them, an accountant must review them.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['percent-of-gross', 'percent-of-basic', 'fixed', 'tax-slabs'], required: true },
  value: { type: Number, default: 0 },
  slabs: [{ upTo: Number, ratePercent: Number, fixed: Number }],   // annual taxable income; last slab has no upTo
  effectiveFrom: { type: Date, default: Date.now }, status: { type: String, enum: ['Draft', 'Reviewed', 'Retired'], default: 'Draft' },
  createdBy: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' }, reviewedBy: mongoose.Schema.Types.ObjectId, reviewedByName: { type: String, default: '' }, reviewedAt: Date, reviewNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('PayrollRule', schema);
