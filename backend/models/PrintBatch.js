const mongoose = require('../lib/pgdoc');
// A print job for many issued documents (PRD E12, CAP-0434/0435). Each item has its own result so one jam does not lose the rest.
const item = new mongoose.Schema({
  issuanceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  serial: { type: String, default: '' }, name: { type: String, default: '' },
  status: { type: String, enum: ['Queued', 'Printed', 'Failed', 'Cancelled'], default: 'Queued' },
  attempts: { type: Number, default: 0 },
  errorCode: { type: String, default: '' }, error: { type: String, default: '' },
  doneAt: Date,
}, { _id: true });
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true },
  family: { type: String, default: '' },
  mode: { type: String, enum: ['single', 'sheet'], default: 'sheet' },
  sheet: { type: mongoose.Schema.Types.Mixed, default: {} },       // { page:'A4', cols, rows, marginMm, gapMm, cutMarks, duplex }
  items: { type: [item], default: [] },
  status: { type: String, enum: ['Draft', 'Printing', 'Done', 'NeedsAttention', 'Cancelled'], default: 'Draft' },
  round: { type: Number, default: 0 },                              // how many times the job has been sent to the printer
  log: { type: [{ at: Date, byName: String, kind: String, text: String }], default: [] },
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  startedAt: Date, finishedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('PrintBatch', schema);
