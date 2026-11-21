// A camera, reader or counter that sends events (PRD E34). Only a hash of its key is kept; the key is shown once.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, maxlength: 100 },
  kind: { type: String, enum: ['camera', 'reader', 'counter', 'gateway'], required: true },
  location: { type: String, default: '', maxlength: 120 },
  pilotId: { type: ObjectId, required: true },
  keyHash: { type: String, default: '' }, keyPrefix: { type: String, default: '' }, keyExpiresAt: { type: Date, default: null }, rotatedAt: { type: Date, default: null },
  status: { type: String, enum: ['Active', 'Disabled', 'Retired'], default: 'Active' },
  lastSeenAt: { type: Date, default: null }, lastEventAt: { type: Date, default: null }, driftSeconds: { type: Number, default: 0 },
  offlineNotified: { type: Boolean, default: false },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1 });
schema.index({ keyPrefix: 1 });
module.exports = mongoose.model('DeviceIntegration', schema);
