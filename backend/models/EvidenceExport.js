// A request to hand evidence to someone outside the school, approved by two different people (PRD E34).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  incidentId: { type: ObjectId, required: true }, incidentNo: { type: String, default: '' },
  itemIds: { type: [String], default: [] },
  purpose: { type: String, required: true, maxlength: 400 }, recipient: { type: String, required: true, maxlength: 160 },
  status: { type: String, enum: ['Requested', 'Approved', 'Rejected', 'Fulfilled', 'Expired'], default: 'Requested' },
  requestedById: ObjectId, requestedByName: { type: String, default: '' },
  approvals: { type: [Mixed], default: [] },
  rejection: { type: Mixed, default: null },
  soleAdmin: { type: Boolean, default: false },
  manifest: { type: Mixed, default: null }, manifestHash: { type: String, default: '' }, fulfilledAt: Date, fulfilledByName: { type: String, default: '' },
  rev: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, incidentId: 1 });
module.exports = mongoose.model('EvidenceExport', schema);
