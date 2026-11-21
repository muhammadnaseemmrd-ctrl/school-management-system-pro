const mongoose = require('../lib/pgdoc');

// A budget for one cost centre and year (PRD E19). Spending is checked against its approved lines.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  year: { type: String, required: true }, costCentre: { type: String, required: true }, note: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'approved', 'closed'], default: 'draft' }, total: { type: Number, default: 0 },
  createdById: { type: mongoose.Schema.Types.ObjectId, default: null }, createdByName: { type: String, default: '' },
  approvedById: { type: mongoose.Schema.Types.ObjectId, default: null }, approvedByName: { type: String, default: '' }, approvedAt: { type: Date, default: null }, sole: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, year: 1, costCentre: 1 }, { unique: true });
module.exports = mongoose.model('PcBudget', schema);
