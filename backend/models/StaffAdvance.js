const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  amount: { type: Number, required: true, min: 1 }, monthlyRecovery: { type: Number, required: true, min: 1 }, recovered: { type: Number, default: 0 },
  reason: { type: String, default: '' }, status: { type: String, enum: ['Requested', 'Active', 'Rejected', 'Cleared'], default: 'Requested' },
  requestedBy: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' }, decidedByName: { type: String, default: '' }, decidedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, status: 1 });
module.exports = mongoose.model('StaffAdvance', schema);
