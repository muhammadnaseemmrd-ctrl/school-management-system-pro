const mongoose = require('../lib/pgdoc');
// An immutable copy of the whole school timetable taken when it was published.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  number: { type: Number, required: true }, note: { type: String, default: '' }, effectiveFrom: { type: String, default: '' },
  publishedByName: { type: String, default: '' }, publishedAt: { type: Date, default: Date.now },
  snapshot: { type: Array, default: [] }, // [{ classId, dayOfWeek, slots: [{ s, e, sub, t, room, b, bn }] }]
  summary: { type: Object, default: {} },  // { classes, periods, changedClasses, changedTeachers, notified }
  changes: { type: Array, default: [] },   // [{ classId, label, added, removed }]
  restoredFrom: { type: Number },
}, { timestamps: true });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
module.exports = mongoose.model('TimetableVersion', schema);
