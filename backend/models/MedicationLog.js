const mongoose = require('../lib/pgdoc');
// One dose given, refused or missed (PRD E21: MedicationLog). A slot can be recorded once per day.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  medId: { type: mongoose.Schema.Types.ObjectId, required: true }, medName: { type: String, default: '' }, dose: { type: String, default: '' },
  day: { type: String, required: true }, slot: { type: String, default: '' }, status: { type: String, enum: ['given', 'refused', 'missed', 'withheld'], required: true },
  at: { type: Date, default: Date.now }, byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' }, note: { type: String, default: '' }, parentNotified: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, medId: 1, day: 1, slot: 1 }, { unique: true });
schema.index({ schoolId: 1, day: 1, status: 1 });
module.exports = mongoose.model('MedicationLog', schema);
