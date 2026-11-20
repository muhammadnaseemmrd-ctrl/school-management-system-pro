const mongoose = require('../lib/pgdoc');

// A message on a course's discussion board (PRD E17). Staff can hide a post with a reason; boards for younger learners hold every post until an instructor approves it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  lessonId: { type: String, default: '' },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  authorKind: { type: String, enum: ['learner', 'staff'], default: 'learner' },
  learnerId: { type: mongoose.Schema.Types.ObjectId, default: null },
  authorName: { type: String, default: '' },
  body: { type: String, required: true },
  status: { type: String, enum: ['visible', 'held', 'hidden'], default: 'visible' },
  reports: [{ _id: false, learnerId: mongoose.Schema.Types.ObjectId, at: Date, reason: String }],
  reportCount: { type: Number, default: 0 },
  hiddenReason: { type: String, default: '' }, decidedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, courseId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, learnerId: 1, createdAt: -1 });
schema.index({ schoolId: 1, status: 1, reportCount: 1 });
module.exports = mongoose.model('TrPost', schema);
