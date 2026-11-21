const mongoose = require('../lib/pgdoc');

// A vehicle safety inspection (PRD E22). A failed critical item holds the vehicle until a later inspection passes.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, required: true }, vehiclePlate: { type: String, default: '' },
  kind: { type: String, enum: ['routine', 'annual', 'after_incident'], default: 'routine' },
  items: [{ key: String, label: String, critical: Boolean, result: { type: String, enum: ['pass', 'fail', 'na'] }, note: String }],
  result: { type: String, enum: ['pass', 'fail'], required: true }, failedCritical: { type: Number, default: 0 },
  doneOn: { type: String, required: true }, nextDue: { type: String, default: '' },
  inspectorName: { type: String, required: true }, byId: { type: mongoose.Schema.Types.ObjectId, default: null }, notes: { type: String, default: '' },
  ticketNo: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, vehicleId: 1, doneOn: -1 });
module.exports = mongoose.model('TpInspection', schema);
