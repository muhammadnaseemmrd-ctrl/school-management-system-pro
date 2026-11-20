const mongoose = require('../lib/pgdoc');

// The right to open a course's paid content (PRD E17). Created only from a confirmed payment, a confirmed sponsorship, a free course or a written administrator grant.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrLearner', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  cohortId: { type: mongoose.Schema.Types.ObjectId, default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sponsorshipId: { type: mongoose.Schema.Types.ObjectId, default: null },
  bundleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  unlockAfter: { type: mongoose.Schema.Types.ObjectId, default: null },   // entitlement that must be complete first (learning path)
  source: { type: String, enum: ['payment', 'sponsor', 'free', 'comp'], default: 'payment' },
  status: { type: String, enum: ['active', 'paused', 'revoked'], default: 'active' },
  grantedAt: { type: Date, default: Date.now }, expiresAt: { type: Date, default: null },
  grantedByName: { type: String, default: '' }, reason: { type: String, default: '' },
  revokedAt: { type: Date, default: null }, revokedReason: { type: String, default: '' }, revokedByName: { type: String, default: '' },
  completion: { type: String, enum: ['none', 'ready', 'held', 'complete'], default: 'none' },
  completionNote: { type: String, default: '' }, completedAt: { type: Date, default: null }, reviewedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, learnerId: 1, courseId: 1 });
schema.index({ schoolId: 1, courseId: 1, status: 1 });
schema.index({ schoolId: 1, orderId: 1 });
schema.index({ schoolId: 1, completion: 1 });
module.exports = mongoose.model('TrEntitlement', schema);
