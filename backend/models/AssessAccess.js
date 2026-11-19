const mongoose = require('../lib/pgdoc');
// Authorised access arrangements and make-up windows (PRD E13, CAP-0314, CAP-0318). The reason is restricted; classmates and the paper never show it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, assessmentId: { type: mongoose.Schema.Types.ObjectId },   // empty = standing arrangement
  mode: { type: String, enum: ['access', 'makeup'], default: 'access' },
  status: { type: String, enum: ['Requested', 'Active', 'Declined', 'Revoked'], default: 'Requested' },
  extraTimePct: { type: Number, default: 0 }, extraAttempts: { type: Number, default: 0 }, largeText: { type: Boolean, default: false }, readAloud: { type: Boolean, default: false }, separateSitting: { type: Boolean, default: false },
  opensAt: Date, closesAt: Date,
  validFrom: Date, validTo: Date,
  reason: { type: String, default: '' },
  requestedById: mongoose.Schema.Types.ObjectId, requestedByName: String, requestedByRole: String,
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: String, decidedAt: Date, decisionNote: String,
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, assessmentId: 1, status: 1 });
module.exports = mongoose.model('AssessAccess', schema);
