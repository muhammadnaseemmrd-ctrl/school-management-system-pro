const mongoose = require('../lib/pgdoc');

// One book (or other item) in the library catalogue (PRD E18). Physical copies are LbCopy. Textbooks carry the class they belong to.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  isbn: { type: String },                      // 13 digits, only set when known so unique works for books without one
  title: { type: String, required: true, trim: true }, subtitle: { type: String, default: '' },
  authors: [String], publisher: { type: String, default: '' }, year: { type: Number, default: null }, edition: { type: String, default: '' },
  language: { type: String, default: 'English' }, subjects: [String], shelf: { type: String, default: '' },
  kind: { type: String, enum: ['book', 'textbook', 'reference', 'periodical', 'other'], default: 'book' },
  lendable: { type: Boolean, default: true },   // reference books stay in the library
  textbook: { classIds: [mongoose.Schema.Types.ObjectId], subject: { type: String, default: '' } },
  price: { type: Number, default: 0 },          // replacement cost in PKR, used by the lost and damage rules
  summary: { type: String, default: '' },
  copies: { type: Number, default: 0 }, available: { type: Number, default: 0 },   // kept in step with LbCopy
  active: { type: Boolean, default: true },
  source: { type: String, default: 'manual' },
}, { timestamps: true });
schema.index({ schoolId: 1, isbn: 1 }, { unique: true });
schema.index({ schoolId: 1, active: 1, title: 1 });
schema.index({ schoolId: 1, kind: 1 });
module.exports = mongoose.model('LbTitle', schema);
