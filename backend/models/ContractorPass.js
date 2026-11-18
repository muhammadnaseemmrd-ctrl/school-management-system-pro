const mongoose = require('../lib/pgdoc');
// A security or maintenance contractor who may enter only inside a short window, through named gates and devices (PRD E09, CAP-0367).
// Created by one admin, activated by another.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  company: { type: String, required: true, trim: true },
  personName: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  purpose: { type: String, required: true, trim: true },
  validFrom: { type: Date, required: true }, validTo: { type: Date, required: true },
  gates: [String],                       // empty = any gate
  deviceIds: [{ type: mongoose.Schema.Types.ObjectId }],   // empty = any reader or the desk
  status: { type: String, enum: ['Pending', 'Active', 'Revoked', 'Declined'], default: 'Pending' },
  inside: { type: Boolean, default: false }, lastInAt: Date, lastOutAt: Date,
  tokenHash: { type: String, default: '' },
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  revokedReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, validTo: -1 });
schema.index({ schoolId: 1, tokenHash: 1 });
schema.index({ schoolId: 1, inside: 1 });
module.exports = mongoose.model('ContractorPass', schema);
