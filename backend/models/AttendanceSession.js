const mongoose = require('../lib/pgdoc');
// One open classroom check-in (PRD E08, CAP-0374/0380). Students can only check in to an open session of their own
// class; the code rotates every few seconds and is signed with a secret that never leaves the server.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  classId: { type: ObjectId, ref: 'Class', required: true },
  subjectId: { type: ObjectId, ref: 'Subject', default: null },
  teacherId: { type: ObjectId, ref: 'Teacher', default: null },
  openedBy: { type: ObjectId }, openedByRole: { type: String },
  date: { type: String, required: true }, startTime: { type: String, default: '' }, endTime: { type: String, default: '' },
  secret: { type: String, required: true },
  windowSeconds: { type: Number, default: 30 },
  status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
  closedAt: { type: Date, default: null },
}, { timestamps: true });
s.index({ schoolId: 1, classId: 1, status: 1 });
s.index({ schoolId: 1, date: -1 });
module.exports = mongoose.model('AttendanceSession', s);
