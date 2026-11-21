// A saved result set (PRD E25): what was measured, for whom, over which dates, with which definition versions. Never edited.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  kind: { type: String, enum: ['scheduled', 'manual', 'pack'], default: 'manual' },
  title: { type: String, default: '' },
  periodKey: { type: String, default: '' },                          // e.g. 2026-W47 or 2026-11 (scheduled runs)
  scopeKey: { type: String, default: 'all' },                        // all, or a fingerprint of the classes the viewer could see
  level: { type: String, default: 'admin' },
  from: { type: String, required: true }, to: { type: String, required: true },
  groupBy: { type: String, default: 'none' },
  results: { type: [mongoose.Schema.Types.Mixed], default: [] },
  exceptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  hidden: { type: [mongoose.Schema.Types.Mixed], default: [] },      // measures left out for this viewer, and why
  viewerIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  measureCount: { type: Number, default: 0 }, exceptionCount: { type: Number, default: 0 }, urgentCount: { type: Number, default: 0 },
  hash: { type: String, default: '' },
}, { timestamps: true });

schema.index({ schoolId: 1, createdAt: -1 });
schema.index({ schoolId: 1, scheduleId: 1, periodKey: 1, scopeKey: 1 }, { unique: true, sparse: true });
schema.index({ schoolId: 1, viewerIds: 1, createdAt: -1 });

module.exports = mongoose.model('AnRun', schema);
