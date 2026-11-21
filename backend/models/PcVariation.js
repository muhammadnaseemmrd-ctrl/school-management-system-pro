const mongoose = require('../lib/pgdoc');

// A change to an approved budget (PRD E19): move money between lines or raise a line. A different administrator decides.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, varNo: { type: String }, kind: { type: String, enum: ['move', 'increase'], required: true },
  fromLineId: { type: mongoose.Schema.Types.ObjectId, default: null }, toLineId: { type: mongoose.Schema.Types.ObjectId, required: true }, amount: { type: Number, required: true }, reason: { type: String, default: '' },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
  requestedById: { type: mongoose.Schema.Types.ObjectId, default: null }, requestedByName: { type: String, default: '' },
  decidedById: { type: mongoose.Schema.Types.ObjectId, default: null }, decidedByName: { type: String, default: '' }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, varNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('PcVariation', schema);
