// One piece of writing the assistant produced for a person to check (PRD E31). It is a draft until a human approves it; it carries
// where it came from (provider, version, sources) and every worry the checks found. Nothing reaches families or students without a person.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  no: { type: String, required: true },                                   // AI-2026-00001
  kind: { type: String, enum: ['lesson_plan', 'notice', 'question_set', 'rubric_feedback', 'translation'], required: true },
  status: { type: String, enum: ['Draft', 'Review', 'Approved', 'Rejected', 'Withdrawn', 'Expired'], default: 'Draft' },
  publishState: { type: String, enum: ['none', 'claimed', 'done'], default: 'none' },
  title: { type: String, default: '', maxlength: 160 },
  request: { type: mongoose.Schema.Types.Mixed, default: {} },            // what the person asked, with anything sensitive already taken out
  content: { type: mongoose.Schema.Types.Mixed, default: {} },            // { sections: [...] } or { questions: [...] }
  contentHash: { type: String, default: '' },
  provenance: { type: mongoose.Schema.Types.Mixed, default: {} },         // { provider, builtin, model, version, generatedAt, promptHash, outputHash, sourceIds, sourceTitles }
  flags: { type: [mongoose.Schema.Types.Mixed], default: [] },            // [{ id, code, severity: note|warn|block, message, at (section/question id), ack: {by, at} }]
  edits: { type: Number, default: 0 },
  trail: { type: [mongoose.Schema.Types.Mixed], default: [] },
  requesterId: mongoose.Schema.Types.ObjectId, requesterName: { type: String, default: '' }, requesterRole: { type: String, default: '' },
  classId: { type: mongoose.Schema.Types.ObjectId, default: null },
  submittedAt: Date,
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' }, soleAdmin: { type: Boolean, default: false },
  published: { type: mongoose.Schema.Types.Mixed, default: null },       // { type: 'Notice'|'QuestionItem', ids: [], at, byName }
  expiresAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, no: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, requesterId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model('AssistantDraft', schema);
