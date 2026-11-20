const mongoose = require('../lib/pgdoc');
// A moment of letter, number or sound practice with a carer (CAP-0275/0276). Only a descriptive word and a note are kept: no score, no points, no ranking.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId }, kind: { type: String, enum: ['tracing', 'matching', 'phonics', 'counting'], required: true },
  item: { type: String, default: '' }, effort: { type: String, enum: ['Exploring', 'Following', 'Steady'], default: 'Exploring' }, note: { type: String, default: '' },
  day: { type: String, required: true }, byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1, createdAt: -1 });
module.exports = mongoose.model('EyPractice', schema);
