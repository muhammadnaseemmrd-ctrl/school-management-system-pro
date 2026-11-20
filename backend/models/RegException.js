const mongoose = require('../lib/pgdoc');

// An advisor's request to bend a rule for one student, decided by a registrar who is not the requester and signed (PRD E16 "signed exceptions").
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, default: '' },
  kind: { type: String, enum: ['prereq_waiver', 'substitution', 'requirement_waiver', 'overload', 'extra_attempt', 'catalog_switch'], required: true },
  courseCode: { type: String, default: '' },            // prereq_waiver, extra_attempt: the course; substitution: the required course
  substituteCode: { type: String, default: '' },
  groupKey: { type: String, default: '' },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegTerm' },
  maxCredits: { type: Number, default: 0 },
  versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegProgramVersion' },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn', 'used'], default: 'pending' },
  requestedById: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' }, requestedByRole: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
  signature: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, kind: 1, courseCode: 1 });
module.exports = mongoose.model('RegException', schema);
