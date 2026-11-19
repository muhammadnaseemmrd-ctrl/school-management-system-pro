const mongoose = require('../lib/pgdoc');
// Offline conflict inbox (PRD E11, CAP-0179): when a queued change meets a newer server change, neither wins silently.
const { ObjectId, Mixed } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, required: true }, kind: { type: String, enum: ['draft', 'marks', 'attendance', 'period'], required: true },
  entityKey: { type: String, required: true }, label: { type: String, default: '' },
  ownerId: { type: ObjectId, required: true }, ownerName: { type: String, default: '' }, mutationId: { type: String, default: '' },
  mine: { type: Mixed, default: null }, server: { type: Mixed, default: null }, base: { type: Mixed, default: null }, context: { type: Mixed, default: null },
  serverChangedBy: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'Resolving', 'Resolved'], default: 'Open' },
  assignedToId: { type: ObjectId, default: null }, assignedToRole: { type: String, default: '' }, assignedToName: { type: String, default: '' }, assignedByName: { type: String, default: '' },
  resolution: { type: String, enum: ['', 'mine', 'server', 'merged'], default: '' }, resolutionNote: { type: String, default: '' },
  resolvedById: { type: ObjectId, default: null }, resolvedByName: { type: String, default: '' }, resolvedByRole: { type: String, default: '' }, resolvedAt: { type: Date, default: null },
}, { timestamps: true });
s.index({ schoolId: 1, status: 1, createdAt: -1 });
s.index({ schoolId: 1, ownerId: 1, status: 1 });
s.index({ schoolId: 1, assignedToId: 1, status: 1 });
s.index({ schoolId: 1, entityKey: 1 });
module.exports = mongoose.model('SyncConflict', s);
