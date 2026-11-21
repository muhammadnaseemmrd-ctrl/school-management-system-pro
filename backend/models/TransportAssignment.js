const mongoose = require('../lib/pgdoc');

const transportAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    pickupPoint: { type: String, default: '' },
    stopId: { type: mongoose.Schema.Types.ObjectId, default: null },   // the stop on the route (PRD E22); pickupPoint stays as free text
    handoff: { type: String, enum: ['release', 'guardian'], default: 'release' }, // guardian: the child is only handed to an authorised adult at the stop
  },
  { timestamps: true }
);
transportAssignmentSchema.index({ schoolId: 1, studentId: 1 }, { unique: true });
transportAssignmentSchema.index({ schoolId: 1, routeId: 1 });

module.exports = mongoose.model('TransportAssignment', transportAssignmentSchema);
