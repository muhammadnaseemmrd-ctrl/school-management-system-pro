const mongoose = require('../lib/pgdoc');

// An organisation that pays for its people to learn (PRD E17). Billing is allowed only after an administrator records the authority (contract or purchase order).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true },
  contactName: { type: String, default: '' }, email: { type: String, default: '' }, phone: { type: String, default: '' },
  authority: { type: String, default: '' },                         // e.g. contract or PO reference
  status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
  approvedBy: { type: String, default: '' }, approvedAt: { type: Date, default: null },
  reportKeyHash: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1 });
schema.index({ reportKeyHash: 1 });
module.exports = mongoose.model('TrSponsor', schema);
