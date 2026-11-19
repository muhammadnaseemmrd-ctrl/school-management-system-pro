// Shared helpers for quizzes and online exams (PRD E13).
const mongoose = require('../../lib/pgdoc');
const Class = require('../../models/Class');
const Teacher = require('../../models/Teacher');
const Student = require('../../models/Student');
const User = require('../../models/User');
const Item = require('../../models/QuestionItem');
const Attempt = require('../../models/AssessAttempt');
const Access = require('../../models/AssessAccess');
const E = require('./engine');

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const sid = (req) => oid(req.user.schoolId);
const who = (req) => ({ id: oid(req.user.userId), name: req.actorName || '', role: req.user.role });
const bad = (res, code, message, extra = {}) => res.status(code).json({ message, ...extra });
const wrap = (name, fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error(`assess ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const now = () => new Date();

// A teacher works on the classes and subjects they are assigned, plus the class they head. Admins work on everything.
async function scopeOf(req) {
  if (req.user.role === 'admin') return { admin: true };
  const t = await Teacher.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('subjectClassAssignments');
  const heads = (await Class.find({ schoolId: sid(req), classTeacherId: oid(req.user.userId) }).select('_id')).map((c) => String(c._id));
  const pairs = new Set((t?.subjectClassAssignments || []).map((a) => `${a.classId}|${a.subjectId}`)); const classIds = new Set([...(t?.subjectClassAssignments || []).map((a) => String(a.classId)), ...heads]);
  return { admin: false, teacherId: String(req.user.userId), classIds, heads: new Set(heads), pairs };
}
const covers = (scope, classId, subjectId) => scope.admin || scope.heads.has(String(classId)) || (subjectId && scope.pairs.has(`${classId}|${subjectId}`)) || (!subjectId && scope.classIds.has(String(classId)));
const canSee = (scope, a) => scope.admin || String(a.authorId) === scope.teacherId || (a.classIds || []).some((c) => covers(scope, c, a.subjectId));
const canManage = (scope, a) => scope.admin || String(a.authorId) === scope.teacherId;

async function itemsByRef(schoolId, refs) { const rows = await Item.find({ schoolId, _id: { $in: refs.map(oid).filter(Boolean) } }); return new Map(rows.map((r) => [String(r._id), r])); }

// Access arrangements and make-up windows that apply to this student for this assessment
async function accessFor(schoolId, studentId, a, at = now()) {
  const rows = await Access.find({ schoolId, studentId, status: 'Active', $or: [{ assessmentId: a._id }, { assessmentId: null }] });
  const live = rows.filter((r) => (!r.validFrom || r.validFrom <= at) && (!r.validTo || r.validTo >= at));
  const out = { extraTimePct: 0, extraAttempts: 0, largeText: false, readAloud: false, separateSitting: false, window: null, ids: live.map((r) => String(r._id)) };
  for (const r of live) {
    if (r.mode === 'access') { out.extraTimePct = Math.max(out.extraTimePct, r.extraTimePct || 0); out.largeText ||= r.largeText; out.readAloud ||= r.readAloud; out.separateSitting ||= r.separateSitting; out.extraAttempts += r.assessmentId ? (r.extraAttempts || 0) : 0; }
    else if (r.mode === 'makeup' && String(r.assessmentId) === String(a._id)) { out.extraAttempts += r.extraAttempts || 1; if (r.opensAt && r.closesAt) out.window = { opensAt: r.opensAt, closesAt: r.closesAt }; }
  }
  return out;
}
const windowOf = (a, access) => { const s = a.settings || {}; const w = access?.window; return { opensAt: w ? w.opensAt : s.opensAt, closesAt: w ? w.closesAt : s.closesAt, makeup: !!w }; };

// What a student's result is, once every item has its mark
function recompute(att) {
  let total = 0; let max = 0; let pending = 0;
  for (const i of att.items) { max += i.max || 0; const done = i.state === 'Final' || i.state === 'Auto'; if (!done) pending += 1; total += done ? (i.final ?? i.auto ?? 0) : (i.auto ?? 0); }
  att.total = Math.round(total * 100) / 100; att.max = max; att.pct = max ? Math.round((att.total / max) * 1000) / 10 : 0; return { pending };
}

// Mark an attempt from the answers saved so far. Safe to call once per attempt: the caller has already moved it to Submitted.
async function gradeAttempt(att, a, byRef) {
  const items = a.items.map((ref) => { const raw = byRef.get(String(ref.ref)); const it = raw ? { ...(raw.toObject ? raw.toObject() : raw), marks: ref.marks } : null; const g = it ? E.gradeItem(it, (att.answers || {})[String(ref.ref)]) : { auto: 0, needsReview: false };
    return { ref: ref.ref, itemKey: ref.itemKey, kind: ref.kind, max: ref.marks, auto: g.auto === null ? undefined : Math.min(ref.marks, g.auto), needsReview: !!g.needsReview, state: g.needsReview ? 'Pending' : 'Auto' }; });
  att.items = items; const { pending } = recompute(att); att.passed = att.pct >= (a.settings.passPct || 0); att.status = pending ? 'Marking' : 'Graded';
  att.history = [...(att.history || []), { at: now(), action: 'submitted', detail: `${att.submitMethod}${att.lateByNetwork ? ', answers from an offline period' : ''}` }]; return att;
}

// Move an unfinished attempt past its time to Submitted using the answers the server holds (the timer is the server's, never the phone's)
async function sweep(schoolId, filter = {}) {
  const q = { schoolId, status: 'InProgress', dueAt: { $lt: new Date(Date.now() - 0) }, ...filter }; const list = await Attempt.find(q).limit(100); let n = 0;
  const Assessment = require('../../models/Assessment');
  for (const att of list) {
    const a = await Assessment.findOne({ _id: att.assessmentId, schoolId }); if (!a) continue;
    const grace = (a.settings.offlineGraceMin || 0) * 60000; if (att.dueAt.getTime() + grace > Date.now()) continue;
    const r = await Attempt.updateOne({ _id: att._id, status: 'InProgress' }, { $set: { status: 'Submitted', submittedAt: att.dueAt, submitMethod: 'timeout' } }); if (!r.modifiedCount) continue;
    const fresh = await Attempt.findById(att._id); const byRef = await itemsByRef(schoolId, a.items.map((i) => i.ref)); await gradeAttempt(fresh, a, byRef); await fresh.save(); n += 1;
  }
  return n;
}
// The score that counts when a student has more than one attempt
function counted(attempts, rule) {
  const done = attempts.filter((x) => ['Graded', 'Marking'].includes(x.status) && x.countsAsAttempt !== false); if (!done.length) return null;
  if (rule === 'last') return done.sort((x, y) => y.attemptNo - x.attemptNo)[0]; if (rule === 'average') { const t = done.reduce((s, x) => s + x.total, 0) / done.length; return { ...done[0].toObject?.() ?? done[0], total: Math.round(t * 100) / 100, average: true, _of: done.length }; }
  return done.sort((x, y) => y.total - x.total)[0];
}
const isReleased = (a) => a.release?.state === 'Released' || (a.release?.state === 'Scheduled' && a.release.scheduledAt && new Date(a.release.scheduledAt) <= now());
const classStudents = async (schoolId, classIds) => Student.find({ schoolId, classId: { $in: classIds }, isActive: { $ne: false } }).select('name classId admissionNumber rollNumber');
const soleAdmin = async (schoolId) => (await User.countDocuments({ schoolId, role: 'admin', isActive: { $ne: false } })) <= 1;

module.exports = { oid, sid, who, bad, wrap, now, scopeOf, covers, canSee, canManage, itemsByRef, accessFor, windowOf, recompute, gradeAttempt, sweep, counted, isReleased, classStudents, soleAdmin };
