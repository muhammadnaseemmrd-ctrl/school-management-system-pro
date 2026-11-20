// Shared rules for student care (PRD E21): who may see what, the access record, break-glass windows, numbering and settings.
const crypto = require('crypto');
const AppSetting = require('../../models/AppSetting');
const Teacher = require('../../models/Teacher');
const User = require('../../models/User');
const Student = require('../../models/Student');
const PermissionGrant = require('../../models/PermissionGrant');
const CareAccess = require('../../models/CareAccess');
const CareAccessLog = require('../../models/CareAccessLog');
const P = require('../permissions');
const E = require('../early/service');
const K = require('../comms/clock');
const C = require('../comms/service');

const { oid, sid, bad, wrap, clean, pg } = E;
const DEFAULTS = {
  escalateHours: 24, reportTriageHours: 24, privacyDays: 30, anonLimitPerDay: 3, trainingMonths: 12,
  reviewDays: { watch: 30, support: 21, intensive: 7 }, breakGlassMinutes: 30, accommodationReviewDays: 180,
};
const deep = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? deep(a[k], b[k]) : b[k]; return o; };
const sCache = new Map();
async function getSettings(schoolId) {
  const k = String(schoolId); const hit = sCache.get(k); if (hit && Date.now() - hit.at < 20000) return hit.v;
  const row = await AppSetting.findOne({ key: `care:${k}` }); const v = deep(DEFAULTS, (row && row.value) || {}); sCache.set(k, { v, at: Date.now() }); return v;
}
async function saveSettings(schoolId, patch) {
  const k = String(schoolId); const row = await AppSetting.findOne({ key: `care:${k}` }); const next = deep((row && row.value) || {}, patch);
  await AppSetting.updateOne({ key: `care:${k}` }, { $set: { value: next } }, { upsert: true }); sCache.delete(k); return getSettings(schoolId);
}
async function nextNumber(schoolId, prefix) {
  const y = new Date().getUTCFullYear(); const key = `care:seq:${prefix}:${schoolId}:${y}`;
  await AppSetting.updateOne({ key }, { $inc: { value: 1 } }, { upsert: true });
  const row = await AppSetting.findOne({ key }); return `${prefix}-${y}-${String(row.value).padStart(4, '0')}`;
}
const today = (schoolId) => E.today(schoolId);
const addDays = (key, n) => K.addDay(key, n);
const isDay = E.isDay;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const SECRET = () => process.env.JWT_SECRET || 'care-dev-secret';
const hmac = (s) => crypto.createHmac('sha256', SECRET()).update(String(s)).digest('hex');

/* ── who is this person, in care terms ── */
async function ctx(req) {
  if (req._care) return req._care;
  const u = req.user; const out = { role: u.role, userId: String(u.userId), name: req.actorName || '', teacher: null, classIds: new Set(), via: {} };
  if (u.role === 'teacher') {
    const t = await Teacher.findOne({ _id: oid(u.userId), schoolId: sid(req) }).select('name classIds classTeacherOf subjectClassAssignments');
    out.teacher = t; if (t) { out.name = out.name || t.name; for (const c of [t.classTeacherOf, ...(t.classIds || []), ...(t.subjectClassAssignments || []).map((a) => a.classId)].filter(Boolean)) out.classIds.add(String(c)); }
  }
  if (u.role === 'admin' || u.role === 'teacher') {
    for (const [k, a] of [['work', 'care.case.work'], ['dsl', 'care.safeguarding.lead'], ['health', 'care.health.manage'], ['counsel', 'care.counsel'], ['privacy', 'care.privacy.manage']]) {
      const r = await P.can(u, a); out[k] = r.allowed; out.via[k] = r.via;
    }
  } else Object.assign(out, { work: false, dsl: false, health: false, counsel: false, privacy: false });
  out.staff = u.role === 'admin' || u.role === 'teacher'; out.admin = u.role === 'admin';
  out.any = out.work || out.dsl || out.health || out.counsel || out.privacy;
  req._care = out; return out;
}
const teachesStudent = (c, student) => !!student.classId && c.classIds.has(String(student.classId));
// A staff member may open a child's record when they hold a care right, or teach the child's class
const canTouch = (c, student) => c.staff && (c.any || teachesStudent(c, student));
const isConfidential = (cat) => cat === 'safeguarding' || cat === 'bullying';

async function studentOf(req, id, select = 'name classId studentId rollNumber gender dateOfBirth') {
  const s = await Student.findOne({ _id: oid(id), schoolId: sid(req) }).select(select); return s;
}
async function className(classId) { if (!classId) return ''; const Class = require('../../models/Class'); const c = await Class.findById(classId).select('standard division'); return c ? `${c.standard}-${c.division}` : ''; }
async function person(schoolId, id) {
  const t = await Teacher.findOne({ _id: oid(id), schoolId: oid(schoolId), isActive: { $ne: false } }).select('name'); if (t) return { id: t._id, model: 'Teacher', name: t.name };
  const u = await User.findOne({ _id: oid(id), schoolId: oid(schoolId), role: 'admin', isActive: { $ne: false } }).select('name'); if (u) return { id: u._id, model: 'User', name: u.name || 'Administrator' };
  return null;
}
async function staffList(schoolId) {
  const [ts, us] = await Promise.all([Teacher.find({ schoolId: oid(schoolId), isActive: { $ne: false } }).select('name').sort({ name: 1 }), User.find({ schoolId: oid(schoolId), role: 'admin', isActive: { $ne: false } }).select('name')]);
  return [...us.map((u) => ({ id: u._id, model: 'User', name: u.name || 'Administrator' })), ...ts.map((t) => ({ id: t._id, model: 'Teacher', name: t.name }))];
}

/* ── the access record ── */
async function logRead(req, entity, entityId, studentId, via) {
  try { await CareAccessLog.create({ schoolId: sid(req), entity, entityId: String(entityId || ''), studentId: studentId || null, actorId: oid(req.user.userId), actorRole: req.user.role, actorName: req.actorName || '', via: via || '' }); } catch (e) { console.warn('care log failed:', e.message); }
}

/* ── cases ── */
const inCircle = (c, kase) => (kase.circle || []).some((p) => String(p.id) === c.userId) || String(kase.leadId || '') === c.userId || String(kase.openedById || '') === c.userId;
async function liveAccess(req, kase) {
  const now = new Date(); return CareAccess.findOne({ schoolId: sid(req), caseId: kase._id, requestedById: oid(req.user.userId), status: 'Approved', validFrom: { $lte: now }, validTo: { $gt: now } });
}
// -> { ok, via }  via: 'dsl' | 'circle' | 'work' | 'break-glass'
async function caseAccess(req, kase) {
  const c = await ctx(req); if (!c.staff) return { ok: false };
  if (kase.confidential) {
    if (c.dsl) return { ok: true, via: 'dsl' };
    if (inCircle(c, kase)) return { ok: true, via: 'circle' };
    const a = await liveAccess(req, kase); return a ? { ok: true, via: 'break-glass', accessId: a._id } : { ok: false, needsBreakGlass: true };
  }
  if (c.work) return { ok: true, via: 'work' };
  if (inCircle(c, kase)) return { ok: true, via: 'circle' };
  return { ok: false };
}
// People who could approve a request, other than the requester
async function otherApprovers(schoolId, action, exceptId) {
  const def = P.CATALOG[action]; const sidv = oid(schoolId); const ids = new Set();
  if (def.defaults.includes('admin')) for (const u of await User.find({ schoolId: sidv, role: 'admin', isActive: { $ne: false } }).select('_id')) ids.add(String(u._id));
  const now = new Date();
  for (const g of await PermissionGrant.find({ schoolId: sidv, action })) if (P.liveGrant(g, now)) ids.add(String(g.granteeId));
  ids.delete(String(exceptId)); return [...ids];
}

const summary = (k) => ({
  _id: k._id, number: k.number, studentId: k.studentId, studentName: k.studentName, classId: k.classId, category: k.category, level: k.level, status: k.status, confidential: k.confidential,
  title: k.title, leadId: k.leadId, leadName: k.leadName, reviewOn: k.reviewOn, lastAt: k.lastAt, createdAt: k.createdAt, openActions: (k.actions || []).filter((a) => a.status === 'Open').length, closePending: !!(k.closeRequest && k.closeRequest.at),
});

module.exports = {
  DEFAULTS, getSettings, saveSettings, nextNumber, today, addDays, isDay, sha, hmac, ctx, teachesStudent, canTouch, isConfidential, studentOf, className, person, staffList,
  logRead, inCircle, caseAccess, otherApprovers, summary, oid, sid, bad, wrap, clean, pg, K, C, P,
};

// Everyone who holds a care right (role default or a live grant), as notification recipients
async function holders(schoolId, action, exceptId = null) {
  const def = P.CATALOG[action]; const sidv = oid(schoolId); const out = new Map(); const now = new Date();
  if (def.defaults.includes('admin')) for (const u of await User.find({ schoolId: sidv, role: 'admin', isActive: { $ne: false } }).select('_id')) out.set(String(u._id), { id: u._id, role: 'admin' });
  for (const g of await PermissionGrant.find({ schoolId: sidv, action })) if (P.liveGrant(g, now)) out.set(String(g.granteeId), { id: g.granteeId, role: g.granteeModel === 'User' ? 'admin' : 'teacher' });
  if (exceptId) out.delete(String(exceptId)); return [...out.values()];
}
module.exports.holders = holders;

/* ── families ── */
const G = require('../guardianRights');
const Parent = require('../../models/Parent');
// A parent's linked children (with rights), or the student themself
async function myChildren(req) {
  const s = sid(req);
  if (req.user.role === 'student') { const st = await Student.findOne({ _id: oid(req.user.userId), schoolId: s }).select('name classId studentId'); return st ? [{ student: st, rights: { viewInfo: true }, self: true }] : []; }
  if (req.user.role !== 'parent') return [];
  const p = await Parent.findOne({ _id: oid(req.user.userId), schoolId: s }).select('children name isActive'); if (!p) return [];
  const kids = await Student.find({ _id: { $in: p.children || [] }, schoolId: s, isActive: { $ne: false } }).select('name classId studentId');
  const rights = await G.resolveForParent(s, p, kids.map((k) => k._id));
  return kids.map((k) => ({ student: k, rights: (rights.get(String(k._id)) || { rights: {} }).rights, linked: !!(rights.get(String(k._id)) || {}).linked })).filter((x) => x.linked);
}
async function familyChild(req, studentId, right = 'viewInfo') {
  const kids = await myChildren(req); const hit = kids.find((k) => String(k.student._id) === String(studentId));
  return hit && hit.rights[right] ? hit : null;
}
module.exports.myChildren = myChildren; module.exports.familyChild = familyChild;

// Safeguarding training: a teacher must hold a current record before joining a confidential case. Administrators (the default leads) are shown in the register but not blocked.
async function trainingOk(schoolId, p, day) {
  if (!p || p.model === 'User') return true;
  const CareTraining = require('../../models/CareTraining');
  const rows = await CareTraining.find({ schoolId: oid(schoolId), staffId: oid(p.id), course: 'safeguarding' }).sort({ completedOn: -1 }).limit(1);
  const r = rows[0]; return !!r && (!r.expiresOn || r.expiresOn >= day);
}
module.exports.trainingOk = trainingOk;
