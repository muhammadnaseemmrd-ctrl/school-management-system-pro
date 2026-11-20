const mongoose = require('../lib/pgdoc');
// What carers must know to keep one child safe, and what the family has agreed to share (CAP-0285/0286/0283).
// Changes proposed by a family wait for a member of staff to confirm them with the family; an unconfirmed allergy is still shown, marked as such.
const allergy = { what: { type: String, default: '' }, severity: { type: String, enum: ['mild', 'moderate', 'severe'], default: 'moderate' }, action: { type: String, default: '' }, confirmed: { type: Boolean, default: false } };
const contact = { name: { type: String, default: '' }, relationship: { type: String, default: '' }, phone: { type: String, default: '' } };
const support = { situation: { type: String, default: '' }, support: { type: String, default: '' }, agreedWith: { type: String, default: '' }, agreedAt: Date, reviewDue: { type: String, default: '' } };
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  allergies: [allergy], diet: { type: String, default: '' }, medicalAlert: { type: String, default: '' }, emergencyContacts: [contact], comfort: { type: String, default: '' },
  supports: [support], confirmedAt: Date, confirmedByName: { type: String, default: '' }, confirmedWith: { type: String, default: '' },
  consent: { journal: { type: Boolean, default: true }, photos: { type: Boolean, default: false }, portfolio: { type: Boolean, default: false }, setByName: { type: String, default: '' }, setAt: Date, source: { type: String, default: '' } },
  consentHistory: [{ at: Date, byName: String, source: String, journal: Boolean, photos: Boolean, portfolio: Boolean }],
  pending: [{ at: Date, byParentId: mongoose.Schema.Types.ObjectId, byName: String, state: { type: String, default: 'Waiting' }, proposal: mongoose.Schema.Types.Mixed, decidedByName: String, decidedAt: Date, note: String }],
  updatedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1 }, { unique: true });
module.exports = mongoose.model('EyProfile', schema);
