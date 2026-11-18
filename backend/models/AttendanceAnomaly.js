const mongoose = require('../lib/pgdoc');
// Something that looks wrong and needs a person to look (PRD E08, CAP-0379). The system never changes a mark by itself.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  key: { type: String, required: true }, // dedupe: the same finding is not raised twice
  date: { type: String, required: true },
  kind: { type: String, enum: ['MissingRollCall', 'EveryonePresent', 'PresentOnLeave', 'AbsentButAtGate', 'PresentNoGateEntry', 'PeriodClash', 'DeviceDrift', 'DeviceSilent'], required: true },
  classId: { type: ObjectId, ref: 'Class', default: null }, studentId: { type: ObjectId, ref: 'Student', default: null }, deviceId: { type: ObjectId, default: null },
  detail: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'Reviewed', 'Dismissed'], default: 'Open' },
  reviewedBy: { type: ObjectId }, reviewedAt: { type: Date, default: null }, note: { type: String, default: '' },
}, { timestamps: true });
s.index({ schoolId: 1, key: 1 }, { unique: true });
s.index({ schoolId: 1, status: 1, date: -1 });
module.exports = mongoose.model('AttendanceAnomaly', s);
