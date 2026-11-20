const mongoose = require('../lib/pgdoc');

// A student's appeal against a published grade. A reviewer other than the instructor decides; upholding it asks for a signed grade change.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  number: { type: String, default: '' },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegEnrollment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, default: '' },
  courseCode: { type: String, default: '' },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegTerm' },
  gradeAtFiling: { type: String, default: '' },
  reason: { type: String, required: true },
  status: { type: String, enum: ['submitted', 'under_review', 'upheld', 'rejected', 'withdrawn'], default: 'submitted' },
  activeKey: { type: String },                          // one open appeal per enrolment
  instructorNote: { type: String, default: '' },
  reviewerId: mongoose.Schema.Types.ObjectId, reviewerName: { type: String, default: '' },
  decision: { note: String, toGrade: String, byId: mongoose.Schema.Types.ObjectId, byName: String, at: Date, signature: String },
  events: [{ _id: false, at: Date, byName: String, what: String }],
}, { timestamps: true });
schema.index({ activeKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, studentId: 1 });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
module.exports = mongoose.model('RegAppeal', schema);
