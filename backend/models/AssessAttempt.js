const mongoose = require('../lib/pgdoc');
// One student's go at an assessment. The variant is stored and can be rebuilt from the seed, so an appeal can show what the student saw.
const MARKER = { by: mongoose.Schema.Types.ObjectId, byName: String, byRole: String, score: Number, criteria: [{ id: String, points: Number }], comment: String, at: Date };
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  attemptNo: { type: Number, default: 1 },
  status: { type: String, enum: ['InProgress', 'Submitted', 'Marking', 'Graded', 'Voided'], default: 'InProgress' },
  seed: String, variantHash: String, variant: mongoose.Schema.Types.Mixed,
  startedAt: Date, dueAt: Date, extraTimePct: { type: Number, default: 0 }, access: mongoose.Schema.Types.Mixed,
  identity: { method: String, ok: Boolean, at: Date },
  answers: mongoose.Schema.Types.Mixed, lastSeq: { type: Number, default: 0 }, lastSavedAt: Date, saves: [{ seq: Number, at: Date, hash: String }],
  submittedAt: Date, submitMethod: { type: String, enum: ['', 'student', 'timeout', 'teacher'], default: '' }, lateByNetwork: { type: Boolean, default: false },
  items: [{ ref: mongoose.Schema.Types.ObjectId, itemKey: String, kind: String, max: Number, auto: Number, needsReview: Boolean, state: { type: String, default: 'Auto' }, m1: MARKER, m2: MARKER, mod: MARKER, final: Number }],
  total: { type: Number, default: 0 }, max: { type: Number, default: 0 }, pct: { type: Number, default: 0 }, passed: { type: Boolean, default: false },
  resultVersion: { type: Number, default: 1 }, signature: String, signedAt: Date,
  incidents: [{ note: String, severity: String, by: mongoose.Schema.Types.ObjectId, byName: String, at: Date }],
  focus: [{ at: Date, kind: String }],
  history: [{ at: Date, by: mongoose.Schema.Types.ObjectId, byName: String, action: String, detail: String }],
  voidReason: String, countsAsAttempt: { type: Boolean, default: true },
  failedIdentity: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, assessmentId: 1, studentId: 1, attemptNo: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, assessmentId: 1, status: 1 });
module.exports = mongoose.model('AssessAttempt', schema);
