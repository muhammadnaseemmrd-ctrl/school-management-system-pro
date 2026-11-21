const mongoose = require('../lib/pgdoc');

// Desk actions sent from a kiosk that may have been offline (PRD E18). The client key makes sending them twice harmless.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  ckey: { type: String, required: true },      // school + client key
  op: { type: String, default: '' }, capturedAt: { type: Date, default: null }, ok: { type: Boolean, default: false }, result: { type: mongoose.Schema.Types.Mixed, default: null },
  byName: { type: String, default: '' }, late: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ ckey: 1 }, { unique: true });
schema.index({ schoolId: 1, createdAt: -1 });
module.exports = mongoose.model('LbOp', schema);
