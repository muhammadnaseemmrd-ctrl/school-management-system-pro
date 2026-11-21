const mongoose = require('../lib/pgdoc');

// One account in the school's own general ledger (PRD E23). Separate from the platform ledger (E02).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true, trim: true }, name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['asset', 'liability', 'net_assets', 'income', 'expense'], required: true },
  group: { type: String, default: '' }, active: { type: Boolean, default: true },
  bank: { type: Boolean, default: false }, cash: { type: Boolean, default: false },   // cash and bank accounts feed the receipts and payments statement and reconciliation
  system: { type: Boolean, default: false }, note: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, kind: 1, active: 1 });
module.exports = mongoose.model('AcAccount', schema);
