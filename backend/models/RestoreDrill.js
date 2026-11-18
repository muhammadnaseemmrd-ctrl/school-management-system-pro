const mongoose = require('../lib/pgdoc');

// A restore drill proves a stored backup can really be restored: it is loaded into an isolated sandbox
// (temporary tables that live only inside one database session) and checked. Live data is never touched.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  schoolName: { type: String, default: '' },
  backupId: { type: mongoose.Schema.Types.ObjectId, required: true },
  backupCreatedAt: Date,
  status: { type: String, enum: ['Passed', 'Failed'], required: true },
  limited: { type: Boolean, default: false },   // true when a check could not be run (for example an old backup without a checksum)
  startedAt: { type: Date, default: Date.now },
  durationMs: Number,
  rowsRestored: Number,
  checks: { type: mongoose.Schema.Types.Mixed, default: [] },
  startedBy: mongoose.Schema.Types.ObjectId,
  startedByName: { type: String, default: '' },
  trigger: { type: String, enum: ['owner', 'scheduled'], default: 'owner' },
}, { timestamps: true });
schema.index({ startedAt: -1 });
schema.index({ schoolId: 1, startedAt: -1 });
schema.index({ backupId: 1 });

module.exports = mongoose.model('RestoreDrill', schema);
