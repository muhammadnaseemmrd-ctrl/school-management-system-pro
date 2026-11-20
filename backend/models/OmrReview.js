const mongoose = require('../lib/pgdoc');
// A person's decision about something the reader was unsure of, with what the reader saw and what the person chose (CAP-0322).
// Append-only: a later change to the same question adds another row.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, required: true },
  scanId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['answer', 'candidate', 'scan', 'reject'], required: true },
  questionNo: { type: Number, default: 0 },
  detectedMark: { type: String, default: '' }, reviewerMark: { type: String, default: '' },
  reason: { type: String, required: true },
  reviewerId: mongoose.Schema.Types.ObjectId, reviewerName: String,
}, { timestamps: true });
schema.index({ scanId: 1, createdAt: 1 });
schema.index({ schoolId: 1, batchId: 1, createdAt: -1 });
module.exports = mongoose.model('OmrReview', schema);
