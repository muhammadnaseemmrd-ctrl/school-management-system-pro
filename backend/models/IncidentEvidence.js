// An incident and the evidence kept for it (PRD E34). Few people can see it, every opening is logged, and it is destroyed on schedule unless a legal hold stops that.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  no: { type: String, required: true },
  title: { type: String, required: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  occurredAt: { type: Date, required: true }, location: { type: String, default: '', maxlength: 120 },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['Open', 'Closed', 'Destroyed'], default: 'Open' },
  viewers: { type: [ObjectId], default: [] }, viewerNames: { type: [String], default: [] },
  items: { type: [Mixed], default: [] },          // [{ id, kind, ref, checksum, note, deviceId, addedByName, at }]
  legalHold: { type: Mixed, default: null },      // { reason, byName, byId, at }
  retentionUntil: { type: String, default: '' }, closedAt: Date, destroyedAt: Date, destruction: { type: Mixed, default: null },
  createdById: ObjectId, createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, no: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, status: 1, retentionUntil: 1 });
module.exports = mongoose.model('IncidentEvidence', schema);
