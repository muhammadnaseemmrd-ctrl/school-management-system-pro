const mongoose = require('../lib/pgdoc');
// One photographed sheet (PRD E14, CAP-0321). The photo and the straightened page are kept so a reviewer or an appeal can always
// see what the reader saw; what the reader measured is kept next to what a person decided.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, required: true },
  formId: { type: mongoose.Schema.Types.ObjectId, required: true },
  imageHash: { type: String, required: true },
  image: { type: Buffer, select: false }, rect: { type: Buffer, select: false },
  imageBytes: Number,
  source: { type: String, enum: ['camera', 'upload'], default: 'upload' },
  capturedAt: Date, capturedById: mongoose.Schema.Types.ObjectId, capturedByName: String,
  status: { type: String, enum: ['Needs review', 'Ready', 'Graded', 'Rescan', 'Superseded'], default: 'Needs review' },
  flags: [{ code: String, level: { type: String, enum: ['block', 'warn'] }, msg: String, resolved: { type: Boolean, default: false }, resolvedByName: String, resolvedAt: Date }],
  measure: { rotationDeg: Number, perspective: Number, edgeMm: Number, alignMm: Number, paper: Number, ink: Number, contrast: Number, widthPx: Number, heightPx: Number },
  fills: { type: mongoose.Schema.Types.Mixed, select: false },  // { q: [[...]], id: [[...]], form: [[...]] }
  answers: [{ q: Number, det: String, state: String, conf: Number, final: String, by: String, byName: String }],
  candidate: { read: String, no: Number, studentId: mongoose.Schema.Types.ObjectId, state: String, by: String },
  formRead: String,
  rescanOf: mongoose.Schema.Types.ObjectId,
  grade: { raw: Number, max: Number, pct: Number, right: Number, wrong: Number, blank: Number, marks: String, keyVersion: Number },
  reviewCount: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ batchId: 1, imageHash: 1 }, { unique: true });
schema.index({ schoolId: 1, batchId: 1, status: 1 });
schema.index({ schoolId: 1, batchId: 1, 'candidate.studentId': 1 });
module.exports = mongoose.model('OmrScan', schema);
