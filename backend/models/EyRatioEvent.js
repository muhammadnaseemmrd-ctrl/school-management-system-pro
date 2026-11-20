const mongoose = require('../lib/pgdoc');
// A period when a room had more children than its policy allows for the carers present (CAP-0272). Counts only: no child is named.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, roomId: { type: mongoose.Schema.Types.ObjectId, required: true }, roomName: { type: String, default: '' },
  kind: { type: String, enum: ['ratio', 'capacity'], required: true }, day: { type: String, required: true },
  startedAt: { type: Date, default: Date.now }, endedAt: { type: Date, default: null }, children: Number, staff: Number, allowedChildren: Number, capacity: Number,
  ackById: mongoose.Schema.Types.ObjectId, ackByName: { type: String, default: '' }, ackAt: Date, note: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, roomId: 1, endedAt: 1 });
schema.index({ schoolId: 1, day: -1 });
module.exports = mongoose.model('EyRatioEvent', schema);
