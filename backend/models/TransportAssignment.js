const mongoose = require('../lib/pgdoc');

const transportAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    pickupPoint: { type: String, default: '' },
  },
  { timestamps: true }
);
transportAssignmentSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('TransportAssignment', transportAssignmentSchema);
