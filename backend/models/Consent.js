const mongoose = require('../lib/pgdoc');

// Consent register (PRD E01 Consent). Append-only: giving, renewing or withdrawing consent adds a row and never edits an old one,
// so the school can always show what was agreed, when, on which wording, and who said so.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  subjectType: { type: String, enum: ['student', 'parent', 'teacher'], required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  subjectName: { type: String, default: '' },
  purpose: { type: String, required: true },
  version: { type: String, default: '' },                  // the wording or policy version the person agreed to
  status: { type: String, enum: ['granted', 'withdrawn'], required: true },
  givenByName: { type: String, default: '' },              // who agreed (a parent for a child, or the person themselves)
  givenByRelation: { type: String, default: '' },
  method: { type: String, enum: ['portal', 'paper', 'in-person', 'phone'], default: 'portal' },
  evidenceNote: { type: String, default: '' },             // for example the form serial or what was said
  expiresAt: { type: Date, default: null },
  reason: { type: String, default: '' },                   // why it was withdrawn
  recordedById: { type: mongoose.Schema.Types.ObjectId },
  recordedByName: { type: String, default: '' },
  recordedByRole: { type: String, default: '' },
  // set only on the newest row of a subject and purpose; removed when a newer row replaces it
  currentKey: { type: String },
  isCurrent: { type: Boolean, default: true },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },   // campus of the child when this was recorded (E01 scope)
  supersededAt: Date,
}, { timestamps: true });

schema.index({ currentKey: 1 }, { unique: true });
schema.index({ schoolId: 1, subjectType: 1, subjectId: 1, purpose: 1, createdAt: -1 });
schema.index({ schoolId: 1, purpose: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, isCurrent: 1, purpose: 1, status: 1 });
schema.index({ schoolId: 1, campusId: 1, isCurrent: 1 });
schema.index({ schoolId: 1, createdAt: -1 });
schema.index({ schoolId: 1, expiresAt: 1 });

module.exports = mongoose.model('Consent', schema);
