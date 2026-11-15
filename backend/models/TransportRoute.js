const mongoose = require('../lib/pgdoc');

const transportRouteSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },       // e.g. "Route 1 - Bahria Town"
    monthlyFee: { type: Number, required: true, min: 0 },
    vehicle: { type: String, default: '' },
    driverName: { type: String, default: '' },
    driverPhone: { type: String, default: '' },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
transportRouteSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('TransportRoute', transportRouteSchema);
