const mongoose = require('../lib/pgdoc');
// One attempt to collect a child, and what the school decided (PRD E09, CAP-0077/0153/0154). Never edited, never deleted.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  day: { type: String, required: true },
  at: { type: Date, default: Date.now },
  collectorName: { type: String, default: '' }, collectorParentId: mongoose.Schema.Types.ObjectId, relationship: { type: String, default: '' }, collectorPhone: { type: String, default: '' },
  basis: { type: String, enum: ['guardian', 'authorisation', 'exception', 'emergency-override', 'none'], default: 'none' },
  authorizationId: mongoose.Schema.Types.ObjectId,
  outcome: { type: String, enum: ['Released', 'Refused', 'Pending', 'Declined'], required: true },
  refusedCode: { type: String, default: '' },     // internal, never shown at the gate
  reason: { type: String, default: '' },
  familyConfirmedWith: { type: String, default: '' },
  absentOverride: { type: Boolean, default: false },
  gate: { type: String, default: 'Main gate' },
  requestedById: mongoose.Schema.Types.ObjectId, requestedByRole: { type: String, default: '' }, requestedByName: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  releasedById: mongoose.Schema.Types.ObjectId, releasedByName: { type: String, default: '' },
  reviewState: { type: String, enum: ['', 'NeedsReview', 'Reviewed'], default: '' },
  reviewedById: mongoose.Schema.Types.ObjectId, reviewedByName: { type: String, default: '' }, reviewedAt: Date, reviewNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, at: -1 });
schema.index({ schoolId: 1, studentId: 1, at: -1 });
schema.index({ schoolId: 1, day: 1, outcome: 1 });
schema.index({ schoolId: 1, outcome: 1, basis: 1, at: -1 });
schema.index({ schoolId: 1, reviewState: 1 });
module.exports = mongoose.model('PickupEvent', schema);
