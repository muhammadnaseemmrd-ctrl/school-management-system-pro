const mongoose = require('../lib/pgdoc');
// A request about care data held on a child (PRD E21: PrivacyRequest). Answered within 30 days.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, number: { type: String, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  requesterId: { type: mongoose.Schema.Types.ObjectId, required: true }, requesterRole: { type: String, required: true }, requesterName: { type: String, default: '' },
  kind: { type: String, enum: ['access', 'correction', 'restrict', 'erasure'], required: true }, detail: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'In review', 'Fulfilled', 'Refused'], default: 'Open' }, dueAt: { type: Date, required: true }, response: { type: String, default: '' },
  legalHold: { type: Boolean, default: false }, decidedByName: { type: String, default: '' }, decidedAt: Date, overdueNotified: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, dueAt: 1 });
schema.index({ schoolId: 1, requesterId: 1, createdAt: -1 });
module.exports = mongoose.model('PrivacyRequest', schema);
