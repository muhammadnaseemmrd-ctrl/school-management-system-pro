const mongoose = require('../lib/pgdoc');
// A teacher's draft, written offline or online (PRD E11). `localId` is made on the device so the same draft is never created twice.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, required: true }, teacherId: { type: ObjectId, required: true }, localId: { type: String, required: true },
  kind: { type: String, enum: ['homework', 'lessonNote', 'reminder'], required: true },
  title: { type: String, default: '' }, body: { type: String, default: '' },
  classId: { type: ObjectId, default: null }, subjectId: { type: ObjectId, default: null }, date: { type: String, default: '' }, dueDate: { type: String, default: '' },
  status: { type: String, enum: ['Draft', 'Published', 'Discarded'], default: 'Draft' },
  revision: { type: Number, default: 1 }, lastDeviceId: { type: String, default: '' }, publishedRef: { type: ObjectId, default: null }, publishedAt: { type: Date, default: null },
}, { timestamps: true });
s.index({ schoolId: 1, teacherId: 1, localId: 1 }, { unique: true });
s.index({ schoolId: 1, teacherId: 1, status: 1, updatedAt: -1 });
s.index({ schoolId: 1, classId: 1, date: 1 });
module.exports = mongoose.model('TeacherDraft', s);
