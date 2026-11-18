const mongoose = require('../lib/pgdoc');
// A signal that someone was somewhere (PRD E08, CAP-0374/0375/0376). Gate scans are evidence of entry only and never
// mark a lesson; a QR check-in waits for the instructor.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  kind: { type: String, enum: ['qr', 'gate', 'badge', 'biometric'], required: true },
  studentId: { type: ObjectId, ref: 'Student', default: null },
  sessionId: { type: ObjectId, ref: 'AttendanceSession', default: null },
  deviceId: { type: ObjectId, ref: 'AttendanceDevice', default: null },
  direction: { type: String, default: 'in' },
  occurredAt: { type: Date, required: true }, receivedAt: { type: Date, default: Date.now },
  driftSeconds: { type: Number, default: 0 },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Info'], default: 'Info' },
  flags: [String],
  clientKey: { type: String, default: '' }, // anti-sharing: the device/browser that submitted a QR check-in
  decidedBy: { type: ObjectId }, decidedAt: { type: Date, default: null }, note: { type: String, default: '' },
  badgeId: { type: String, default: '' },
}, { timestamps: true });
s.index({ schoolId: 1, sessionId: 1, status: 1 });
s.index({ schoolId: 1, studentId: 1, occurredAt: -1 });
s.index({ schoolId: 1, deviceId: 1, occurredAt: -1 });
s.index({ sessionId: 1, studentId: 1 }, { unique: true, sparse: true, partialFilterExpression: { kind: 'qr' } });
module.exports = mongoose.model('AttendanceEvidence', s);
