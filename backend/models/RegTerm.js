const mongoose = require('../lib/pgdoc');

// An academic term. Grades are entered while it is open, published at the end and changed afterwards only with a signed approval.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  addDropUntil: { type: String, default: '' },
  status: { type: String, enum: ['planned', 'open', 'grading', 'published', 'closed'], default: 'planned' },
  publishedAt: Date,
  publishedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, startDate: -1 });
module.exports = mongoose.model('RegTerm', schema);
