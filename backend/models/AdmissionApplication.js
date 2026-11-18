const mongoose = require('../lib/pgdoc');

// One child applying for one grade in one academic year. Stage changes are kept as history, never overwritten.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  inquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdmissionInquiry', required: true },   // every application has exactly one source
  academicYear: { type: String, required: true },
  gradeSought: { type: String, required: true, trim: true },
  child: { name: { type: String, required: true, trim: true }, dateOfBirth: Date, gender: { type: String, default: '' }, previousSchool: { type: String, default: '' } },
  guardian: { name: { type: String, default: '' }, relationship: { type: String, default: 'Guardian' }, phone: { type: String, default: '' }, email: { type: String, default: '', lowercase: true } },
  stage: { type: String, default: 'New' },
  stageHistory: [{ stage: String, at: { type: Date, default: Date.now }, byName: String, note: String }],
  checklist: [{ key: String, label: String, required: { type: Boolean, default: true }, dueOn: Date, verifiedAt: Date, verifiedByName: String }],
  interviewAt: { type: Date, default: null },
  interviewNote: { type: String, default: '' },
  decisionNote: { type: String, default: '' },
  seatReserved: { type: Boolean, default: false },       // true while Offered, Accepted or Enrolled
  waitlistedAt: { type: Date, default: null },
  queueSkipReason: { type: String, default: '' },
  nextFollowUpOn: { type: Date, default: null },
  duplicateFlags: [{ kind: String, refId: String, refName: String, reason: String, resolution: { type: String, default: 'pending' }, resolvedByName: String, resolvedAt: Date, note: String }],
  mergedIntoId: { type: mongoose.Schema.Types.ObjectId, default: null },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  admissionNumber: { type: String, default: '' },
  enrolledAt: { type: Date, default: null },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, stage: 1, createdAt: -1 });
schema.index({ schoolId: 1, academicYear: 1, gradeSought: 1, stage: 1 });
schema.index({ schoolId: 1, inquiryId: 1 });
schema.index({ schoolId: 1, studentId: 1 });
schema.index({ schoolId: 1, 'guardian.phone': 1 });
schema.index({ schoolId: 1, nextFollowUpOn: 1 });

module.exports = mongoose.model('AdmissionApplication', schema);
