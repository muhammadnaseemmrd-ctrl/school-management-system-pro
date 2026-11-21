const mongoose = require('../lib/pgdoc');

// A vehicle position sent by the driver's phone during an active trip (PRD E22). Never a child's phone. Removed when the trip ends unless an incident needs it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, required: true },
  lat: { type: Number, required: true }, lng: { type: Number, required: true }, speedKmh: { type: Number, default: 0 }, at: { type: Date, required: true },
}, { timestamps: true });
schema.index({ tripId: 1, at: 1 });
module.exports = mongoose.model('TpPing', schema);
