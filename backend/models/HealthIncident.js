const mongoose = require('../lib/pgdoc');
// A sick bay visit or injury (PRD E21: HealthIncident).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' }, classId: { type: mongoose.Schema.Types.ObjectId, default: null },
  kind: { type: String, enum: ['illness', 'injury', 'allergy', 'medication', 'other'], default: 'illness' }, at: { type: Date, default: Date.now }, day: { type: String, default: '' },
  symptoms: { type: String, default: '' }, action: { type: String, default: '' }, temperatureC: { type: Number, default: null },
  outcome: { type: String, enum: ['returned', 'rested', 'sent-home', 'ambulance'], default: 'returned' }, parentNotifiedAt: Date, followUp: { type: String, default: '' },
  loggedById: mongoose.Schema.Types.ObjectId, loggedByName: { type: String, default: '' }, loggedByRole: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, at: -1 });
schema.index({ schoolId: 1, day: 1 });
module.exports = mongoose.model('HealthIncident', schema);
