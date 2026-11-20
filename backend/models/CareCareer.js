const mongoose = require('../lib/pgdoc');
// A student's career interests and chosen pathway (PRD E21: CareerPathway). One per student.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  interests: [String], strengths: [String], pathway: { type: String, default: '' }, subjects: [String], nextStep: { type: String, default: '' }, notes: { type: String, default: '' },
  reviewedByName: { type: String, default: '' }, reviewedAt: Date, updatedByRole: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1 }, { unique: true });
module.exports = mongoose.model('CareCareer', schema);
