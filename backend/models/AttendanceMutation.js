const mongoose = require('../lib/pgdoc');
// A queued offline write is applied once: its client-made id is claimed here and a replay gets the first answer (PRD E08, CAP-0373).
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, required: true }, mutationId: { type: String, required: true },
  userId: { type: ObjectId }, route: { type: String, default: '' },
  state: { type: String, enum: ['Running', 'Done'], default: 'Running' },
  status: { type: Number, default: 0 }, body: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });
s.index({ schoolId: 1, mutationId: 1 }, { unique: true });
s.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 3600 });
module.exports = mongoose.model('AttendanceMutation', s);
