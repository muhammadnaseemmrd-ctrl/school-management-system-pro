const mongoose = require('../lib/pgdoc');

// A student's place in a programme, bound to one catalogue year. Switching year needs a signed exception.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, default: '' },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegProgram', required: true },
  programName: { type: String, default: '' },
  versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegProgramVersion', required: true },
  catalogYear: { type: String, default: '' },
  advisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  advisorName: { type: String, default: '' },
  status: { type: String, enum: ['active', 'graduated', 'withdrawn', 'suspended'], default: 'active' },
  isCurrent: { type: Boolean, default: true },
  currentKey: { type: String },                         // one active programme per student
  startedAt: { type: String, default: '' },
  graduation: { at: Date, byName: String, byId: mongoose.Schema.Types.ObjectId, cgpa: Number, credits: Number, auditHash: String, exceptionIds: [mongoose.Schema.Types.ObjectId] },
  history: [{ _id: false, at: Date, byName: String, change: String }],
}, { timestamps: true });
schema.index({ currentKey: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, programId: 1, status: 1 });
schema.index({ schoolId: 1, advisorId: 1, status: 1 });
module.exports = mongoose.model('RegStudentProgram', schema);
