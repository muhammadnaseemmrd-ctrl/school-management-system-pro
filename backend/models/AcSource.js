const mongoose = require('../lib/pgdoc');

// What has already been posted to the ledger for one source record (an invoice, a payment, a pay run, a bill, a sale) (PRD E23).
// The ledger always shows the source's latest figures: a change posts only the difference, so every figure traces back to its record.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  key: { type: String, required: true }, kind: { type: String, default: '' }, refId: { type: String, default: '' }, refNo: { type: String, default: '' },
  net: { type: mongoose.Schema.Types.Mixed, default: {} }, rev: { type: Number, default: 0 }, lastJournalNo: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, key: 1 }, { unique: true });
schema.index({ schoolId: 1, kind: 1, refId: 1 });
module.exports = mongoose.model('AcSource', schema);
