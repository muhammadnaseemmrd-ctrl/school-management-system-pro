// A job someone owns because a measure slipped (PRD E25 exceptions and owner tasks).
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  title: { type: String, required: true },
  detail: { type: String, default: '' },
  metricKey: { type: String, default: '' }, groupKey: { type: String, default: '' }, groupLabel: { type: String, default: '' },
  classId: { type: mongoose.Schema.Types.ObjectId, default: null },
  runId: { type: mongoose.Schema.Types.ObjectId, default: null },
  source: { type: String, enum: ['exception', 'manual'], default: 'manual' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true }, ownerRole: { type: String, enum: ['admin', 'teacher'], required: true }, ownerName: { type: String, default: '' },
  dueOn: { type: String, required: true },
  status: { type: String, enum: ['open', 'done', 'dropped'], default: 'open' },
  doneAt: Date, doneNote: { type: String, default: '' }, droppedReason: { type: String, default: '' },
  overdueNoticeOn: { type: String, default: '' },
  history: { type: [{ at: Date, byName: String, action: String, note: String }], default: [] },
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
}, { timestamps: true });

schema.index({ schoolId: 1, status: 1, dueOn: 1 });
schema.index({ schoolId: 1, ownerId: 1, status: 1 });
schema.index({ schoolId: 1, metricKey: 1, groupKey: 1, status: 1 });

module.exports = mongoose.model('AnAction', schema);
