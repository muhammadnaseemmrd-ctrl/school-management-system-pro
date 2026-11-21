// A report that is run on a rhythm and handed to named people (PRD E25 ReportSchedule).
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true },
  metrics: { type: [String], default: [] },
  cadence: { type: String, enum: ['weekly', 'monthly'], required: true },
  dow: { type: Number, default: 1 },                                 // 0 Sunday … 6 Saturday (weekly)
  dom: { type: Number, default: 1 },                                 // 1 … 28 (monthly)
  periodRule: { type: String, enum: ['last_7_days', 'last_30_days', 'last_full_month', 'month_to_date'], default: 'last_7_days' },
  groupBy: { type: String, enum: ['none', 'class', 'standard', 'campus'], default: 'none' },
  recipients: { type: [{ userId: mongoose.Schema.Types.ObjectId, role: String, name: String }], default: [] },
  active: { type: Boolean, default: true },
  nextDate: { type: String, default: '' },                           // school-local day the next run is due
  lastRunDate: { type: String, default: '' }, lastRunId: mongoose.Schema.Types.ObjectId, lastError: { type: String, default: '' },
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
}, { timestamps: true });

schema.index({ schoolId: 1, active: 1, nextDate: 1 });

module.exports = mongoose.model('AnSchedule', schema);
