const mongoose = require('../lib/pgdoc');
// Two teachers exchange one lesson each on one date. Nothing changes until an administrator approves.
const lesson = { classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, subjectId: { type: mongoose.Schema.Types.ObjectId }, startTime: String, endTime: String, room: String };
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  date: { type: String, required: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true }, peerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  requesterLesson: lesson, peerLesson: lesson, reason: { type: String, default: '' },
  status: { type: String, enum: ['Requested', 'PeerAccepted', 'Approved', 'Declined', 'Cancelled'], default: 'Requested' },
  peerNote: { type: String, default: '' }, decidedByName: { type: String, default: '' }, decisionNote: { type: String, default: '' }, decidedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, date: 1 });
schema.index({ schoolId: 1, requesterId: 1 }); schema.index({ schoolId: 1, peerId: 1 });
module.exports = mongoose.model('TimetableSwap', schema);
