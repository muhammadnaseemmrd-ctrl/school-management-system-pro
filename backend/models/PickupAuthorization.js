const mongoose = require('../lib/pgdoc');
// A guardian lets someone else collect a child on one chosen day (PRD E09, CAP-0353). The collector shows the code the guardian was given.
// A restriction always wins over an authorisation.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  personName: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  relationship: { type: String, default: 'Family friend' },
  day: { type: String, required: true },          // YYYY-MM-DD, school local day
  codeHash: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Used', 'Revoked', 'Expired'], default: 'Active' },
  createdByRole: { type: String, default: '' }, createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  confirmedWith: { type: String, default: '' },   // when the desk records it on a guardian's behalf: who was phoned
  usedAt: Date, revokedAt: Date, revokedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, day: 1, status: 1 });
schema.index({ schoolId: 1, day: 1, status: 1 });
schema.index({ schoolId: 1, createdById: 1, createdAt: -1 });
module.exports = mongoose.model('PickupAuthorization', schema);
