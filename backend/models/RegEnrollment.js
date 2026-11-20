const mongoose = require('../lib/pgdoc');

// One student in one section. The grade, its credits and whether it counts toward the average are fixed when the term's grades are published.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegSection', required: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegTerm', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegCourse', required: true },
  courseCode: { type: String, default: '' },
  courseTitle: { type: String, default: '' },
  credits: { type: Number, default: 0 },
  status: { type: String, enum: ['enrolled', 'dropped', 'withdrawn', 'completed'], default: 'enrolled' },
  activeKey: { type: String },                          // one live enrolment per student, course and term
  grade: { type: String, default: '' },                 // draft grade the instructor entered, or the final grade once published
  gradeState: { type: String, enum: ['none', 'draft', 'submitted', 'final'], default: 'none' },
  gradedByName: { type: String, default: '' },
  gradeVersion: { type: Number, default: 0 },
  attemptNo: { type: Number, default: 1 },
  isRepeat: { type: Boolean, default: false },
  prereqOverride: { type: mongoose.Schema.Types.ObjectId, ref: 'RegException' },
  enrolledByName: { type: String, default: '' },
  droppedAt: Date,
}, { timestamps: true });
schema.index({ activeKey: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, sectionId: 1, status: 1 });
schema.index({ schoolId: 1, termId: 1, studentId: 1 });
schema.index({ schoolId: 1, courseId: 1, studentId: 1 });
module.exports = mongoose.model('RegEnrollment', schema);
