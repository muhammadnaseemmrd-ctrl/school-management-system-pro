const mongoose = require('../lib/pgdoc');
// A student's health record and emergency plan (PRD E21: HealthPlan). One per student.
const med = new mongoose.Schema({
  name: { type: String, required: true }, dose: { type: String, default: '' }, times: [String], route: { type: String, default: 'oral' }, instructions: { type: String, default: '' },
  startOn: { type: String, default: '' }, endOn: { type: String, default: '' }, active: { type: Boolean, default: true },
  consentAt: { type: Date, default: null }, consentById: mongoose.Schema.Types.ObjectId, consentByName: { type: String, default: '' }, consentNote: { type: String, default: '' },
}, { _id: true });
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' }, classId: { type: mongoose.Schema.Types.ObjectId, default: null },
  conditions: [{ name: String, severity: { type: String, enum: ['mild', 'moderate', 'severe'], default: 'mild' }, notes: { type: String, default: '' } }],
  allergies: [{ allergen: String, reaction: { type: String, default: '' }, severity: { type: String, enum: ['mild', 'moderate', 'severe'], default: 'mild' } }],
  emergencyPlan: { type: String, default: '' }, diet: { type: String, default: '' }, doctorName: { type: String, default: '' }, doctorPhone: { type: String, default: '' },
  alert: { type: Boolean, default: false }, // a teacher-visible alert exists (any severe item or an emergency plan)
  medications: [med],
  proposal: { data: mongoose.Schema.Types.Mixed, byId: mongoose.Schema.Types.ObjectId, byName: String, at: Date }, // a parent's change waiting for the nurse
  verifiedAt: Date, verifiedByName: { type: String, default: '' }, updatedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1 }, { unique: true });
schema.index({ schoolId: 1, classId: 1, alert: 1 });
module.exports = mongoose.model('HealthPlan', schema);
