const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }, date: { type: String, required: true },
  status: { type: String, enum: ['Present', 'Late', 'Absent', 'HalfDay', 'Leave'], required: true },
  checkIn: String, checkOut: String, lateMinutes: { type: Number, default: 0 }, workedMinutes: { type: Number, default: 0 },
  source: { type: String, enum: ['manual', 'badge', 'biometric', 'leave'], default: 'manual' },
  corrections: [{ at: Date, byName: String, reason: String, from: String, to: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, date: 1 }, { unique: true });
schema.index({ schoolId: 1, date: 1, status: 1 });
module.exports = mongoose.model('StaffAttendance', schema);
