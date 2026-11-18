const mongoose = require('../lib/pgdoc');
// Documents (licences, certificates), training and appraisals. Private to HR and the employee.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  kind: { type: String, enum: ['document', 'training', 'appraisal'], required: true },
  title: { type: String, required: true }, issuedOn: Date, expiresOn: Date, mandatory: { type: Boolean, default: false },
  goals: [{ text: String }], goalsConsented: { type: Boolean, default: false }, rating: { type: Number, min: 1, max: 5 }, reviewerNotes: { type: String, default: '' },
  employeeResponse: { type: String, default: '' }, employeeRespondedAt: Date, reviewedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, employeeId: 1, kind: 1 });
schema.index({ schoolId: 1, expiresOn: 1 });
module.exports = mongoose.model('EmployeeRecord', schema);
