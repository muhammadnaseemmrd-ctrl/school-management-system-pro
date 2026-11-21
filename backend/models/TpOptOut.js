const mongoose = require('../lib/pgdoc');

// A family telling the school the child will not ride on a given day (PRD E22). Read when the day's trips are made and applied to a trip that already exists.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  date: { type: String, required: true }, direction: { type: String, enum: ['morning', 'afternoon', 'both'], default: 'both' },
  reason: { type: String, default: '' }, byParentId: { type: mongoose.Schema.Types.ObjectId, default: null }, byName: { type: String, default: '' },
  cancelled: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, date: 1, direction: 1 }, { unique: true });
schema.index({ schoolId: 1, date: 1 });
module.exports = mongoose.model('TpOptOut', schema);
