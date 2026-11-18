const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, startTime: { type: String, required: true }, endTime: { type: String, required: true }, breakMinutes: { type: Number, default: 0 },
  hours: { type: Number, default: 0 }, isActive: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ schoolId: 1, isActive: 1 });
module.exports = mongoose.model('Shift', schema);
