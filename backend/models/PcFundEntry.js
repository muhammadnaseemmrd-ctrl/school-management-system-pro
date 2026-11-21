const mongoose = require('../lib/pgdoc');

// Every change to a fund, forever (PRD E19). A mistake is put right by another entry.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, fundId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['receipt', 'commit', 'release', 'spend', 'refund', 'adjust'], required: true },
  amount: { type: Number, required: true }, delta: { type: Number, default: 0 },
  refType: { type: String, default: '' }, refId: { type: mongoose.Schema.Types.ObjectId, default: null }, refNo: { type: String, default: '' }, note: { type: String, default: '' },
  balanceAfter: { type: Number, default: 0 }, byId: { type: mongoose.Schema.Types.ObjectId, default: null }, byName: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ schoolId: 1, fundId: 1, createdAt: -1 });
module.exports = mongoose.model('PcFundEntry', schema);
