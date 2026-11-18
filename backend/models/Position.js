const mongoose = require('../lib/pgdoc');
// A job in the school with its pay band. Every change is kept in history, so old contracts still make sense.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  title: { type: String, required: true, trim: true }, department: { type: String, default: '' }, grade: { type: String, default: '' },
  salaryMin: { type: Number, default: 0, min: 0 }, salaryMax: { type: Number, default: 0, min: 0 },
  reportsToPositionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  effectiveFrom: { type: Date, default: Date.now }, status: { type: String, enum: ['Active', 'Retired'], default: 'Active' },
  history: [{ at: Date, byName: String, salaryMin: Number, salaryMax: Number, title: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, title: 1 });
module.exports = mongoose.model('Position', schema);
