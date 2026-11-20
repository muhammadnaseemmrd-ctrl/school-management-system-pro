const mongoose = require('../lib/pgdoc');
// One child's day: who handed them over, when, and who collected them (CAP-0270). The sign-off is kept exactly as given.
const person = { name: { type: String, default: '' }, relationship: { type: String, default: '' }, parentId: mongoose.Schema.Types.ObjectId, basis: { type: String, default: '' }, idChecked: { type: Boolean, default: false } };
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, required: true }, day: { type: String, required: true },
  status: { type: String, enum: ['In', 'Out', 'Absent'], required: true },
  inAt: Date, inBy: person, inStaffName: { type: String, default: '' }, inNote: { type: String, default: '' }, inFlag: { type: String, default: '' },
  outAt: Date, outTo: person, outStaffName: { type: String, default: '' }, outNote: { type: String, default: '' },
  absentReason: { type: String, default: '' }, absentById: mongoose.Schema.Types.ObjectId,
  refusals: { type: Number, default: 0 },
  history: [{ at: Date, action: String, byName: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1, day: 1 }, { unique: true });
schema.index({ schoolId: 1, roomId: 1, day: 1, status: 1 });
module.exports = mongoose.model('EyDay', schema);
