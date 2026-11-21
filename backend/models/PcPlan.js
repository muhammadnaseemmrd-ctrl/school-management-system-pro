const mongoose = require('../lib/pgdoc');

// A preventive maintenance routine (PRD E19): every so many days a job is opened by itself.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, task: { type: String, required: true, trim: true }, assetId: { type: mongoose.Schema.Types.ObjectId, default: null }, assetTag: { type: String, default: '' }, location: { type: String, default: '' },
  everyDays: { type: Number, required: true }, nextDueOn: { type: String, required: true }, lastDoneOn: { type: String, default: '' }, leadDays: { type: Number, default: 3 }, active: { type: Boolean, default: true },
  assignedName: { type: String, default: '' }, createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, active: 1, nextDueOn: 1 });
module.exports = mongoose.model('PcPlan', schema);
