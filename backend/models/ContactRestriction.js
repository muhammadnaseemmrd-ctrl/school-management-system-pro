const mongoose = require('../lib/pgdoc');

// A court order, safety plan or school decision that limits one adult's access to one child.
// It always wins over a guardian link and over convenience. Effective-dated, never deleted.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent' },
  personName: { type: String, default: '', trim: true },
  type: { type: String, enum: ['no-access', 'no-contact', 'no-pickup', 'no-fees'], required: true },
  reason: { type: String, default: '' },          // internal only, never shown to teachers, gate staff or families
  referenceNo: { type: String, default: '' },     // court order / case number
  validFrom: { type: Date, default: Date.now },
  validTo: { type: Date, default: null },
  endedReason: { type: String, default: '' },
  createdBy: mongoose.Schema.Types.ObjectId,
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, validFrom: -1 });
schema.index({ schoolId: 1, parentId: 1 });
schema.index({ schoolId: 1, validTo: 1 });

module.exports = mongoose.model('ContactRestriction', schema);
