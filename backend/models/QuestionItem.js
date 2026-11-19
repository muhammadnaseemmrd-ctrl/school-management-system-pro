const mongoose = require('../lib/pgdoc');
// One version of one question in the school's bank (PRD E13, CAP-0308..0311, 0327). A question is a chain of versions sharing itemKey.
// A version that has been used in a published quiz is never edited: a change makes a new version.
const OPT = new mongoose.Schema({ id: String, text: { type: String, default: '' }, textUr: { type: String, default: '' }, correct: { type: Boolean, default: false } }, { _id: false });
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemKey: { type: String, required: true },
  version: { type: Number, default: 1 },
  current: { type: Boolean, default: true },
  state: { type: String, enum: ['Draft', 'Active', 'Retired'], default: 'Draft' },
  kind: { type: String, enum: ['mcq', 'multi', 'tf', 'short', 'essay', 'match', 'order', 'numeric'], required: true },
  stem: { type: String, required: true }, stemUr: { type: String, default: '' }, stemSpeech: { type: String, default: '' },
  language: { type: String, enum: ['en', 'ur', 'both'], default: 'en' },
  options: [OPT],
  pairs: [new mongoose.Schema({ id: String, left: String, right: String }, { _id: false })],
  sequence: [new mongoose.Schema({ id: String, text: String }, { _id: false })],
  accepted: [String], caseSensitive: { type: Boolean, default: false },
  numAnswer: Number, numTolerance: { type: Number, default: 0 }, unit: { type: String, default: '' },
  marks: { type: Number, default: 1 }, partialCredit: { type: Boolean, default: false }, negativeMarks: { type: Number, default: 0 },
  explanation: { type: String, default: '' },
  rubricId: { type: mongoose.Schema.Types.ObjectId },
  subjectId: { type: mongoose.Schema.Types.ObjectId }, standard: { type: String, default: '' },
  topic: { type: String, default: '' }, bloom: { type: String, enum: ['', 'Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'], default: '' },
  competency: { type: String, default: '' }, difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' }, tags: [String],
  authorId: { type: mongoose.Schema.Types.ObjectId }, authorRole: String, authorName: String,
  license: { kind: { type: String, enum: ['original', 'adapted', 'licensed', 'open'], default: 'original' }, source: { type: String, default: '' }, holder: { type: String, default: '' } },
  sharing: { type: String, enum: ['private', 'school'], default: 'private' },
  locked: { type: Boolean, default: false },
  changeNote: { type: String, default: '' }, supersedesId: { type: mongoose.Schema.Types.ObjectId },
  usage: { quizzes: { type: Number, default: 0 }, attempts: { type: Number, default: 0 }, correct: { type: Number, default: 0 }, lastUsedAt: Date },
}, { timestamps: true });
schema.index({ schoolId: 1, itemKey: 1, version: 1 }, { unique: true });
schema.index({ schoolId: 1, current: 1, state: 1, subjectId: 1, topic: 1 });
schema.index({ schoolId: 1, current: 1, authorId: 1 });
schema.index({ schoolId: 1, current: 1, kind: 1, difficulty: 1 });
module.exports = mongoose.model('QuestionItem', schema);
