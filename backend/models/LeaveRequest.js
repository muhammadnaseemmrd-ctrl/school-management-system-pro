const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['annual', 'sick', 'casual', 'unpaid'], required: true },
  fromDate: { type: String, required: true }, toDate: { type: String, required: true }, days: { type: Number, required: true },
  reason: { type: String, default: '' }, status: { type: String, enum: ['Requested', 'Approved', 'Rejected', 'Cancelled'], default: 'Requested' },
  // Who asked, and whether somebody asked on their behalf. Kept so the person who writes a
  // request down cannot also be the one who approves it.
  requestedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  requestedByRole: { type: String, default: '' },
  onBehalf: { type: Boolean, default: false },          // the office wrote down a paper form
  soleApproval: { type: Boolean, default: false },      // decided by the only administrator there is
  requestedByName: { type: String, default: '' }, decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, fromDate: 1 });
module.exports = mongoose.model('LeaveRequest', schema);
