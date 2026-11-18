const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  lastDay: { type: String, required: true }, reason: { type: String, default: '' },
  salaryDue: { type: Number, default: 0 }, leaveEncashment: { type: Number, default: 0 }, advanceRecovery: { type: Number, default: 0 }, net: { type: Number, default: 0 },
  clearance: [{ key: String, label: String, cleared: { type: Boolean, default: false }, clearedByName: String, clearedAt: Date }],
  status: { type: String, enum: ['Open', 'Settled'], default: 'Open' }, settledByName: { type: String, default: '' }, settledAt: Date, preparedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1 });
module.exports = mongoose.model('FinalSettlement', schema);
