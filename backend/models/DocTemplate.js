const mongoose = require('../lib/pgdoc');
// A document design (PRD E12, CAP-0421..0438). The design itself lives in DocTemplateVersion; this row is the name,
// the family and which version is live. Base templates are Aulensia originals: read-only, copied to be changed.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  key: { type: String, required: true },                       // stable slug, unique per school
  name: { type: String, required: true, trim: true },
  family: { type: String, required: true, enum: ['idCard', 'staffBadge', 'visitorPass', 'reportCard', 'transcript', 'certificate', 'challan', 'invoice', 'receipt', 'letterhead', 'libraryCard', 'letter'] },
  kind: { type: String, default: '' },                         // certificate family: completion | merit | appreciation | transfer | character | conduct
  paper: { type: String, enum: ['A4', 'A5', 'ID-1', 'Badge', 'Receipt'], default: 'A4' },
  description: { type: String, default: '' },
  isBase: { type: Boolean, default: false },
  provenance: { source: { type: String, default: 'school' }, author: { type: String, default: '' }, license: { type: String, default: '' }, importedFrom: { type: String, default: '' } },
  liveVersionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  liveVersion: { type: Number, default: 0 },
  latestVersion: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
  basedOnKey: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, key: 1 }, { unique: true });
schema.index({ schoolId: 1, family: 1, archived: 1 });
module.exports = mongoose.model('DocTemplate', schema);
