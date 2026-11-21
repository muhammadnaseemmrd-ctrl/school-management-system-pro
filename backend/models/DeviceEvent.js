// One thing a device reported: metadata only, never an image, face or template (PRD E34). Deleted when the pilot's retention runs out.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  deviceId: { type: ObjectId, required: true }, pilotId: { type: ObjectId, required: true },
  kind: { type: String, enum: ['badge_scan', 'qr_scan', 'count', 'door', 'motion', 'tamper', 'offline', 'online'], required: true },
  at: { type: Date, required: true }, receivedAt: { type: Date, default: Date.now },
  studentId: { type: ObjectId, default: null },
  direction: { type: String, default: '' },
  confidence: { type: Number, default: null },
  meta: { type: Mixed, default: {} },           // { count, zone, door, battery, note }
  flags: { type: [String], default: [] },
  state: { type: String, enum: ['info', 'held', 'used', 'dismissed'], default: 'info' },
  decidedByName: { type: String, default: '' }, decidedAt: Date,
  eventKey: { type: String, default: '' }, evidenceId: { type: ObjectId, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ schoolId: 1, deviceId: 1, at: -1 });
schema.index({ schoolId: 1, state: 1, at: -1 });
schema.index({ expiresAt: 1 });
schema.index({ schoolId: 1, eventKey: 1 });
schema.index({ schoolId: 1, studentId: 1, at: -1 });
module.exports = mongoose.model('DeviceEvent', schema);
