const mongoose = require('../lib/pgdoc');
// One month's salary run. The preparer cannot finalize it. A finalized batch never changes; a correction is a new batch.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  period: { type: String, required: true }, version: { type: Number, default: 1 },
  status: { type: String, enum: ['Draft', 'Finalized', 'Superseded'], default: 'Draft' },
  lines: [{ employeeId: String, code: String, name: String, basic: Number, allowances: Number, overtime: Number, gross: Number, taxable: Number,
    deductions: [{ name: String, amount: Number }], absenceDeduction: Number, unpaidDays: Number, advance: Number, tax: Number, net: Number, exceptions: [String], advanceIds: [String] }],
  totals: { gross: Number, deductions: Number, net: Number, employees: Number },
  rulesUsed: [{ ruleId: String, name: String, reviewedByName: String }],
  preparedBy: mongoose.Schema.Types.ObjectId, preparedByName: { type: String, default: '' }, finalizedBy: mongoose.Schema.Types.ObjectId, finalizedByName: { type: String, default: '' }, finalizedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, period: 1, version: -1 });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('PayrollBatch', schema);
