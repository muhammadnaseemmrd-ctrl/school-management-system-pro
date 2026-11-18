const mongoose = require('../lib/pgdoc');
// One visit by one outsider (PRD E09, CAP-0349..0351). Invited or walk-in, approved by the host, scanned or checked in by the desk.
// Only the ID type and the last four characters are ever kept, and those are wiped after the retention period.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  visitorName: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  organisation: { type: String, default: '' },
  kind: { type: String, enum: ['Parent', 'Guest', 'Vendor', 'Official', 'Interview'], default: 'Guest' },
  purpose: { type: String, required: true, trim: true },
  hostType: { type: String, enum: ['teacher', 'admin', 'office'], default: 'office' },
  hostId: { type: mongoose.Schema.Types.ObjectId },
  hostName: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },   // a parent visiting about a child
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', default: null },
  expectedFrom: { type: Date, required: true },
  expectedTo: { type: Date, required: true },
  walkIn: { type: Boolean, default: false },
  status: { type: String, enum: ['Requested', 'Approved', 'CheckedIn', 'CheckedOut', 'Declined', 'Expired', 'Cancelled', 'Refused'], default: 'Requested' },
  createdByRole: { type: String, default: '' }, createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  receptionOverride: { type: Boolean, default: false }, overrideReason: { type: String, default: '' },
  tokenHash: { type: String, default: '' }, tokenExpiresAt: Date, tokenIssuedAt: Date,
  idType: { type: String, default: '' }, idLast4: { type: String, default: '' }, idChecked: { type: Boolean, default: false }, idRedactedAt: Date,
  checkInAt: Date, checkInById: mongoose.Schema.Types.ObjectId, checkInByName: { type: String, default: '' }, checkInMethod: { type: String, enum: ['', 'qr', 'manual'], default: '' }, manualReason: { type: String, default: '' },
  checkOutAt: Date, checkOutByName: { type: String, default: '' }, checkOutMethod: { type: String, default: '' },
  gate: { type: String, default: '' },
  // day and seq stay unset until a badge is issued, so the unique index only ever sees real badges
  badge: { number: { type: String }, day: { type: String }, seq: { type: Number }, zones: [String], expiresAt: Date, printedCount: { type: Number, default: 0 } },
  refusedReason: { type: String, default: '' },
  overstayFlaggedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, expectedFrom: -1 });
schema.index({ schoolId: 1, hostId: 1, status: 1 });
schema.index({ schoolId: 1, createdById: 1, createdAt: -1 });
schema.index({ schoolId: 1, parentId: 1, createdAt: -1 });
schema.index({ schoolId: 1, tokenHash: 1 });
schema.index({ schoolId: 1, 'badge.day': 1, 'badge.seq': 1 }, { unique: true });
schema.index({ schoolId: 1, checkInAt: -1 });
module.exports = mongoose.model('VisitorVisit', schema);
