// A trial of a security or attendance device, written down before it starts (PRD E34). Nothing runs without an approved, unexpired pilot.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  no: { type: String, required: true },
  title: { type: String, required: true, maxlength: 140 },
  kind: { type: String, enum: ['badge_attendance', 'qr_attendance', 'entry_counter', 'incident_camera', 'access_reader'], required: true },
  purpose: { type: String, required: true, maxlength: 500 },
  legalBasis: { type: String, required: true, maxlength: 400 },
  dpiaRef: { type: String, required: true, maxlength: 120 },
  retentionDays: { type: Number, required: true, min: 1, max: 365 },
  manualAlternative: { type: String, required: true, maxlength: 400 },
  consentRequired: { type: Boolean, default: false },
  lowConfidence: { type: Number, default: 0.8 },
  reviewOn: { type: String, required: true },
  status: { type: String, enum: ['Draft', 'Review', 'Active', 'Paused', 'Ended'], default: 'Draft' },
  askedById: ObjectId, askedByName: { type: String, default: '' },
  approvals: { type: [Mixed], default: [] },      // [{ role: dpo|security, byId, byName, at, note }]
  soleAdmin: { type: Boolean, default: false },
  pausedReason: { type: String, default: '' },
  history: { type: [Mixed], default: [] }, rev: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, no: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, reviewOn: 1 });
module.exports = mongoose.model('SecurityPilot', schema);
