// A school's definition of a measure (PRD E25 MetricDefinition). One document per school and key; every change is a new version
// that a different administrator publishes. A custom measure is a built-in one narrowed to a set of classes or subjects.
const mongoose = require('../lib/pgdoc');

const version = new mongoose.Schema({
  version: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'published', 'superseded', 'rejected'], default: 'pending' },
  name: { type: String, default: '' },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },       // { standards[], classIds[], subjectIds[] }
  alert: { type: mongoose.Schema.Types.Mixed, default: {} },         // { below, above, criticalBelow, criticalAbove }
  target: { type: Number, default: null },
  minCell: { type: Number, default: 5 },
  minLevel: { type: String, default: '' },                           // narrowing only: teacher < lead < admin
  reason: { type: String, default: '' },
  madeById: mongoose.Schema.Types.ObjectId, madeByName: { type: String, default: '' }, madeAt: { type: Date, default: Date.now },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  soleAdmin: { type: Boolean, default: false },                      // published by the only administrator (recorded as such)
}, { _id: false });

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  key: { type: String, required: true },
  custom: { type: Boolean, default: false },
  baseKey: { type: String, default: '' },
  retired: { type: Boolean, default: false }, retiredReason: { type: String, default: '' }, retiredAt: Date,
  published: { type: Number, default: 0 },                           // version number in force (0 = the built-in definition)
  counter: { type: Number, default: 0 },
  versions: { type: [version], default: [] },
}, { timestamps: true });

schema.index({ schoolId: 1, key: 1 }, { unique: true });
schema.index({ schoolId: 1, custom: 1, retired: 1 });

module.exports = mongoose.model('AnMetric', schema);
