const mongoose = require('../lib/pgdoc');
// The guard logbook (PRD E09, CAP-0348): incidents, notes and actions that must not be lost between shifts.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  gate: { type: String, default: 'Main gate' },
  kind: { type: String, enum: ['Incident', 'Note', 'Action'], default: 'Note' },
  severity: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  text: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
  reportedById: mongoose.Schema.Types.ObjectId, reportedByName: { type: String, default: '' },
  resolvedById: mongoose.Schema.Types.ObjectId, resolvedByName: { type: String, default: '' }, resolvedAt: Date, resolution: { type: String, default: '' },
  carriedToId: mongoose.Schema.Types.ObjectId, carriedToName: { type: String, default: '' }, handoverId: mongoose.Schema.Types.ObjectId, carriedCount: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, gate: 1, createdAt: -1 });
module.exports = mongoose.model('GateLogItem', schema);
