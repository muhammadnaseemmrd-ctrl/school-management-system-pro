const mongoose = require('../lib/pgdoc');
// A two-person break-glass window to read one confidential case (PRD E21 / §12 safeguarding controls).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, caseId: { type: mongoose.Schema.Types.ObjectId, required: true }, caseNumber: { type: String, default: '' },
  requestedById: { type: mongoose.Schema.Types.ObjectId, required: true }, requestedByRole: { type: String, default: '' }, requestedByName: { type: String, default: '' }, reason: { type: String, required: true }, minutes: { type: Number, default: 30 },
  status: { type: String, enum: ['Pending', 'Approved', 'Denied', 'Revoked'], default: 'Pending' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, soleApprover: { type: Boolean, default: false },
  validFrom: Date, validTo: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, caseId: 1, requestedById: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('CareAccess', schema);
