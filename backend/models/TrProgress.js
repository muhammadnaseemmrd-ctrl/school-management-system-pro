const mongoose = require('../lib/pgdoc');

// A learner's place in a course (PRD E17). Each lesson keeps its own evidence: active seconds counted by the server, check answers and the time it was finished.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrLearner', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  lessons: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },   // lessonId -> { active, lastBeat, passed, best, done, doneAt, pos }
  lastLessonId: { type: String, default: '' },
  lastAt: { type: Date, default: null },
  rev: { type: Number, default: 0 },                              // lessons are rewritten as a whole, so each write is a compare-and-set on this counter
}, { timestamps: true });
schema.index({ schoolId: 1, learnerId: 1, courseId: 1 }, { unique: true });
schema.index({ schoolId: 1, courseId: 1 });
module.exports = mongoose.model('TrProgress', schema);
