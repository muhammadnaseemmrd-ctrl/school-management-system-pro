const mongoose = require('../lib/pgdoc');
// A printable answer sheet (PRD E14, CAP-0320): how many questions and choices, who sits it, and how marks are read.
// The structure (questions, choices, digits) is fixed once the first photo has been taken, so every scan matches the printed layout.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: Number, required: true },                       // printed on every sheet as four bubbled digits
  title: { type: String, required: true, trim: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  questions: { type: Number, required: true, min: 1, max: 100 },
  choices: { type: Number, default: 4, min: 2, max: 5 },
  idDigits: { type: Number, default: 6, min: 3, max: 8 },
  marksPerQuestion: { type: Number, default: 1, min: 0 },
  negative: { type: Number, default: 0, min: 0 },               // marks taken off a wrong answer (never below zero in total)
  thresholds: { mark: Number, faint: Number, gap: Number, blurMm: Number, minContrast: Number, minPaper: Number, blankPct: Number, alignMm: Number },
  instructions: { type: String, default: '' },
  status: { type: String, enum: ['Draft', 'Ready', 'Archived'], default: 'Draft' },
  keyVersion: { type: Number, default: 0 },
  candidates: [{ studentId: mongoose.Schema.Types.ObjectId, no: Number }],
  createdById: mongoose.Schema.Types.ObjectId, createdByName: String, createdByRole: String,
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, classId: 1 });
module.exports = mongoose.model('OmrForm', schema);
