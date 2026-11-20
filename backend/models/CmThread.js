const mongoose = require('../lib/pgdoc');
// A conversation between one parent and one teacher (or the school office) about one child (PRD E20: MessageThread).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tkey: { type: String, required: true }, // studentId:parentId:teacherId|office, one thread per pair
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  parentId: { type: mongoose.Schema.Types.ObjectId, required: true }, parentName: { type: String, default: '' },
  staffKind: { type: String, enum: ['teacher', 'office'], required: true }, teacherId: { type: mongoose.Schema.Types.ObjectId, default: null }, teacherName: { type: String, default: '' },
  subject: { type: String, default: '' }, status: { type: String, enum: ['open', 'closed'], default: 'open' },
  lastAt: { type: Date, default: Date.now }, lastPreview: { type: String, default: '' }, lastFrom: { type: String, default: '' }, messages: { type: Number, default: 0 },
  parentReadAt: { type: Date, default: null }, staffReadAt: { type: Date, default: null }, // staffReadAt is for the named teacher, or for the office as a whole
  waitingOn: { type: String, enum: ['', 'school', 'family'], default: '' }, replyDueAt: { type: Date, default: null }, overdueAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, tkey: 1 }, { unique: true });
schema.index({ schoolId: 1, parentId: 1, lastAt: -1 });
schema.index({ schoolId: 1, teacherId: 1, lastAt: -1 });
schema.index({ schoolId: 1, staffKind: 1, lastAt: -1 });
schema.index({ schoolId: 1, waitingOn: 1, replyDueAt: 1 });
module.exports = mongoose.model('CmThread', schema);
