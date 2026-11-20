const mongoose = require('../lib/pgdoc');
// A web address a school uses for sign-in (PRD E27 custom domain wizard). Pending -> Verified (TXT record) -> Active (routing checked).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, host: { type: String, required: true, lowercase: true, trim: true },
  kind: { type: String, enum: ['subdomain', 'custom'], default: 'custom' },
  status: { type: String, enum: ['Pending', 'Verified', 'Active', 'Failed', 'Removed'], default: 'Pending' },
  token: { type: String, default: '' }, verifiedAt: { type: Date }, activatedAt: { type: Date }, lastCheckedAt: { type: Date }, lastError: { type: String, default: '' },
  checks: { type: Number, default: 0 }, windowStart: { type: Date }, windowCount: { type: Number, default: 0 }, addedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1 });
schema.index({ host: 1, status: 1 });
module.exports = mongoose.model('SchoolDomain', schema);
