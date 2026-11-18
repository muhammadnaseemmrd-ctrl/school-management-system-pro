const mongoose = require('../lib/pgdoc');

// One row per backup attempt, successful or not, so a failed or missing backup is visible instead of silent.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  schoolName: { type: String, default: '' },
  trigger: { type: String, enum: ['weekly', 'manual', 'owner'], default: 'weekly' },
  status: { type: String, enum: ['Running', 'Succeeded', 'Failed'], default: 'Running' },
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
  durationMs: Number,
  backupId: mongoose.Schema.Types.ObjectId,
  sizeBytes: Number,
  rowCount: Number,
  checksum: { type: String, default: '' },
  error: { type: String, default: '' },
}, { timestamps: true });
schema.index({ startedAt: -1 });
schema.index({ schoolId: 1, startedAt: -1 });
schema.index({ status: 1, startedAt: -1 });

module.exports = mongoose.model('BackupRun', schema);
