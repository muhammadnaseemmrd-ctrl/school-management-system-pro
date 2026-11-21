const mongoose = require('../lib/pgdoc');

// Something that went wrong on or around a trip, or a family's route-safety concern (PRD E22).
const KINDS = ['breakdown', 'accident', 'medical', 'delay', 'route_change', 'child_missing', 'behaviour', 'vehicle_fault', 'family_concern', 'other'];
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  incidentNo: { type: String }, tripId: { type: mongoose.Schema.Types.ObjectId, default: null }, routeName: { type: String, default: '' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, default: null }, vehiclePlate: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, default: null }, studentName: { type: String, default: '' },
  kind: { type: String, enum: KINDS, required: true }, severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  note: { type: String, required: true }, reportedByKind: { type: String, default: 'staff' }, reportedByName: { type: String, default: '' },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
  resolution: { type: String, default: '' }, familiesTold: { type: Boolean, default: false },
  keepPositions: { type: Boolean, default: false },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, incidentNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, tripId: 1 });
module.exports = mongoose.model('TpIncident', schema);
module.exports.KINDS = KINDS;
