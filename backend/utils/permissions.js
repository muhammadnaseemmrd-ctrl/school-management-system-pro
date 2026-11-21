// Permission fabric (PRD E01). One place answers "may this person do this, here, now?".
// Role defaults come from the catalog; anything beyond a role default needs a scoped, time-limited grant.
const mongoose = require('../lib/pgdoc');
const PermissionGrant = require('../models/PermissionGrant');
const Campus = require('./campus');

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
  'care.case.work': { label: 'Work support cases (pastoral lead, counsellor, special-needs coordinator)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a pastoral lead needs a time-limited grant. Cases marked confidential stay inside their circle.' },
  'care.safeguarding.lead': { label: 'Designated safeguarding lead (read and decide confidential safeguarding and bullying cases)', scope: 'school', defaults: ['admin'], grantable: true, breakGlass: true, implemented: true,
    rule: 'Administrators by default. Anyone else needs a granted window, or a two-person break-glass for one case. Every read is recorded.' },
  'care.health.manage': { label: 'Run the sick bay (health plans, medication log, incidents)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'A school nurse needs a time-limited grant. Teachers only see emergency alerts for children they teach.' },
  'care.counsel': { label: 'Counsel students (private session notes, appointments)', scope: 'school', defaults: [], grantable: true, implemented: true,
    rule: 'Nobody has it by default. Session notes stay with the counsellor who wrote them; they are never shown to parents or other staff.' },
  'care.privacy.manage': { label: 'Answer privacy requests about student care data', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Access requests exclude safeguarding records and anything about other people. Erasure is refused while a legal hold applies.' },
  'finances.receipt.approve': { label: 'Approve or reject a payment proof', scope: 'school', defaults: ['admin'], grantable: false, implemented: true,
    rule: 'Parents and students can send proofs but never approve them.' },
  'people.write': { label: 'Create and edit people', scope: 'school', defaults: ['admin'], grantable: false, implemented: true,
    rule: 'School admins only. Teachers and families have no write access to people records.' },
  'platform.billing.manage': { label: 'Manage platform billing and agents', scope: 'platform', defaults: ['superadmin'], grantable: false, implemented: true,
    rule: 'Platform owner only. Has no implicit access to learner records inside a school.' },
  'finances.journal.post': { label: 'Post a journal entry', scope: 'school', defaults: [], grantable: false, implemented: false, rule: 'Planned: balanced journal plus explicit approval.' },
  'hr.payroll.finalize': { label: 'Finalize payroll', scope: 'school', defaults: ['admin'], grantable: false, implemented: true, rule: 'The person who prepared a payroll run can never finalize it. Unreviewed deduction rules block finalizing.' },
  'documents.issue': { label: 'Issue an official document (ID cards, certificates, report cards, receipts)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a registrar needs a time-limited grant. An issued document never changes: a mistake is revoked and reissued, and every issue is recorded with its serial number.' },
  'documents.template.manage': { label: 'Design and change document templates', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Drafts can change; a new version goes live only when a different administrator approves it. Documents already issued keep the design they were printed with.' },
  'documents.print': { label: 'Print documents and run print batches', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'A print officer can print and report printer problems, but cannot issue, revoke or change designs.' },
  'library.desk.operate': { label: 'Run the library desk (issue, return, fines, textbooks)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a librarian needs a time-limited grant. Fines come from the published policy and can only be waived by an administrator with a reason.' },
  'store.till.operate': { label: 'Sell at the school store till (sales, stock in, counts)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a store cashier needs a time-limited grant and a till assigned to them. A cashier can never approve their own refund or their own stock count.' },
  'store.refund.approve': { label: 'Approve a store refund or a stock count', scope: 'school', defaults: ['admin'], grantable: false, implemented: true,
    rule: 'Administrators only, and never the person who made the sale, the request or the count (a school with one administrator may approve its own and the record says so).' },
  'procure.officer': { label: 'Work in the purchasing office (suppliers, quotes, orders, goods received, bills, asset register)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a purchasing officer needs a time-limited grant. An officer can never approve a request, a budget, a bank change or a payment, and never approves their own work.' },
  'transport.manage': { label: 'Manage transport (vehicles, drivers, routes, stops, riders, inspections)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a transport manager needs a time-limited grant. A vehicle that fails a critical inspection cannot start a trip until a later inspection passes.' },
  'transport.dispatch': { label: 'Dispatch school buses (today\'s trips, boarding, exceptions, incidents)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a dispatcher needs a time-limited grant. Sees routes and riders only: no counselling, health or safeguarding records. Vehicle location exists only while a trip is active.' },
  'procure.request': { label: 'Raise purchase requests for a department', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Any teacher can report a fault; raising a request needs a time-limited grant. A requester sees only their own requests and can never approve them.' },
  'accounts.prepare': { label: 'Keep the school\'s books (draft journals, chart of accounts, budgets, bank reconciliations)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; an accountant needs a time-limited grant. An accountant can prepare and submit but never post their own journal, approve their own budget, close a month or sign their own reconciliation.' },
  'accounts.approve': { label: 'Approve and post journals, approve budgets, close months and sign reconciliations', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a finance controller needs a time-limited grant. Never for something they prepared themselves (a school with one administrator may, and the record says so).' },
  'accounts.audit': { label: 'Read the school\'s ledger, statements and trails (no changes)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; an auditor needs a time-limited grant. Read only: journals, ledger, statements, fund and grant reports, trails and exports.' },
  'analytics.lead': { label: 'See whole-school attendance and learning measures (curriculum lead)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a curriculum lead needs a time-limited grant. Read only, learning and attendance only: no fees, staff or help-desk figures, and groups smaller than the school\'s minimum stay hidden. Without it a teacher sees only their own classes.' },
  'ai.review': { label: 'Check and approve writing the assistant drafted (curriculum lead)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators by default; a curriculum lead needs a time-limited grant. May approve assistant notices and question sets written by someone else and approve teaching sources. Never for their own draft (a school with one administrator may, and the record says so). Every approval is kept.' },
  'alumni.lead': { label: 'Look after the alumni list, events and campaigns (alumni lead)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators of the whole school by default; an alumni lead needs a time-limited grant. Contact details are visible only for graduates who agreed; no current-student records.' },
  'giving.officer': { label: 'Record pledges and gifts and spend restricted donor funds', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators of the whole school by default; a fund officer needs a time-limited grant. A restricted fund can only be spent on what its donors allowed, and never approved by the person who asked.' },
  'quality.lead': { label: 'Run accreditation evidence, review cycles and audit findings (quality lead)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators of the whole school by default; a quality lead needs a time-limited grant. Evidence is reviewed by someone other than who submitted it; findings are closed by someone other than their owner.' },
  'security.lead': { label: 'Lead security pilots, incident evidence and exports (security lead)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators of the whole school by default. A pilot needs an approved written plan, and exporting evidence needs two different approvers.' },
  'security.dpo': { label: 'Approve security pilots and hold or release evidence (data protection officer)', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators of the whole school by default. Checks the purpose, legal basis, retention and the manual alternative before a device is switched on.' },
  'security.operate': { label: 'See device health and signals held for review', scope: 'school', defaults: ['admin'], grantable: true, implemented: true,
    rule: 'Administrators of the whole school by default. Sees device status and held signals, not incident evidence.' },
};
const MAX_GRANT_DAYS = 90;
const MAX_BREAK_GLASS_MIN = 60;
const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const liveGrant = (g, at) => !g.revokedAt && new Date(g.validFrom) <= at && new Date(g.validTo) > at;

// -> { allowed, via: 'role' | 'grant' | 'break-glass' | null, grantId }
async function can(user, action, { classId = null, campusId = null, at = new Date() } = {}) {
  const def = CATALOG[action];
  if (!user || !def) return { allowed: false, via: null };
  if (def.defaults.includes(user.role)) {
    // a campus admin's role default stops at the edge of their campuses (deny cross-campus by default)
    if (user.role === 'admin') {
      const sc = await Campus.scopeOf(user);
      if (sc && ((classId && !sc.classIds.has(String(classId))) || (campusId && !sc.campusIds.includes(String(campusId))))) return { allowed: false, via: null, reason: 'campus' };
    }
    return { allowed: true, via: 'role' };
  }
  if (!def.grantable || !user.schoolId || !oid(user.userId)) return { allowed: false, via: null };
  const grants = (await PermissionGrant.find({ schoolId: oid(user.schoolId), granteeId: oid(user.userId), action })).filter((g) => liveGrant(g, at));
  // a grant tied to a campus only works for things in that campus; the campus of a class is looked up only when needed
  let where = campusId ? String(campusId) : null;
  if (!where && classId && grants.some((g) => g.campusId)) where = await Campus.campusOfClass(user.schoolId, classId);
  const hit = grants.filter((g) => (!g.classId || (classId && String(g.classId) === String(classId))) && (!g.campusId || (where && String(g.campusId) === where)))
    .sort((a, b) => (a.classId ? 0 : a.campusId ? 1 : 2) - (b.classId ? 0 : b.campusId ? 1 : 2))[0];
  return hit ? { allowed: true, via: hit.source, grantId: hit._id } : { allowed: false, via: null };
}

module.exports = { CATALOG, MAX_GRANT_DAYS, MAX_BREAK_GLASS_MIN, can, liveGrant };
