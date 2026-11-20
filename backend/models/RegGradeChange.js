const mongoose = require('../lib/pgdoc');

// A change to a published grade. Whoever asks cannot approve; the approval is signed and the old grade is kept.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegEnrollment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  courseCode: { type: String, default: '' },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegTerm' },
  fromGrade: { type: String, default: '' },
  toGrade: { type: String, required: true },
  reason: { type: String, required: true },
  source: { type: String, enum: ['correction', 'appeal', 'incomplete'], default: 'correction' },
  appealId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegAppeal' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending' },
  requestedById: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' }, requestedByRole: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' }, sole: { type: Boolean, default: false },
  signature: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, enrollmentId: 1 });
schema.index({ schoolId: 1, studentId: 1 });
module.exports = mongoose.model('RegGradeChange', schema);
