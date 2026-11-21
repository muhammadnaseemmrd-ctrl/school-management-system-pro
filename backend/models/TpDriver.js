const mongoose = require('../lib/pgdoc');

// A driver (PRD E22). Drivers do not get a school login: each has a private key kept only as a hash, shown once, that opens the driver page for the trips given to them.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, phone: { type: String, default: '' }, phoneKey: { type: String },
  licenceLast4: { type: String, default: '' }, licenceExpiry: { type: String, default: '' },
  status: { type: String, enum: ['active', 'suspended', 'ended'], default: 'active' },
  keyHash: { type: String }, keySetAt: { type: Date, default: null }, lastSeenAt: { type: Date, default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, phoneKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('TpDriver', schema);
