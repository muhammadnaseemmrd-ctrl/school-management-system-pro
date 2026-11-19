const mongoose = require('../lib/pgdoc');
// A quiz or online exam (PRD E13). Items are a frozen list of question versions, so later bank edits never change a published paper.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true }, kind: { type: String, enum: ['quiz', 'exam'], default: 'quiz' },
  subjectId: { type: mongoose.Schema.Types.ObjectId }, classIds: [mongoose.Schema.Types.ObjectId],
  instructions: { type: String, default: '' }, instructionsUr: { type: String, default: '' },
  source: { type: String, enum: ['fixed', 'blueprint'], default: 'fixed' },
  blueprint: { rules: [{ id: String, topic: String, difficulty: String, kind: String, bloom: String, count: Number }], balance: { type: Boolean, default: true } },
  items: [{ ref: mongoose.Schema.Types.ObjectId, itemKey: String, version: Number, marks: Number, kind: String, topic: String, difficulty: String }],
  totalMarks: { type: Number, default: 0 },
  settings: {
    durationMin: { type: Number, default: 30 }, shuffleQuestions: { type: Boolean, default: true }, shuffleOptions: { type: Boolean, default: true },
    attemptsMax: { type: Number, default: 1 }, scoring: { type: String, enum: ['best', 'last', 'average'], default: 'best' },
    resume: { type: String, enum: ['resume', 'single-sitting'], default: 'resume' }, reconnectGraceMin: { type: Number, default: 5 }, offlineGraceMin: { type: Number, default: 15 },
    opensAt: Date, closesAt: Date,
    identity: { type: String, enum: ['login', 'admission', 'invigilator'], default: 'login' },
    passPct: { type: Number, default: 40 }, showAnswers: { type: Boolean, default: false },
    dualMarking: { type: Boolean, default: false }, discrepancyPct: { type: Number, default: 15 },
    appealDays: { type: Number, default: 7 },
  },
  status: { type: String, enum: ['Draft', 'Review', 'Published', 'Closed', 'Archived'], default: 'Draft' },
  seedSalt: { type: String, required: true },
  review: { submittedById: mongoose.Schema.Types.ObjectId, submittedByName: String, submittedAt: Date, decidedById: mongoose.Schema.Types.ObjectId, decidedByName: String, decidedAt: Date, note: String },
  release: { state: { type: String, enum: ['Held', 'Scheduled', 'Released'], default: 'Held' }, scheduledAt: Date, releasedAt: Date, releasedById: mongoose.Schema.Types.ObjectId, releasedByName: String, forced: { type: Boolean, default: false }, forceReason: String },
  sealed: { keyAuthorizedAt: Date, keyAuthorizedById: mongoose.Schema.Types.ObjectId, keyAuthorizedByName: String, keyReason: String },
  authorId: mongoose.Schema.Types.ObjectId, authorRole: String, authorName: String,
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, 'settings.opensAt': 1 });
schema.index({ schoolId: 1, classIds: 1, status: 1 });
schema.index({ schoolId: 1, authorId: 1, updatedAt: -1 });
module.exports = mongoose.model('Assessment', schema);
