// A document or record that shows a standard is met, with who submitted it and who reviewed it (PRD E32, CAP-0490).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  standardId: { type: ObjectId, required: true },
  title: { type: String, required: true, maxlength: 160 },
  kind: { type: String, enum: ['document', 'link', 'observation', 'data'], default: 'document' },
  heldAt: { type: String, default: '', maxlength: 300 },       // a link, or where the paper copy is kept
  period: { type: String, default: '', maxlength: 40 },
  status: { type: String, enum: ['Submitted', 'Accepted', 'Rejected', 'Expired'], default: 'Submitted' },
  validUntil: { type: String, default: '' },
  submittedById: ObjectId, submittedByName: { type: String, default: '' },
  reviewedById: ObjectId, reviewedByName: { type: String, default: '' }, reviewedAt: Date, reviewNote: { type: String, default: '' }, soleAdmin: { type: Boolean, default: false },
  trail: { type: [Mixed], default: [] },
}, { timestamps: true });
schema.index({ schoolId: 1, standardId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, validUntil: 1 });
module.exports = mongoose.model('AccEvidence', schema);
