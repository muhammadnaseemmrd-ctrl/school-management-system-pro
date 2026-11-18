const mongoose = require('../lib/pgdoc');
// Every change to a daily mark keeps what it replaced (PRD E08, CAP-0377). Append-only.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  date: { type: String, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  reason: { type: String, default: '' },
  source: { type: String, default: 'sheet' }, // sheet | admin | correction | leave | qr
  changedBy: { type: ObjectId }, changedByRole: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { versionKey: false });
s.index({ studentId: 1, date: 1, at: -1 });
s.index({ schoolId: 1, at: -1 });
module.exports = mongoose.model('AttendanceHistory', s);
