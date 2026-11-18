const AuditLog = require('../models/AuditLog');

// Append-only. Never throws: an audit problem must not undo the action that was already done.
const audit = async (req, { action, entityType = '', entityId = '', schoolId = null, agentId = null, detail }) => {
  try {
    await AuditLog.create({
      actorId: req?.user?.userId || undefined, actorName: req?.actorName || '', actorRole: req?.user?.role || '',
      action, entityType, entityId: String(entityId || ''), schoolId: schoolId || null, agentId: agentId || null, detail,
    });
  } catch (e) { console.warn('audit failed:', e.message); }
};

module.exports = { audit };
