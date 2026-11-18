const mongoose = require('../lib/pgdoc');

// Effective-dated discount rule (scholarship, concession, sibling). Active only after a second person approves it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['concession', 'scholarship', 'sibling'], required: true },
  valueType: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 1 },
  appliesTo: { type: String, enum: ['tuition', 'all'], default: 'tuition' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  siblingFrom: { type: Number, default: 2 },
  validFrom: { type: Date, default: Date.now },
  validTo: { type: Date, default: null },
  status: { type: String, enum: ['Pending', 'Active', 'Rejected', 'Ended'], default: 'Pending' },
  reason: { type: String, default: '' },
  createdBy: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  decidedBy: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, validFrom: -1 });
schema.index({ schoolId: 1, studentId: 1 });

module.exports = mongoose.model('FeeRule', schema);
