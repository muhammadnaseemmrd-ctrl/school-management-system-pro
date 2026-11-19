const mongoose = require('../lib/pgdoc');
// A marking rubric for essays and open answers (PRD E13, CAP-0317, CAP-0034). Marks still work without one.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  criteria: [{ id: String, name: String, levels: [{ points: Number, descriptor: String }] }],
  max: { type: Number, default: 0 },
  comments: [String],                                 // reusable comment bank
  authorId: mongoose.Schema.Types.ObjectId, authorName: String,
  archived: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, archived: 1, name: 1 });
module.exports = mongoose.model('Rubric', schema);
