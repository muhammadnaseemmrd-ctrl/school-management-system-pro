const mongoose = require('../lib/pgdoc');
// A carer who is in a room (counted for the staff-to-child ratio). Leaving closes the row.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, roomId: { type: mongoose.Schema.Types.ObjectId, required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, required: true }, staffName: { type: String, default: '' },
  day: { type: String, required: true }, inAt: { type: Date, default: Date.now }, outAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, roomId: 1, outAt: 1 });
schema.index({ schoolId: 1, staffId: 1, outAt: 1 });
module.exports = mongoose.model('EyPresence', schema);
