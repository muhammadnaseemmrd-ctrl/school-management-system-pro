const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }, date: { type: String, required: true },
  hours: { type: Number, required: true, min: 0.5 }, reason: { type: String, default: '' }, status: { type: String, enum: ['Requested', 'Approved', 'Rejected'], default: 'Requested' },
  period: { type: String, default: '' }, requestedBy: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' }, approvedByName: { type: String, default: '' }, decidedAt: Date, paidInBatchId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, period: 1 });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('OvertimeEntry', schema);
