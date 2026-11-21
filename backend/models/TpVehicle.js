const mongoose = require('../lib/pgdoc');

// A school vehicle (PRD E22). The plate decides identity; a failed critical inspection puts it on hold so no trip can start with it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  plate: { type: String, required: true, trim: true }, plateKey: { type: String, required: true },
  label: { type: String, default: '' }, kind: { type: String, enum: ['bus', 'van', 'other'], default: 'bus' },
  capacity: { type: Number, required: true, min: 1, max: 120 },
  status: { type: String, enum: ['active', 'inspection_hold', 'retired'], default: 'active' },
  holdReason: { type: String, default: '' }, holdSince: { type: Date, default: null },
  fitnessExpiry: { type: String, default: '' }, insuranceExpiry: { type: String, default: '' },
  lastInspectionOn: { type: String, default: '' }, nextInspectionDue: { type: String, default: '' },
  assetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, plateKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('TpVehicle', schema);
