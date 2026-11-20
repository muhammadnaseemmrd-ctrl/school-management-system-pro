const mongoose = require('../lib/pgdoc');
// A concern from a student (named or anonymous), a parent or a member of staff (PRD E21: anonymous bullying reporting).
// An anonymous report stores no person at all; the reporter keeps a receipt code and only its hash is stored.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  source: { type: String, enum: ['student', 'parent', 'staff', 'anonymous'], required: true },
  category: { type: String, enum: ['bullying', 'safety', 'wellbeing', 'health', 'other'], default: 'other' },
  body: { type: String, required: true }, aboutStudentId: { type: mongoose.Schema.Types.ObjectId, default: null }, aboutName: { type: String, default: '' },
  reporterId: { type: mongoose.Schema.Types.ObjectId, default: null }, reporterRole: { type: String, default: '' }, reporterName: { type: String, default: '' },
  receiptHash: { type: String, default: '' }, urgent: { type: Boolean, default: false },
  status: { type: String, enum: ['New', 'Triaged', 'Case', 'Dismissed'], default: 'New' }, caseId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reply: { type: String, default: '' }, repliedAt: Date, triagedByName: { type: String, default: '' }, triagedAt: Date, escalatedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, receiptHash: 1 }, { unique: true });
schema.index({ schoolId: 1, reporterId: 1, createdAt: -1 });
module.exports = mongoose.model('CareReport', schema);
