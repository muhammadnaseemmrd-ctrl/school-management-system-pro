const mongoose = require('../lib/pgdoc');

// A time-limited, scoped permission given to one person (PRD E01). Never deleted: revoking sets revokedAt.
// source "break-glass" rows are emergency self-grants, always short, always with a reason, and always told to the other admins.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  granteeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  granteeModel: { type: String, enum: ['User', 'Teacher'], required: true },
  granteeName: { type: String, default: '' },
  action: { type: String, required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },   // scope: one class, or empty for the whole school
  className: { type: String, default: '' },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },   // scope: one campus (E01); empty = every campus
  campusName: { type: String, default: '' },
  source: { type: String, enum: ['grant', 'break-glass'], default: 'grant' },
  validFrom: { type: Date, default: Date.now },
  validTo: { type: Date, required: true },
  reason: { type: String, required: true },
  grantedBy: mongoose.Schema.Types.ObjectId,
  grantedByName: { type: String, default: '' },
  revokedAt: { type: Date, default: null },
  revokedByName: { type: String, default: '' },
  revokeReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, granteeId: 1, action: 1, validTo: -1 });
schema.index({ schoolId: 1, createdAt: -1 });
schema.index({ schoolId: 1, source: 1, createdAt: -1 });
schema.index({ schoolId: 1, campusId: 1, validTo: -1 });

module.exports = mongoose.model('PermissionGrant', schema);
