const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
  hours: { type: Number, default: 0 }, startTime: String, endTime: String, status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, date: 1 }, { unique: true });
schema.index({ schoolId: 1, date: 1 });
module.exports = mongoose.model('RosterEntry', schema);
