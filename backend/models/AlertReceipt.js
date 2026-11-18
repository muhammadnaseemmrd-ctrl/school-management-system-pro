const mongoose = require('../lib/pgdoc');
// Delivery, reading and acknowledgement are three different facts (PRD E08, CAP-0378): one row per alert recipient.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  alertId: { type: ObjectId, ref: 'AttendanceAlert', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  recipientId: { type: ObjectId, required: true },
  role: { type: String, enum: ['parent', 'student'], required: true },
  deliveredAt: { type: Date, default: Date.now },
  readAt: { type: Date, default: null },
  acknowledgedAt: { type: Date, default: null },
  reply: { type: String, default: '' },
}, { timestamps: true });
s.index({ alertId: 1, recipientId: 1 }, { unique: true });
s.index({ recipientId: 1, role: 1, createdAt: -1 });
module.exports = mongoose.model('AlertReceipt', s);
