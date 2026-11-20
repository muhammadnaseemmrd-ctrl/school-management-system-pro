const mongoose = require('../lib/pgdoc');
// A room's visual timetable: the same steps in the same order, with pictures, so children know what comes next. Only the room's staff change it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, roomId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, trim: true }, active: { type: Boolean, default: true }, shareWithFamilies: { type: Boolean, default: true },
  steps: [{ at: String, icon: String, label: String, labelUr: String, minutes: Number }],
  byName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, roomId: 1, active: 1 });
module.exports = mongoose.model('EyRoutine', schema);
