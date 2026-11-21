// The yearly report: figures counted from the school's own records, and stories that the people in them agreed to (PRD E32, CAP-0489).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  title: { type: String, required: true, maxlength: 140 },
  year: { type: Number, required: true },
  status: { type: String, enum: ['Draft', 'Approved', 'Published'], default: 'Draft' },
  metrics: { type: [Mixed], default: [] },        // frozen when approved
  stories: { type: [Mixed], default: [] },        // [{ id, title, text, consent: { confirmed, note }, approved, approvedByName }]
  hash: { type: String, default: '' }, code: { type: String, default: '' },
  askedByName: String, askedById: ObjectId, approvedByName: String, approvedById: ObjectId, approvedAt: Date, soleAdmin: { type: Boolean, default: false },
  publishedAt: Date, createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, year: -1 });
schema.index({ code: 1 });
module.exports = mongoose.model('AnnualReport', schema);
