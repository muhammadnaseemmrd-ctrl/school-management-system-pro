const mongoose = require('../lib/pgdoc');
// A family-facing entry: the day's diary, a portfolio piece or a short note. Written by a carer, published only after a different person has looked at it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, required: true }, day: { type: String, required: true },
  kind: { type: String, enum: ['diary', 'portfolio', 'note'], default: 'diary' }, lang: { type: String, enum: ['en', 'ur'], default: 'en' },
  title: { type: String, default: '' }, body: { type: String, default: '' }, teacherComment: { type: String, default: '' },
  careIds: [mongoose.Schema.Types.ObjectId], mediaIds: [mongoose.Schema.Types.ObjectId], obsIds: [mongoose.Schema.Types.ObjectId],
  state: { type: String, enum: ['Draft', 'Review', 'Published', 'Withheld', 'Retracted'], default: 'Draft' },
  authorId: mongoose.Schema.Types.ObjectId, authorName: { type: String, default: '' }, submittedAt: Date,
  reviewedById: mongoose.Schema.Types.ObjectId, reviewedByName: { type: String, default: '' }, reviewedAt: Date, reviewNote: { type: String, default: '' }, soleReviewer: { type: Boolean, default: false },
  publishedAt: Date, retractReason: { type: String, default: '' }, retractedAt: Date,
  reads: [{ parentId: mongoose.Schema.Types.ObjectId, at: Date }],
  history: [{ at: Date, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1, state: 1, day: -1 });
schema.index({ schoolId: 1, roomId: 1, state: 1, day: -1 });
schema.index({ schoolId: 1, childId: 1, kind: 1, day: 1 });
module.exports = mongoose.model('EyPost', schema);
