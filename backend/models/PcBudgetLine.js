const mongoose = require('../lib/pgdoc');

// One category inside a budget (PRD E19). "available" is kept next to the totals so a spend can be a single conditional write.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, budgetId: { type: mongoose.Schema.Types.ObjectId, required: true }, year: { type: String, default: '' }, costCentre: { type: String, default: '' },
  category: { type: String, required: true }, amount: { type: Number, default: 0 },
  committed: { type: Number, default: 0 }, spent: { type: Number, default: 0 }, available: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, budgetId: 1, category: 1 }, { unique: true });
schema.index({ schoolId: 1, year: 1, costCentre: 1 });
module.exports = mongoose.model('PcBudgetLine', schema);
