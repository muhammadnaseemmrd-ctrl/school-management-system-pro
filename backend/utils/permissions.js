// Permission fabric (PRD E01). One place answers "may this person do this, here, now?".
// Role defaults come from the catalog; anything beyond a role default needs a scoped, time-limited grant.
const mongoose = require('../lib/pgdoc');
const PermissionGrant = require('../models/PermissionGrant');

// implemented: true = enforced somewhere in the product today
const CATALOG = {
  'academics.attendance.mark': { label: 'Take attendance for a class', scope: 'class', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Class head master by default. A cover teacher needs a grant for that class and those dates. Corrections to old dates stay with admins.' },
  'safety.pickup.verify': { label: 'Check who may collect a child at the gate', scope: 'school', defaults: ['admin', 'teacher'], grantable: false, implemented: true,
    rule: 'A refusal never says why, and always asks staff to involve a person. Every check is recorded.' },
  'safety.gate.operate': { label: 'Run the gate desk (visitors, contractors, dismissal, guard logbook)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default. A teacher on gate duty needs a time-limited grant. Every admission, refusal and release is recorded.' },
  'safety.pickup.override': { label: 'Release a child in an emergency without a second person', scope: 'school', defaults: ['admin'], grantable: false, implemented: true,
    rule: 'Never works for a person with a restriction. Needs a written reason, tells every administrator, and must be reviewed by a different administrator.' },
  'safeguarding.case.read': { label: 'Read restriction reasons and court references', scope: 'school', defaults: [], grantable: true, breakGlass: true, implemented: true,
    rule: 'Nobody has it by default. Needs a granted window or an emergency break-glass. Every read is recorded.' },
  'finances.receipt.approve': { label: 'Approve or reject a payment proof', scope: 'school', defaults: ['admin'], grantable: false, implemented: true,
    rule: 'Parents and students can send proofs but never approve them.' },
  'people.write': { label: 'Create and edit people', scope: 'school', defaults: ['admin'], grantable: false, implemented: true,
    rule: 'School admins only. Teachers and families have no write access to people records.' },
  'platform.billing.manage': { label: 'Manage platform billing and agents', scope: 'platform', defaults: ['superadmin'], grantable: false, implemented: true,
    rule: 'Platform owner only. Has no implicit access to learner records inside a school.' },
  'finances.journal.post': { label: 'Post a journal entry', scope: 'school', defaults: [], grantable: false, implemented: false, rule: 'Planned: balanced journal plus explicit approval.' },
  'hr.payroll.finalize': { label: 'Finalize payroll', scope: 'school', defaults: ['admin'], grantable: false, implemented: true, rule: 'The person who prepared a payroll run can never finalize it. Unreviewed deduction rules block finalizing.' },
  'documents.issue': { label: 'Issue an official document', scope: 'school', defaults: [], grantable: false, implemented: false, rule: 'Planned: issued documents are immutable; revoke and reissue.' },
};
const MAX_GRANT_DAYS = 90;
const MAX_BREAK_GLASS_MIN = 60;
const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const liveGrant = (g, at) => !g.revokedAt && new Date(g.validFrom) <= at && new Date(g.validTo) > at;

// -> { allowed, via: 'role' | 'grant' | 'break-glass' | null, grantId }
async function can(user, action, { classId = null, at = new Date() } = {}) {
  const def = CATALOG[action];
  if (!user || !def) return { allowed: false, via: null };
  if (def.defaults.includes(user.role)) return { allowed: true, via: 'role' };
  if (!def.grantable || !user.schoolId || !oid(user.userId)) return { allowed: false, via: null };
  const grants = await PermissionGrant.find({ schoolId: oid(user.schoolId), granteeId: oid(user.userId), action });
  const hit = grants.filter((g) => liveGrant(g, at) && (!g.classId || (classId && String(g.classId) === String(classId))))
    .sort((a, b) => (a.classId ? 0 : 1) - (b.classId ? 0 : 1))[0];
  return hit ? { allowed: true, via: hit.source, grantId: hit._id } : { allowed: false, via: null };
}

module.exports = { CATALOG, MAX_GRANT_DAYS, MAX_BREAK_GLASS_MIN, can, liveGrant };
