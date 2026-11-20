const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, ptmId: { type: mongoose.Schema.Types.ObjectId, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, required: true }, teacherName: { type: String, default: '' },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  state: { type: String, enum: ['Free', 'Booked', 'Blocked', 'Done', 'NoShow', 'Cancelled'], default: 'Free' },
  studentId: { type: mongoose.Schema.Types.ObjectId, default: null }, studentName: { type: String, default: '' },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null }, parentName: { type: String, default: '' },
  bookedAt: Date, parentNote: { type: String, default: '' }, teacherNote: { type: String, default: '' }, summary: { type: String, default: '' },
  cancelledBy: { type: String, default: '' }, cancelWhy: { type: String, default: '' }, remindedAt: Date, link: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, ptmId: 1, teacherId: 1, startsAt: 1 }, { unique: true });
schema.index({ schoolId: 1, ptmId: 1, parentId: 1, startsAt: 1 });
schema.index({ schoolId: 1, parentId: 1, startsAt: 1 });
schema.index({ schoolId: 1, state: 1, startsAt: 1 });
module.exports = mongoose.model('CmPtmSlot', schema);
