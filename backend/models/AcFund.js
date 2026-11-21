const mongoose = require('../lib/pgdoc');

// A fund in the ledger (PRD E23). Restricted and grant funds may be spent only on the accounts, within the dates and up to the amount they name.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, kind: { type: String, enum: ['unrestricted', 'restricted', 'grant'], default: 'unrestricted' },
  donor: { type: String, default: '' }, reference: { type: String, default: '' }, purpose: { type: String, default: '' },
  allowedCodes: [String], validFrom: { type: String, default: '' }, validTo: { type: String, default: '' }, ceiling: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'closed'], default: 'active' }, closeReason: { type: String, default: '' },
  pcFundId: { type: String },                                                     // the purchasing fund (E19) this one mirrors
  createdByName: { type: String, default: '' },
  history: [{ at: Date, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, name: 1 }, { unique: true });
schema.index({ schoolId: 1, pcFundId: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, kind: 1 });
module.exports = mongoose.model('AcFund', schema);
