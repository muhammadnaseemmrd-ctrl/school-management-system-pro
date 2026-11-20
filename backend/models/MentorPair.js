const mongoose = require('../lib/pgdoc');
// A mentor and the student they support (PRD E21: MentorPair).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  mentorId: { type: mongoose.Schema.Types.ObjectId, required: true }, mentorName: { type: String, default: '' }, focus: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Ended'], default: 'Active' }, startedOn: { type: String, default: '' }, endedOn: { type: String, default: '' },
  meetings: [{ at: { type: Date, default: Date.now }, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, mentorId: 1, status: 1 });
module.exports = mongoose.model('MentorPair', schema);
