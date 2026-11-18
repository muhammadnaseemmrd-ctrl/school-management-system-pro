const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['permanent', 'fixed-term', 'visiting', 'vendor'], required: true },
  startDate: { type: Date, required: true }, endDate: { type: Date, default: null }, noticeDays: { type: Number, default: 30, min: 0 },
  basicSalary: { type: Number, default: 0 }, status: { type: String, enum: ['Draft', 'Signed', 'Ended'], default: 'Draft' },
  signedAt: Date, signedByName: { type: String, default: '' }, endedAt: Date, endReason: { type: String, default: '' }, renewsId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, endDate: 1 });
module.exports = mongoose.model('EmployeeContract', schema);
