const mongoose = require('../lib/pgdoc');

// One run of a route on one day (PRD E22). Location is only kept while the trip is active.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  tripKey: { type: String, required: true },
  routeId: { type: mongoose.Schema.Types.ObjectId, required: true }, routeName: { type: String, default: '' },
  planId: { type: mongoose.Schema.Types.ObjectId, default: null },
  direction: { type: String, enum: ['morning', 'afternoon'], required: true }, date: { type: String, required: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, default: null }, vehiclePlate: { type: String, default: '' }, capacity: { type: Number, default: 0 },
  driverId: { type: mongoose.Schema.Types.ObjectId, default: null }, driverName: { type: String, default: '' }, escortName: { type: String, default: '' },
  status: { type: String, enum: ['scheduled', 'checked', 'active', 'completed', 'cancelled', 'missed'], default: 'scheduled' },
  plannedStart: { type: Date, required: true }, plannedEnd: { type: Date, required: true },
  startedAt: { type: Date, default: null }, endedAt: { type: Date, default: null },
  stops: [{ stopId: mongoose.Schema.Types.ObjectId, name: String, seq: Number, lat: Number, lng: Number, plannedAt: Date, arrivedAt: Date, departedAt: Date, etaAt: Date, lateNotified: Boolean, approachNotified: Boolean }],
  checklist: { items: [{ key: String, label: String, critical: Boolean, ok: Boolean, note: String }], doneAt: Date, byName: String },
  counts: { expected: { type: Number, default: 0 }, boarded: { type: Number, default: 0 }, alighted: { type: Number, default: 0 }, noShow: { type: Number, default: 0 }, optedOut: { type: Number, default: 0 }, exceptions: { type: Number, default: 0 } },
  lastPos: { lat: Number, lng: Number, speedKmh: Number, at: Date },
  delayMin: { type: Number, default: 0 },
  emptyCheck: { done: { type: Boolean, default: false }, at: Date, byName: String, count: Number },
  closeNote: { type: String, default: '' }, unreconciled: { type: Number, default: 0 }, cancelReason: { type: String, default: '' },
  positionsPurgedAt: { type: Date, default: null },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, tripKey: 1 }, { unique: true });
schema.index({ schoolId: 1, date: 1, status: 1 });
schema.index({ schoolId: 1, driverId: 1, date: 1 });
schema.index({ schoolId: 1, status: 1, endedAt: 1 });
module.exports = mongoose.model('TpTrip', schema);
