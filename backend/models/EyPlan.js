const mongoose = require('../lib/pgdoc');
// A small-group activity planned for one room and day, with who is in the group and what came of it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, roomId: { type: mongoose.Schema.Types.ObjectId, required: true }, day: { type: String, required: true },
  slot: { type: String, enum: ['Morning', 'Midday', 'Afternoon'], default: 'Morning' }, groupName: { type: String, default: '' },
  childIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }], activityRef: { type: String, required: true }, activityTitle: { type: String, default: '' }, areaKey: { type: String, default: '' },
  staffId: mongoose.Schema.Types.ObjectId, staffName: { type: String, default: '' }, note: { type: String, default: '' },
  status: { type: String, enum: ['Planned', 'Done', 'Skipped'], default: 'Planned' }, outcome: { type: String, default: '' }, doneAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, roomId: 1, day: 1 });
module.exports = mongoose.model('EyPlan', schema);
