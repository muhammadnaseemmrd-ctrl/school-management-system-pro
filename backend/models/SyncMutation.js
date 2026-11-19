const mongoose = require('../lib/pgdoc');
// LocalMutation (PRD E11): one write queued on a device. Its client-made id is claimed here, so a replay after reconnecting
// gets the first answer and nothing is written twice.
const { ObjectId, Mixed } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, required: true }, userId: { type: ObjectId, required: true }, role: { type: String, default: '' },
  deviceId: { type: String, default: '' }, mutationId: { type: String, required: true },
  kind: { type: String, enum: ['draft', 'marks', 'attendance', 'period'], required: true }, entityKey: { type: String, default: '' },
  baseRevision: { type: Number, default: 0 }, capturedAt: { type: Date, default: null },
  status: { type: String, enum: ['Running', 'Applied', 'Partial', 'Conflicted', 'Rejected'], default: 'Running' },
  message: { type: String, default: '' }, revision: { type: Number, default: 0 }, conflictIds: [{ type: ObjectId }],
  result: { type: Mixed, default: null }, receivedAt: { type: Date, default: Date.now },
}, { timestamps: true });
s.index({ schoolId: 1, mutationId: 1 }, { unique: true });
s.index({ schoolId: 1, userId: 1, receivedAt: -1 });
s.index({ schoolId: 1, status: 1, receivedAt: -1 });
s.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
module.exports = mongoose.model('SyncMutation', s);
