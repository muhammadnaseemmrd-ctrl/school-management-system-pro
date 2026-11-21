const mongoose = require('../lib/pgdoc');

// Everything done on a trip, append-only. A repeat of the same clientKey is the same action, so a phone that was offline can send again safely (PRD E22).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, required: true }, kind: { type: String, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, default: null }, stopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  at: { type: Date, required: true }, late: { type: Boolean, default: false }, clientKey: { type: String },
  byKind: { type: String, enum: ['driver', 'staff', 'system'], default: 'driver' }, byName: { type: String, default: '' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
schema.index({ schoolId: 1, tripId: 1, clientKey: 1 }, { unique: true });
schema.index({ tripId: 1, at: 1 });
module.exports = mongoose.model('TpEvent', schema);
