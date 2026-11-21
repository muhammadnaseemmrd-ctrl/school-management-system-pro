const mongoose = require('../lib/pgdoc');

// A stop on a route (PRD E22). Order and minutes are for the morning run; the afternoon run goes the other way.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
  seq: { type: Number, required: true, min: 1 }, name: { type: String, required: true, trim: true },
  offsetMin: { type: Number, default: 0, min: 0, max: 600 },
  lat: { type: Number, default: null }, lng: { type: Number, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ routeId: 1, seq: 1 }, { unique: true });
schema.index({ schoolId: 1, routeId: 1, active: 1 });
module.exports = mongoose.model('TpStop', schema);
