const mongoose = require('../lib/pgdoc');
// Supportive follow-up for repeated absence (PRD E08, CAP-0370). Opened by a threshold, worked by a person.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  classId: { type: ObjectId, ref: 'Class' },
  status: { type: String, enum: ['Open', 'InProgress', 'Resolved'], default: 'Open' },
  trigger: { absences: Number, windowDays: Number, from: String, to: String },
  assignedTo: { type: ObjectId }, assignedRole: { type: String, default: '' },
  notes: [{ at: { type: Date, default: Date.now }, by: ObjectId, byRole: String, text: String }],
  outcome: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });
s.index({ schoolId: 1, status: 1, createdAt: -1 });
s.index({ studentId: 1, status: 1 });
module.exports = mongoose.model('AttendanceCase', s);
