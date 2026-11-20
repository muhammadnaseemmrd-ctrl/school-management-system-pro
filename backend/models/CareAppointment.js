const mongoose = require('../lib/pgdoc');
// A counselling, sick bay, mentoring or parent meeting slot (PRD E21: CounselAppointment).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  kind: { type: String, enum: ['counselling', 'nurse', 'mentor', 'parent-meeting'], required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, default: null }, staffName: { type: String, default: '' },
  at: { type: Date, default: null }, durationMin: { type: Number, default: 30 }, room: { type: String, default: '' },
  status: { type: String, enum: ['Requested', 'Booked', 'Done', 'Missed', 'Cancelled'], default: 'Requested' },
  requestedByRole: { type: String, default: '' }, reasonLine: { type: String, default: '' }, caseId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, at: -1 });
schema.index({ schoolId: 1, staffId: 1, at: 1 });
schema.index({ schoolId: 1, status: 1, at: 1 });
module.exports = mongoose.model('CareAppointment', schema);
