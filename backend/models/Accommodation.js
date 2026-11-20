const mongoose = require('../lib/pgdoc');
// An agreed adjustment for a student with special needs (PRD E21: Accommodation). It must be approved by a person other than the one who proposed it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' }, classId: { type: mongoose.Schema.Types.ObjectId, default: null },
  kind: { type: String, enum: ['extra-time', 'reader', 'separate-room', 'assistive-tech', 'seating', 'breaks', 'modified-work', 'other'], required: true },
  detail: { type: String, default: '' }, extraTimePct: { type: Number, default: 0 }, evidence: { type: String, default: '' },
  status: { type: String, enum: ['Proposed', 'Active', 'Declined', 'Ended'], default: 'Proposed' },
  proposedById: mongoose.Schema.Types.ObjectId, proposedByName: { type: String, default: '' }, decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' }, soleApprover: { type: Boolean, default: false },
  validFrom: { type: String, default: '' }, validTo: { type: String, default: '' }, reviewOn: { type: String, default: '' }, endedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, classId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, reviewOn: 1 });
module.exports = mongoose.model('Accommodation', schema);
