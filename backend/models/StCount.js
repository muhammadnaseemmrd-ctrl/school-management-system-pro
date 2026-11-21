const mongoose = require('../lib/pgdoc');

// A physical stock count (PRD E18). The counter enters what they find; differences become stock movements only after a different person approves.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  countNo: { type: String, required: true }, title: { type: String, default: '' }, category: { type: String, default: '' },
  lines: [{ skuId: mongoose.Schema.Types.ObjectId, sku: String, name: String, expected: Number, counted: { type: Number, default: null }, diff: { type: Number, default: 0 }, value: { type: Number, default: 0 }, cost: { type: Number, default: 0 }, note: { type: String, default: '' } }],
  status: { type: String, enum: ['counting', 'submitted', 'approved', 'rejected'], default: 'counting' },
  submittedById: mongoose.Schema.Types.ObjectId, submittedByName: { type: String, default: '' },
  startedById: mongoose.Schema.Types.ObjectId, startedByName: { type: String, default: '' }, submittedAt: { type: Date, default: null },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
  netValue: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, countNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('StCount', schema);
