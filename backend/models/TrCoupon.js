const mongoose = require('../lib/pgdoc');

// A discount or partner code (PRD E17). Judged on the server only; `attribution` names who sent the buyer, so net revenue can be reported per source.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true },
  kind: { type: String, enum: ['percent', 'amount'], default: 'percent' },
  value: { type: Number, required: true, min: 1 },
  courseIds: [{ type: mongoose.Schema.Types.ObjectId }],            // empty = any course
  validFrom: { type: Date, default: null }, validTo: { type: Date, default: null },
  maxUses: { type: Number, default: 0 }, used: { type: Number, default: 0 },
  oncePerLearner: { type: Boolean, default: true },
  attribution: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
module.exports = mongoose.model('TrCoupon', schema);
