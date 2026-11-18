const mongoose = require('../lib/pgdoc');
// One lesson that needs someone to cover it while the usual teacher is away.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  leaveId: { type: mongoose.Schema.Types.ObjectId }, absentTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  coverTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  date: { type: String, required: true }, classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, startTime: String, endTime: String, subjectId: { type: mongoose.Schema.Types.ObjectId },
  status: { type: String, enum: ['Needed', 'Proposed', 'Assigned', 'Cancelled'], default: 'Needed' }, assignedByName: { type: String, default: '' },
  // E10: cover that is not tied to leave, and the proposal that must be approved by a different administrator
  source: { type: String, enum: ['leave', 'adhoc', 'swap'], default: 'leave' }, reason: { type: String, default: '' }, createdByName: { type: String, default: '' },
  proposedTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }, proposedByName: { type: String, default: '' }, proposedById: { type: mongoose.Schema.Types.ObjectId },
  swapId: { type: mongoose.Schema.Types.ObjectId }, response: { type: String, enum: ['', 'Accepted', 'Declined'], default: '' }, responseNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, date: 1, status: 1 });
schema.index({ schoolId: 1, coverTeacherId: 1, date: 1 });
schema.index({ schoolId: 1, leaveId: 1 });
module.exports = mongoose.model('CoverAssignment', schema);
