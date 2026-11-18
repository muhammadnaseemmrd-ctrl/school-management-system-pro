const mongoose = require('../lib/pgdoc');
// One line of a drill head count: a student, or an outsider who was on site when it started.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  drillId: { type: mongoose.Schema.Types.ObjectId, ref: 'SafetyDrill', required: true },
  kind: { type: String, enum: ['student', 'visitor', 'contractor'], default: 'student' },
  refId: { type: mongoose.Schema.Types.ObjectId },
  name: { type: String, default: '' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, classLabel: { type: String, default: '' },
  status: { type: String, enum: ['Expected', 'Safe', 'Missing', 'Unknown', 'Released'], default: 'Expected' },
  markedById: mongoose.Schema.Types.ObjectId, markedByName: { type: String, default: '' }, markedAt: Date, note: { type: String, default: '' },
}, { timestamps: true });
schema.index({ drillId: 1, kind: 1, refId: 1 }, { unique: true });
schema.index({ schoolId: 1, drillId: 1, classId: 1 });
schema.index({ drillId: 1, status: 1 });
module.exports = mongoose.model('MusterRecord', schema);
