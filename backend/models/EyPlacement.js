const mongoose = require('../lib/pgdoc');
// Which room a child is in, and since when. Moving a child ends the old row; nothing is deleted.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'EyRoom', required: true },
  from: { type: Date, default: Date.now }, to: { type: Date, default: null },
  byName: { type: String, default: '' }, note: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1, to: 1 });
schema.index({ schoolId: 1, roomId: 1, to: 1 });
module.exports = mongoose.model('EyPlacement', schema);
