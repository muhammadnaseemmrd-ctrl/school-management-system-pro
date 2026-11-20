const mongoose = require('../lib/pgdoc');

// One year-end rollover: freeze results, check readiness, plan every learner's move (dry run), a second person reviews,
// commit in batches, and a journal that can take it all back (PRD E29, section 5.15).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  fromYear: { type: String, default: '' },
  toYear: { type: String, required: true },
  status: { type: String, enum: ['Draft', 'Reviewed', 'Committing', 'Committed', 'RolledBack', 'Cancelled'], default: 'Draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId },
  createdByName: { type: String, default: '' },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },       // { ladder: [standard...], classActions: {classId: action}, studentOverrides: {studentId: {action, reason}} }
  frozen: { type: mongoose.Schema.Types.Mixed, default: null },      // { at, byName, marksCount, marksHash }
  readiness: { type: mongoose.Schema.Types.Mixed, default: {} },     // { blockers[], warnings[], info{}, checkedAt }
  plan: { type: mongoose.Schema.Types.Mixed, default: {} },          // { classes[], newClasses[], students[], counts }
  planHash: { type: String, default: '' },
  review: { type: mongoose.Schema.Types.Mixed, default: null },      // { byName, at, planHash, note, sole }
  journal: { type: mongoose.Schema.Types.Mixed, default: {} },       // { students:[{studentId, before, after, done}], createdClassIds[], schoolBefore }
  progress: { type: mongoose.Schema.Types.Mixed, default: {} },
  lockUntil: { type: Date, default: () => new Date(0) },
  committedAt: Date, committedByName: { type: String, default: '' },
  rolledBackAt: Date, rolledBackByName: { type: String, default: '' }, rollbackReason: { type: String, default: '' },
  rollbackResult: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ schoolId: 1, createdAt: -1 });
schema.index({ schoolId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, 'frozen.at': -1 });

module.exports = mongoose.model('RolloverRun', schema);
