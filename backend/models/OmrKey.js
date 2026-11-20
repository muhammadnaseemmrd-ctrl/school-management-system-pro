const mongoose = require('../lib/pgdoc');
// One revision of an answer key (CAP-0323). Earlier revisions are never edited, so any grade can be explained and repeated.
// Each answer is a letter, several accepted letters ("B|C"), "*" (everyone gets the marks) or "-" (question dropped, not counted).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  formId: { type: mongoose.Schema.Types.ObjectId, required: true },
  version: { type: Number, required: true },
  answers: [String],
  weights: [Number],                                          // marks per question; empty means the form's marks-per-question for all
  reason: { type: String, default: '' },
  hash: String,
  byId: mongoose.Schema.Types.ObjectId, byName: String,
  changed: [Number],                                          // question numbers that differ from the previous revision
}, { timestamps: true });
schema.index({ formId: 1, version: 1 }, { unique: true });
schema.index({ schoolId: 1, formId: 1, createdAt: -1 });
module.exports = mongoose.model('OmrKey', schema);
