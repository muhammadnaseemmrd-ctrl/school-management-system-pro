const mongoose = require('../lib/pgdoc');

// The standing plan for one run of a route: which days, when it leaves, which vehicle and driver (PRD E22).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
  direction: { type: String, enum: ['morning', 'afternoon'], required: true },
  startTime: { type: String, required: true }, durationMin: { type: Number, required: true, min: 5, max: 600 },
  days: [Number], vehicleId: { type: mongoose.Schema.Types.ObjectId, default: null }, driverId: { type: mongoose.Schema.Types.ObjectId, default: null },
  escortName: { type: String, default: '' }, status: { type: String, enum: ['active', 'paused'], default: 'active' },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, routeId: 1, direction: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('TpPlan', schema);
