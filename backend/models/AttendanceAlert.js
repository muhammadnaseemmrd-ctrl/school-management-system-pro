const mongoose = require('../lib/pgdoc');
// A parent-facing attendance alert (PRD E08, CAP-0369). It is only sent after a person has verified the mark and the
// grace period has passed, and a correction inside the grace period cancels it before anyone is bothered.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  classId: { type: ObjectId, ref: 'Class' },
  date: { type: String, required: true }, // YYYY-MM-DD, school-local
  kind: { type: String, enum: ['Absent', 'Late', 'HalfDay'], required: true },
  detail: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Verified', 'Sent', 'Cancelled'], default: 'Pending' },
  dueAt: { type: Date, default: null }, // earliest moment it may be sent (verified time + grace)
  verifiedBy: { type: ObjectId }, verifiedByModel: { type: String, default: 'Teacher' }, verifiedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null }, cancelledReason: { type: String, default: '' },
  markedBy: { type: ObjectId },
}, { timestamps: true });
s.index({ studentId: 1, date: 1, kind: 1 }, { unique: true });
s.index({ schoolId: 1, status: 1, dueAt: 1 });
s.index({ schoolId: 1, classId: 1, date: -1 });
module.exports = mongoose.model('AttendanceAlert', s);
