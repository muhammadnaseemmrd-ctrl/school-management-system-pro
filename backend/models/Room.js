const mongoose = require('../lib/pgdoc');
// A place a lesson can be held. The name is what appears on a timetable period.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, nameKey: { type: String, required: true },
  kind: { type: String, enum: ['Classroom', 'Lab', 'Library', 'Hall', 'Sports', 'Computer', 'Other'], default: 'Classroom' },
  capacity: { type: Number, default: 40 }, equipment: { type: [String], default: [] },
  homeClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, notes: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ schoolId: 1, nameKey: 1 }, { unique: true });
schema.index({ schoolId: 1, active: 1, kind: 1 });
module.exports = mongoose.model('Room', schema);
