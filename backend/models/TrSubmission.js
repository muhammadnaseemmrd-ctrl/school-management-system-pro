const mongoose = require('../lib/pgdoc');

// Work handed in for a practical or capstone lesson, with the rubric scores of each review (PRD E17).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrLearner', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  lessonId: { type: String, required: true },
  lessonTitle: { type: String, default: '' }, learnerName: { type: String, default: '' }, courseTitle: { type: String, default: '' },
  attempt: { type: Number, default: 1 },
  text: { type: String, default: '' }, link: { type: String, default: '' },
  status: { type: String, enum: ['submitted', 'returned', 'accepted'], default: 'submitted' },
  scores: { type: mongoose.Schema.Types.Mixed, default: null }, percent: { type: Number, default: null },
  feedback: { type: String, default: '' }, reviewedByName: { type: String, default: '' }, reviewedAt: { type: Date, default: null },
  extraAttempts: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, learnerId: 1, courseId: 1, lessonId: 1, attempt: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: 1 });
schema.index({ schoolId: 1, courseId: 1, status: 1 });
module.exports = mongoose.model('TrSubmission', schema);
