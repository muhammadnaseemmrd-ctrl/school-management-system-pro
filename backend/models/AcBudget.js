const mongoose = require('../lib/pgdoc');

// A budget for one fiscal year (PRD E23): amounts per account and month. Each change is a new version; a different person approves.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  fy: { type: String, required: true }, version: { type: Number, default: 1 }, note: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'approved', 'superseded'], default: 'draft' },
  lines: [{ code: String, months: [Number], total: Number }], totalIncome: { type: Number, default: 0 }, totalExpense: { type: Number, default: 0 },
  createdById: { type: mongoose.Schema.Types.ObjectId, default: null }, createdByName: { type: String, default: '' },
  approvedById: { type: mongoose.Schema.Types.ObjectId, default: null }, approvedByName: { type: String, default: '' }, approvedAt: { type: Date, default: null }, sole: { type: Boolean, default: false }, approveNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, fy: 1, version: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('AcBudget', schema);
