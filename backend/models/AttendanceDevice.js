const mongoose = require('../lib/pgdoc');
// A gate reader or classroom scanner that sends authenticated events (PRD E08, CAP-0375/0376). Only a hash of its key is stored.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  name: { type: String, required: true }, kind: { type: String, enum: ['gate', 'classroom'], default: 'gate' },
  location: { type: String, default: '' },
  keyHash: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Disabled'], default: 'Active' },
  lastSeenAt: { type: Date, default: null }, lastEventAt: { type: Date, default: null }, driftSeconds: { type: Number, default: 0 },
  createdBy: { type: ObjectId },
}, { timestamps: true });
s.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('AttendanceDevice', s);
