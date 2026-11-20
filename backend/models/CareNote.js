const mongoose = require('../lib/pgdoc');
// A written note on a case, or a private counselling session note (visibility "author" = only the person who wrote it).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, caseId: { type: mongoose.Schema.Types.ObjectId, default: null }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['note', 'counselling', 'meeting', 'contact'], default: 'note' }, visibility: { type: String, enum: ['circle', 'author'], default: 'circle' },
  authorId: { type: mongoose.Schema.Types.ObjectId, required: true }, authorName: { type: String, default: '' }, body: { type: String, required: true },
}, { timestamps: true });
schema.index({ schoolId: 1, caseId: 1, createdAt: -1 });
schema.index({ schoolId: 1, studentId: 1, kind: 1, createdAt: -1 });
module.exports = mongoose.model('CareNote', schema);
