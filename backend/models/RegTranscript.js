const mongoose = require('../lib/pgdoc');

// An issued transcript: a frozen copy of the record with a serial, a content hash and a signature that the public check page can confirm.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, default: '' },
  serial: { type: String, required: true },
  kind: { type: String, enum: ['unofficial', 'official', 'final'], default: 'official' },
  programName: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed },
  contentHash: { type: String, default: '' },
  signature: { type: String, default: '' },
  verifyKey: { type: String, required: true },
  issuedById: mongoose.Schema.Types.ObjectId, issuedByName: { type: String, default: '' },
  status: { type: String, enum: ['valid', 'revoked'], default: 'valid' },
  revokedAt: Date, revokedByName: { type: String, default: '' }, revokeReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ verifyKey: 1 }, { unique: true });
schema.index({ schoolId: 1, serial: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
module.exports = mongoose.model('RegTranscript', schema);
