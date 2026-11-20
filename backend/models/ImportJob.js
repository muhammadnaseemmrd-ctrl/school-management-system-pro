const mongoose = require('../lib/pgdoc');

// One upload of rows (classes or students). The preview is a dry run that writes nothing; the commit works in small
// batches and remembers each row, so a retry never creates anything twice; the journal lets the whole job be taken back (PRD E29).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  kind: { type: String, enum: ['classes', 'students'], required: true },
  fileName: { type: String, default: '' },
  status: { type: String, enum: ['Previewed', 'Committing', 'Committed', 'RolledBack', 'Cancelled'], default: 'Previewed' },
  createdBy: { type: mongoose.Schema.Types.ObjectId },
  createdByName: { type: String, default: '' },
  // [{ n, raw, state: ok|update|review|error|skip, errors[], warnings[], match:{id,label,why}, diff:[{field,from,to}], decision, result:{status,id,error,created:[{model,id}],updated:{model,id,before,after}} }]
  rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  planHash: { type: String, default: '' },
  options: { type: mongoose.Schema.Types.Mixed, default: {} },
  lockUntil: { type: Date, default: () => new Date(0) },
  committedAt: Date, committedByName: { type: String, default: '' },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
  rolledBackAt: Date, rolledBackByName: { type: String, default: '' }, rollbackReason: { type: String, default: '' },
  rollbackResult: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ schoolId: 1, createdAt: -1 });
schema.index({ schoolId: 1, status: 1 });
schema.index({ schoolId: 1, kind: 1, planHash: 1, status: 1 });

module.exports = mongoose.model('ImportJob', schema);
