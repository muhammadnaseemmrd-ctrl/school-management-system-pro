// Every human decision about assistant output, kept for good (PRD E31): who looked, what they confirmed they had read, what worries they accepted.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  subject: { type: String, enum: ['draft', 'policy', 'source'], required: true },
  subjectId: { type: String, required: true },
  subjectNo: { type: String, default: '' },
  decision: { type: String, enum: ['approve', 'reject', 'return', 'publish', 'withdraw'], required: true },
  byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' }, byRole: { type: String, default: '' },
  note: { type: String, default: '' },
  confirmed: { type: mongoose.Schema.Types.Mixed, default: {} },          // { sections: [ids], questions: [ids], flags: [ids], readsTargetLanguage }
  contentHash: { type: String, default: '' },                              // exactly what was approved
  soleAdmin: { type: Boolean, default: false },
  at: { type: Date, default: Date.now },
}, { timestamps: false });
schema.index({ schoolId: 1, at: -1 });
schema.index({ schoolId: 1, subject: 1, subjectId: 1, at: 1 });

module.exports = mongoose.model('AIApproval', schema);
