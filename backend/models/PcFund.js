const mongoose = require('../lib/pgdoc');

// A pot of money with rules (PRD E19). General funds pay for anything the budget allows; restricted, grant and donor funds only for the categories and dates they name.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, kind: { type: String, enum: ['general', 'restricted', 'grant', 'donor'], default: 'general' },
  donor: { type: String, default: '' }, reference: { type: String, default: '' }, purpose: { type: String, default: '' },
  allowed: [String], validFrom: { type: Date, default: null }, validTo: { type: Date, default: null }, status: { type: String, enum: ['active', 'closed'], default: 'active' },
  received: { type: Number, default: 0 }, committed: { type: Number, default: 0 }, spent: { type: Number, default: 0 }, available: { type: Number, default: 0 },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, name: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, kind: 1 });
module.exports = mongoose.model('PcFund', schema);
