// Hours of community service by a student, counted only once the person who supervised it confirms (PRD E32, CAP-0494).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  studentId: { type: ObjectId, required: true }, studentName: { type: String, default: '' },
  activity: { type: String, required: true, maxlength: 200 },
  orgName: { type: String, default: '', maxlength: 120 },
  hours: { type: Number, required: true, min: 0.5, max: 12 },
  date: { type: String, required: true },
  supervisorName: { type: String, required: true, maxlength: 100 },
  linkHash: { type: String, default: '' }, linkPrefix: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Verified', 'Declined', 'Rejected'], default: 'Pending' },
  verifiedAt: Date, verifiedHours: { type: Number, default: 0 }, verifierStatement: { type: String, default: '' },
  rejectedNote: { type: String, default: '' },
  createdById: ObjectId, createdByName: { type: String, default: '' }, createdByRole: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ linkPrefix: 1 });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('ServiceLog', schema);
