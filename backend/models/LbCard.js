const mongoose = require('../lib/pgdoc');

// A borrower card for a student, a teacher or a member of staff (PRD E18). Made the first time someone borrows or is given one.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  holderType: { type: String, enum: ['student', 'teacher', 'staff'], required: true },
  holderId: { type: mongoose.Schema.Types.ObjectId, required: true }, name: { type: String, default: '' }, classLabel: { type: String, default: '' },
  barcode: { type: String, required: true },
  status: { type: String, enum: ['active', 'blocked', 'closed'], default: 'active' }, blockReason: { type: String, default: '' },
  overrideUntil: { type: Date, default: null }, overrideReason: { type: String, default: '' },     // an admin lets a blocked card borrow once
}, { timestamps: true });
schema.index({ schoolId: 1, barcode: 1 }, { unique: true });
schema.index({ schoolId: 1, holderType: 1, holderId: 1 }, { unique: true });
module.exports = mongoose.model('LbCard', schema);
