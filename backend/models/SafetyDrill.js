const mongoose = require('../lib/pgdoc');
// A fire, earthquake or lockdown drill, or a real emergency assembly, with a head count that has to add up (PRD E09, CAP-0155/0156/0361/0362).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  kind: { type: String, enum: ['Fire', 'Earthquake', 'Lockdown', 'Evacuation', 'Emergency'], required: true },
  real: { type: Boolean, default: false },          // a real event, not a practice
  title: { type: String, default: '' },
  assemblyPoint: { type: String, default: '' },
  offSite: { type: Boolean, default: false },
  status: { type: String, enum: ['Open', 'Closed', 'Signed'], default: 'Open' },
  startedById: mongoose.Schema.Types.ObjectId, startedByName: { type: String, default: '' }, startedAt: { type: Date, default: Date.now },
  closedById: mongoose.Schema.Types.ObjectId, closedByName: { type: String, default: '' }, closedAt: Date, forceReason: { type: String, default: '' },
  signedById: mongoose.Schema.Types.ObjectId, signedByName: { type: String, default: '' }, signedAt: Date,
  summary: { type: String, default: '' }, durationSeconds: Number,
  counts: { expected: { type: Number, default: 0 }, safe: { type: Number, default: 0 }, missing: { type: Number, default: 0 }, unknown: { type: Number, default: 0 }, released: { type: Number, default: 0 }, others: { type: Number, default: 0 } },
  familiesNotifiedAt: Date,
  actions: [{ text: String, ownerName: String, dueDate: String, done: { type: Boolean, default: false }, doneAt: Date }],
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, startedAt: -1 });
module.exports = mongoose.model('SafetyDrill', schema);
