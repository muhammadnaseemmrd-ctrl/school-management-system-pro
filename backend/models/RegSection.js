const mongoose = require('../lib/pgdoc');

// A course offered in a term, with an instructor and a seat limit.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegTerm', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegCourse', required: true },
  courseCode: { type: String, default: '' },
  courseTitle: { type: String, default: '' },
  credits: { type: Number, default: 0 },
  section: { type: String, default: 'A' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  teacherName: { type: String, default: '' },
  capacity: { type: Number, default: 40 },
  enrolled: { type: Number, default: 0 },
  schedule: { type: String, default: '' },
  room: { type: String, default: '' },
  status: { type: String, enum: ['open', 'closed', 'cancelled'], default: 'open' },
  gradesSubmittedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, termId: 1, courseId: 1, section: 1 }, { unique: true });
schema.index({ schoolId: 1, teacherId: 1, termId: 1 });
schema.index({ schoolId: 1, courseId: 1 });
module.exports = mongoose.model('RegSection', schema);
