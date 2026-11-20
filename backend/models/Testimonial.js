const mongoose = require('../lib/pgdoc');
// A real customer's words, shown on the website only with written consent on file (PRD E28: no false testimonials).
const schema = new mongoose.Schema({
  quote: { type: String, required: true, maxlength: 600 },
  personName: { type: String, required: true, maxlength: 100 }, personRole: { type: String, default: '', maxlength: 80 },
  schoolName: { type: String, required: true, maxlength: 140 }, schoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
  evidenceKind: { type: String, enum: ['email', 'signed-form', 'recorded-call', 'survey', 'other'], default: 'email' },
  evidenceNote: { type: String, default: '', maxlength: 500 }, // where the original words are kept
  wordsAsGiven: { type: Boolean, default: true }, // false = we shortened or edited, and the person approved the edit
  editApprovedOn: Date,
  consentGiven: { type: Boolean, default: false }, consentOn: Date, consentContact: { type: String, default: '', maxlength: 160 },
  status: { type: String, enum: ['Draft', 'Published', 'Withdrawn'], default: 'Draft' },
  publishedAt: Date, publishedByName: { type: String, default: '' }, reviewBy: Date, withdrawnAt: Date, withdrawnReason: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ status: 1, publishedAt: -1 });
module.exports = mongoose.model('Testimonial', schema);
