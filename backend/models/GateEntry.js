const mongoose = require('../lib/pgdoc');
// Every time someone passes a gate: who, which gate, in or out, by which credential, and why it was typed by hand (PRD E09, CAP-0352).
// Written by the visitor, contractor, pickup and manual flows. It never marks classroom attendance.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  subjectKind: { type: String, enum: ['student', 'staff', 'visitor', 'contractor', 'other'], required: true },
  subjectId: mongoose.Schema.Types.ObjectId,
  subjectName: { type: String, default: '' },
  direction: { type: String, enum: ['in', 'out'], required: true },
  gate: { type: String, default: 'Main gate' },
  method: { type: String, enum: ['qr', 'badge', 'reader', 'manual', 'pickup'], default: 'manual' },
  manualReason: { type: String, default: '' },
  allowed: { type: Boolean, default: true }, denyReason: { type: String, default: '' },
  deviceId: mongoose.Schema.Types.ObjectId,
  recordedById: mongoose.Schema.Types.ObjectId, recordedByName: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  ref: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, at: -1 });
schema.index({ schoolId: 1, subjectKind: 1, subjectId: 1, at: -1 });
schema.index({ schoolId: 1, allowed: 1, at: -1 });
module.exports = mongoose.model('GateEntry', schema);
