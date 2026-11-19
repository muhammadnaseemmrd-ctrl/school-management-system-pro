const mongoose = require('../lib/pgdoc');
// A student's request to have a result looked at again (PRD E13, CAP-0326). The reviewer can never be someone who marked the items.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true }, attemptId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  refs: [mongoose.Schema.Types.ObjectId], reason: { type: String, required: true },
  status: { type: String, enum: ['Requested', 'InReview', 'Upheld', 'Rejected', 'Revised'], default: 'Requested' },
  reviewerId: mongoose.Schema.Types.ObjectId, reviewerName: String, decidedAt: Date, note: String,
  before: Number, after: Number, changes: [{ ref: mongoose.Schema.Types.ObjectId, before: Number, after: Number }],
  signature: String, resultVersion: Number,
  requestedById: mongoose.Schema.Types.ObjectId, requestedByRole: String,
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, attemptId: 1 });
module.exports = mongoose.model('AssessAppeal', schema);
