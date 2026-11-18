const mongoose = require('../lib/pgdoc');
// Excused leave and mobility states (PRD E08, CAP-0371, CAP-0381). Transfer, internship, field trip and exam leave
// are kept apart from ordinary leave so reports never read them as truancy.
const { ObjectId } = mongoose.Schema.Types;
const KINDS = ['Medical', 'Family', 'Religious', 'Other', 'Exam', 'FieldTrip', 'Internship', 'Transfer'];
const MOBILITY = ['Exam', 'FieldTrip', 'Internship', 'Transfer'];
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  classId: { type: ObjectId, ref: 'Class' },
  kind: { type: String, enum: KINDS, required: true },
  state: { type: String, enum: ['Leave', 'Mobility'], default: 'Leave' },
  fromDate: { type: String, required: true }, toDate: { type: String, required: true },
  reason: { type: String, required: true }, evidenceUrl: { type: String, default: '' },
  status: { type: String, enum: ['Requested', 'Approved', 'Rejected', 'Cancelled'], default: 'Requested' },
  requestedBy: { type: ObjectId, required: true }, requestedByRole: { type: String, required: true },
  decidedBy: { type: ObjectId }, decidedByRole: { type: String }, decidedAt: { type: Date, default: null }, decisionNote: { type: String, default: '' },
  appliedDays: { type: Number, default: 0 },
}, { timestamps: true });
s.index({ schoolId: 1, status: 1, createdAt: -1 });
s.index({ studentId: 1, fromDate: 1 });
module.exports = mongoose.model('StudentLeave', s);
module.exports.KINDS = KINDS; module.exports.MOBILITY = MOBILITY;
