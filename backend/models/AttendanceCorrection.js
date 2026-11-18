const mongoose = require('../lib/pgdoc');
// A request to change a day's attendance (PRD E08, CAP-0377). The original is copied onto the request and into the
// history when it is applied; the person who decides is never the person who asked.
const { ObjectId } = mongoose.Schema.Types;
const snap = { status: String, leftAt: { type: String, default: null }, arrivedAt: { type: String, default: null }, remarks: { type: String, default: '' } };
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  classId: { type: ObjectId, ref: 'Class' },
  date: { type: String, required: true },
  original: snap, requested: snap,
  reason: { type: String, required: true },
  status: { type: String, enum: ['Requested', 'Approved', 'Rejected'], default: 'Requested' },
  requestedBy: { type: ObjectId, required: true }, requestedByRole: { type: String, required: true },
  decidedBy: { type: ObjectId }, decidedByRole: { type: String }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' },
}, { timestamps: true });
s.index({ schoolId: 1, status: 1, createdAt: -1 });
s.index({ studentId: 1, date: 1 });
module.exports = mongoose.model('AttendanceCorrection', s);
