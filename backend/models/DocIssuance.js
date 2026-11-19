const mongoose = require('../lib/pgdoc');
// One official document given to one person (PRD E12, CAP-0424/0431/0436). The snapshot is everything the printed page was
// made from, so it can be printed again later exactly as it was. Nothing in it changes; a mistake is revoked and reissued.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  serial: { type: String, required: true },
  token: { type: String, required: true },                          // opaque random reference printed in the QR code, holds no personal data
  family: { type: String, required: true },
  kind: { type: String, default: '' },
  title: { type: String, default: '' },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocTemplate', required: true },
  versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocTemplateVersion', required: true },
  versionNo: { type: Number, default: 1 },
  subjectType: { type: String, enum: ['student', 'teacher', 'visitor', 'invoice', 'payment', 'custom'], default: 'student' },
  subjectId: { type: mongoose.Schema.Types.ObjectId },
  subjectName: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, default: null },     // the learner a document is about, for family access
  paper: { key: { type: String, default: '' }, orientation: { type: String, default: 'portrait' }, w: { type: Number, default: 0 }, h: { type: Number, default: 0 } },
  holderPublic: { type: String, default: '' },                      // masked name shown on the public check page
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },  // { values, layout, theme, locale, verifyUrl }
  contentHash: { type: String, required: true },
  status: { type: String, enum: ['Issued', 'Revoked', 'Superseded'], default: 'Issued' },
  issuedAt: { type: Date, default: Date.now },
  validUntil: Date,
  issuedById: mongoose.Schema.Types.ObjectId, issuedByName: { type: String, default: '' }, issuedByRole: { type: String, default: '' },
  revokedAt: Date, revokedById: mongoose.Schema.Types.ObjectId, revokedByName: { type: String, default: '' }, revokeReason: { type: String, default: '' },
  replacedById: mongoose.Schema.Types.ObjectId, replacesId: mongoose.Schema.Types.ObjectId, replaceReason: { type: String, default: '' },
  printCount: { type: Number, default: 0 }, lastPrintedAt: Date,
  lastCheckedAt: Date,
  batchId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });
schema.index({ schoolId: 1, serial: 1 }, { unique: true });
schema.index({ token: 1 }, { unique: true });
schema.index({ schoolId: 1, family: 1, subjectId: 1, status: 1 });
schema.index({ schoolId: 1, subjectId: 1, issuedAt: -1 });
schema.index({ schoolId: 1, status: 1, issuedAt: -1 });
schema.index({ schoolId: 1, studentId: 1, status: 1, issuedAt: -1 });
module.exports = mongoose.model('DocIssuance', schema);
