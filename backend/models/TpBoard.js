const mongoose = require('../lib/pgdoc');

// One child on one trip (PRD E22): expected, boarded, handed over, or the reason they did not ride.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, default: '' }, className: { type: String, default: '' }, stopId: { type: mongoose.Schema.Types.ObjectId, default: null }, stopName: { type: String, default: '' },
  handoff: { type: String, enum: ['release', 'guardian'], default: 'release' },
  state: { type: String, enum: ['expected', 'boarded', 'alighted', 'no_show', 'opted_out', 'absent', 'exception'], default: 'expected' },
  boardedAt: { type: Date, default: null }, alightedAt: { type: Date, default: null }, alightedStopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  handedTo: { kind: String, name: String, parentId: mongoose.Schema.Types.ObjectId, code: String },
  exception: { kind: { type: String, default: '' }, note: { type: String, default: '' }, resolved: { type: Boolean, default: false }, resolvedBy: { type: String, default: '' }, resolvedAt: Date, resolution: { type: String, default: '' } },
  source: { type: String, default: '' },
}, { timestamps: true });
schema.index({ tripId: 1, studentId: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
schema.index({ schoolId: 1, state: 1, 'exception.resolved': 1 });
module.exports = mongoose.model('TpBoard', schema);
