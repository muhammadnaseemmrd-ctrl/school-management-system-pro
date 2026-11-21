const mongoose = require('../lib/pgdoc');

// A change order on a facility project (PRD E19): more money, a different scope or a new end date. A different administrator decides.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, projectId: { type: mongoose.Schema.Types.ObjectId, required: true }, chgNo: { type: String }, kind: { type: String, enum: ['increase', 'scope', 'schedule'], required: true },
  amount: { type: Number, default: 0 }, endOn: { type: String, default: '' }, reason: { type: String, default: '' },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
  requestedById: { type: mongoose.Schema.Types.ObjectId, default: null }, requestedByName: { type: String, default: '' },
  decidedById: { type: mongoose.Schema.Types.ObjectId, default: null }, decidedByName: { type: String, default: '' }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, chgNo: 1 }, { unique: true });
schema.index({ schoolId: 1, projectId: 1, createdAt: -1 });
module.exports = mongoose.model('PcChange', schema);
