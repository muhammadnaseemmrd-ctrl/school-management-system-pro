const mongoose = require('../lib/pgdoc');
// What a student or guardian has agreed to for attendance tools (PRD E08, CAP-0380/0382). One row per student.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  selfCheckIn: { type: Boolean, default: false }, selfCheckInAt: { type: Date, default: null },
  biometricOptOut: { type: Boolean, default: false }, biometricOptOutAt: { type: Date, default: null },
  updatedBy: { type: ObjectId }, updatedByRole: { type: String, default: '' },
}, { timestamps: true });
s.index({ schoolId: 1, studentId: 1 }, { unique: true });
module.exports = mongoose.model('AttendanceConsent', s);
