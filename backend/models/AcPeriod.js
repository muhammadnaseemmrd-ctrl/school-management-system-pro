const mongoose = require('../lib/pgdoc');

// One month of the ledger (PRD E23). Posting is refused unless the month is open.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  ym: { type: String, required: true }, status: { type: String, enum: ['open', 'closing', 'closed'], default: 'open' },
  requestedById: { type: mongoose.Schema.Types.ObjectId, default: null }, requestedByName: { type: String, default: '' }, requestedAt: { type: Date, default: null }, checklist: { type: mongoose.Schema.Types.Mixed, default: null },
  closedById: { type: mongoose.Schema.Types.ObjectId, default: null }, closedByName: { type: String, default: '' }, closedAt: { type: Date, default: null }, sole: { type: Boolean, default: false },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },           // totals and a hash of the trial balance when the month closed
  history: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, ym: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('AcPeriod', schema);
