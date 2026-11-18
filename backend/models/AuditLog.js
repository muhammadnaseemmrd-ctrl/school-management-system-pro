const mongoose = require('../lib/pgdoc');

// Who did what, for money and access changes. Append-only.
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    action: { type: String, required: true }, // e.g. payment.record, agent.link, commission.approve, payout.record
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    schoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    detail: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ agentId: 1, createdAt: -1 });
auditLogSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
