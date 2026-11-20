const mongoose = require('../lib/pgdoc');

// A certificate for a reviewed completion (PRD E17). The snapshot, its hash and a signature let the public page say Valid, Altered or Withdrawn without showing anything private.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  serial: { type: String, required: true },
  verifyKey: { type: String, required: true },
  kind: { type: String, enum: ['course', 'specialization'], default: 'course' },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrLearner', required: true },
  learnerName: { type: String, default: '' },
  courseId: { type: mongoose.Schema.Types.ObjectId, default: null }, bundleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  entitlementId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  contentHash: { type: String, default: '' }, signature: { type: String, default: '' },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ['valid', 'revoked'], default: 'valid' },
  revokedReason: { type: String, default: '' }, revokedAt: { type: Date, default: null }, revokedByName: { type: String, default: '' },
  refundFlag: { type: Boolean, default: false },
  issuedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, serial: 1 }, { unique: true });
schema.index({ verifyKey: 1 }, { unique: true });
schema.index({ schoolId: 1, learnerId: 1 });
schema.index({ schoolId: 1, entitlementId: 1 });
module.exports = mongoose.model('TrCredential', schema);
