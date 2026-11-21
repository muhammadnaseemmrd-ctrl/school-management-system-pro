// A person's challenge to how a device signal or evidence was used, decided by someone who was not part of the original decision (PRD E34).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  no: { type: String, required: true },
  requesterType: { type: String, enum: ['student', 'parent', 'staff'], required: true }, requesterId: ObjectId, requesterName: { type: String, default: '' },
  studentId: { type: ObjectId, default: null },
  about: { type: String, enum: ['signal', 'incident', 'other'], default: 'signal' }, aboutId: { type: String, default: '' },
  statement: { type: String, required: true, maxlength: 1500 },
  originalById: { type: ObjectId, default: null }, originalByName: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'Upheld', 'Rejected'], default: 'Open' },
  decidedById: ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decision: { type: String, default: '' }, soleAdmin: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, no: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, requesterId: 1 });
module.exports = mongoose.model('SecurityAppeal', schema);
