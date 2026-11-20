// Shared pieces of training courses (PRD E17): settings with versioned policy, learner sign-in by private link or student account,
// orders with seat holds, entitlements, and the nightly sweep.
const base = require('../early/service');
const R = require('../registrar/service');
const E = require('./engine');
const AppSetting = require('../../models/AppSetting');
const School = require('../../models/School');
const Student = require('../../models/Student');
const Teacher = require('../../models/Teacher');
const TrInstructor = require('../../models/TrInstructor');
const TrCourse = require('../../models/TrCourse');
const TrCohort = require('../../models/TrCohort');
const TrLearner = require('../../models/TrLearner');
const TrOrder = require('../../models/TrOrder');
const TrEntitlement = require('../../models/TrEntitlement');
const TrProgress = require('../../models/TrProgress');
const TrCoupon = require('../../models/TrCoupon');
const N = require('../notify');
const { authenticate, getSchoolBlock } = require('../../middleware/auth');

const { oid, sid, who, bad, wrap, clean } = base;
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const DEFAULTS = { currency: 'PKR', taxPercent: 0, taxLabel: '', jurisdiction: '', refundDays: 14, graceDays: 7, holdDays: 7, paymentInstructions: '', storefront: { enabled: false, headline: '', about: '' }, policyVersion: 1, policies: [] };

const getSettings = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `training:${schoolId}` }); const v = s?.value || {};
  const out = { ...DEFAULTS, ...v, storefront: { ...DEFAULTS.storefront, ...(v.storefront || {}) } };
  if (!out.policies.length) out.policies = [{ version: 1, taxPercent: out.taxPercent, taxLabel: out.taxLabel, refundDays: out.refundDays, jurisdiction: out.jurisdiction, effectiveFrom: new Date(0), byName: 'Default', note: 'Starting policy' }];
  return out;
};
const putSettings = (schoolId, value) => AppSetting.updateOne({ key: `training:${schoolId}` }, { $set: { value } }, { upsert: true });

/* ───────── numbered records ───────── */
const numbered = (Model, schoolId, field, prefix, doc) => R.createNumbered(Model, schoolId, field, prefix, doc);

/* ───────── learners ───────── */
const hashKey = (k) => E.sha(String(k || ''));
// Creates the learner and returns the private link ONCE. An email already in the school returns the existing learner and no link.
async function makeLearner(schoolId, d) {
  const email = clean(d.email, 160).toLowerCase(); const sidv = oid(schoolId);
  if (email) { const ex = await TrLearner.findOne({ schoolId: sidv, email }); if (ex) return { learner: ex, key: null, existing: true }; }
  if (d.studentId) { const ex = await TrLearner.findOne({ schoolId: sidv, studentId: oid(d.studentId) }); if (ex) return { learner: ex, key: null, existing: true }; }
  const key = E.keyOf('lk_');
  const learner = await TrLearner.create({ schoolId: sidv, name: clean(d.name, 120), email, phone: clean(d.phone, 40), studentId: oid(d.studentId), keyHash: hashKey(key), keySetAt: new Date(), minor: !!d.minor, consentAt: d.consent ? new Date() : null, source: d.source || 'office' });
  return { learner, key, existing: false };
}
const resetKey = async (learner) => { const key = E.keyOf('lk_'); await TrLearner.updateOne({ _id: learner._id }, { $set: { keyHash: hashKey(key), keySetAt: new Date() } }); return key; };

// A learner signs in with the private link (header `X-Learner-Key`) or, for a student with a linked learner record, the ordinary student token.
const lastSeen = new Map();
function learnerAuth(req, res, next) {
  const key = String(req.headers['x-learner-key'] || '');
  const go = async () => {
    if (key) {
      if (!/^lk_[a-f0-9]{48}$/.test(key)) return bad(res, 401, 'This learner link is not valid.');
      const l = await TrLearner.findOne({ keyHash: hashKey(key) }); if (!l) return bad(res, 401, 'This learner link is not valid.');
      if (l.status !== 'active') return bad(res, 403, 'This learner account is paused. Please contact the school.');
      const block = await getSchoolBlock(l.schoolId); if (block.blocked) return res.status(423).json({ message: block.message, code: 'SCHOOL_BLOCKED' });
      req.learner = l; req.user = { userId: String(l._id), schoolId: String(l.schoolId), role: 'learner' }; req.actorName = l.name;
      const k = String(l._id); if (Date.now() - (lastSeen.get(k) || 0) > 600000) { lastSeen.set(k, Date.now()); if (lastSeen.size > 5000) lastSeen.clear(); TrLearner.updateOne({ _id: l._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {}); }
      return next();
    }
    return authenticate(req, res, async (err) => {
      if (err) return next(err);
      if (req.user.role !== 'student') return bad(res, 403, 'Access denied');
      const l = await TrLearner.findOne({ schoolId: oid(req.user.schoolId), studentId: oid(req.user.userId), status: 'active' });
      if (!l) return bad(res, 404, 'You are not taking any training course yet.', { code: 'NO_LEARNER' });
      req.learner = l; next();
    });
  };
  go().catch(next);
}

/* ───────── instructors and scope ───────── */
// Administrators see everything; a teacher sees the courses that name them as an instructor.
async function scopeOf(req) {
  if (req.user.role === 'admin') return { admin: true, instr: null, courses: null };
  const ins = await TrInstructor.find({ schoolId: sid(req), teacherId: oid(req.user.userId) }).select('_id');
  const ids = ins.map((i) => i._id);
  const courses = ids.length ? await TrCourse.find({ schoolId: sid(req), instructorIds: { $in: ids } }).select('_id') : [];
  return { admin: false, instr: new Set(ids.map(String)), instrIds: ids, courses: new Set(courses.map((c) => String(c._id))) };
}
const inScope = (scope, courseId) => scope.admin || scope.courses.has(String(courseId));

/* ───────── seats, entitlements ───────── */
// Take a seat on a cohort with a compare-and-set, so the last seat can only go to one buyer.
async function takeSeat(cohort) {
  if (!cohort) return true;
  for (let i = 0; i < 6; i += 1) {
    const c = await TrCohort.findById(cohort._id); if (!c) return false;
    if (c.capacity > 0 && c.seatsTaken >= c.capacity) return false;
    const r = await TrCohort.updateOne({ _id: c._id, seatsTaken: c.seatsTaken }, { $set: { seatsTaken: c.seatsTaken + 1 } }); if (r.matchedCount) return true;
  }
  return false;
}
async function freeSeat(cohortId) {
  if (!cohortId) return;
  for (let i = 0; i < 6; i += 1) { const c = await TrCohort.findById(cohortId); if (!c || c.seatsTaken <= 0) return; const r = await TrCohort.updateOne({ _id: c._id, seatsTaken: c.seatsTaken }, { $set: { seatsTaken: c.seatsTaken - 1 } }); if (r.matchedCount) return; }
}
const bestEntitlement = async (schoolId, learnerId, courseId) => {
  const rows = await TrEntitlement.find({ schoolId: oid(schoolId), learnerId: oid(learnerId), courseId: oid(courseId) }).sort({ createdAt: -1 });
  return rows.find((e) => E.entState(e) === 'active') || rows.find((e) => E.entState(e) === 'paused') || rows[0] || null;
};
// Grant access. A second grant for the same order and course returns the first, so a repeated confirmation never doubles it.
async function grant(schoolId, { learner, course, cohort, orderId, sponsorshipId, bundle, unlockAfter, source, by, reason, days, expiresAt }) {
  const sidv = oid(schoolId);
  const q = { schoolId: sidv, learnerId: learner._id, courseId: course._id, ...(orderId ? { orderId } : {}), ...(sponsorshipId ? { sponsorshipId } : {}) };
  if (orderId || sponsorshipId) { const ex = await TrEntitlement.findOne(q); if (ex) { if (ex.status === 'paused' && source === 'payment') { await TrEntitlement.updateOne({ _id: ex._id, status: 'paused' }, { $set: { status: 'active' } }); ex.status = 'active'; } return { ent: ex, created: false }; } }
  const d = days != null ? days : (bundle ? bundle.accessDays : course.access?.days) || 0;
  const ent = await TrEntitlement.create({ schoolId: sidv, learnerId: learner._id, courseId: course._id, cohortId: cohort ? cohort._id : null, orderId: orderId || null, sponsorshipId: sponsorshipId || null, bundleId: bundle ? bundle._id : null, unlockAfter: unlockAfter || null, source, grantedByName: by || '', reason: clean(reason, 300), grantedAt: new Date(), expiresAt: expiresAt || (d > 0 ? new Date(Date.now() + d * E.DAY) : null) });
  await TrProgress.updateOne({ schoolId: sidv, learnerId: learner._id, courseId: course._id }, { $setOnInsert: { lessons: {}, lastLessonId: '' } }, { upsert: true });
  return { ent, created: true };
}

/* ───────── notifications ───────── */
const notifyAdmins = async (schoolId, title, body, link = '/admin#/training') => N.notify({ schoolId, recipients: await N.admins(schoolId), title, body, link, type: 'training' }).catch(() => {});
const notifyTeachers = (schoolId, teacherIds, title, body, link = '/teacher#/training') => { const rec = [...new Set((teacherIds || []).filter(Boolean).map(String))].map((id) => ({ id, role: 'teacher' })); return rec.length ? N.notify({ schoolId, recipients: rec, title, body, link, type: 'training' }).catch(() => {}) : null; };
const notifyLearner = (schoolId, learner, title, body) => (learner?.studentId ? N.notify({ schoolId, recipients: [{ id: learner.studentId, role: 'student' }], title, body, link: '/student#/courses', type: 'training' }).catch(() => {}) : null);
const teacherIdsOf = async (schoolId, instructorIds) => (await TrInstructor.find({ schoolId: oid(schoolId), _id: { $in: instructorIds || [] }, teacherId: { $ne: null } }).select('teacherId')).map((i) => i.teacherId);

// the learner-facing name of a course in lists
const courseCard = (c, extra = {}) => ({ _id: c._id, slug: c.slug, title: c.title, summary: c.summary, level: c.level, language: c.language, price: c.price, installments: c.installments?.max || 1, access: c.access, ...extra });

/* ───────── the nightly sweep ───────── */
async function sweep(schoolId) {
  const sidv = oid(schoolId); const now = new Date(); const st = await getSettings(schoolId); const out = { paused: 0, cancelled: 0, cohortsStarted: 0, cohortsClosed: 0, reminders: 0 };
  // instalments overdue past the grace period (and nothing sent as proof) pause access
  const orders = await TrOrder.find({ schoolId: sidv, status: { $in: ['part_paid', 'paid'] } }).limit(2000);
  for (const o of orders) {
    const late = (o.installments || []).some((i) => i.status === 'due' && new Date(i.due).getTime() + st.graceDays * E.DAY < now.getTime());
    if (late) { const r = await TrEntitlement.updateMany({ schoolId: sidv, orderId: o._id, status: 'active' }, { $set: { status: 'paused' } }); out.paused += r.modifiedCount || 0; }
  }
  // an unpaid order with no proof frees its seat after the hold period
  const stale = await TrOrder.find({ schoolId: sidv, status: 'pending', createdAt: { $lt: new Date(now.getTime() - st.holdDays * E.DAY) } }).limit(500);
  for (const o of stale) { if ((o.installments || []).some((i) => i.proof)) continue; const r = await TrOrder.updateOne({ _id: o._id, status: 'pending' }, { $set: { status: 'cancelled' } }); if (r.matchedCount) { await freeSeat(o.cohortId); out.cancelled += 1; } }
  // cohorts move on by their dates
  for (const c of await TrCohort.find({ schoolId: sidv, status: { $in: ['open', 'running'] } }).limit(500)) {
    if (c.status === 'open' && c.startsAt && c.startsAt <= now && (!c.endsAt || c.endsAt > now)) { await TrCohort.updateOne({ _id: c._id, status: 'open' }, { $set: { status: 'running' } }); out.cohortsStarted += 1; }
    else if (c.endsAt && c.endsAt < now) { await TrCohort.updateOne({ _id: c._id, status: { $in: ['open', 'running'] } }, { $set: { status: 'closed' } }); out.cohortsClosed += 1; }
    // a reminder for each live session starting inside the next 26 hours
    const soon = (c.sessions || []).filter((s) => !s.reminded && s.startsAt && s.startsAt > now && s.startsAt.getTime() - now.getTime() <= 26 * 3600000);
    if (soon.length) {
      const sessions = (c.sessions || []).map((s) => (soon.some((x) => x.id === s.id) ? { ...s, reminded: true } : s));
      const r = await TrCohort.updateOne({ _id: c._id }, { $set: { sessions } }); if (!r.matchedCount) continue;
      const ents = await TrEntitlement.find({ schoolId: sidv, cohortId: c._id, status: 'active' }).select('learnerId'); const ls = await TrLearner.find({ schoolId: sidv, _id: { $in: ents.map((e) => e.learnerId) }, studentId: { $ne: null } }).select('studentId');
      const tids = c.instructorId ? await teacherIdsOf(schoolId, [c.instructorId]) : [];
      for (const s of soon) { const title = `Live session tomorrow: ${s.title}`; const body = `${c.name} meets ${new Date(s.startsAt).toISOString().replace('T', ' ').slice(0, 16)} UTC.`; await N.notify({ schoolId, recipients: ls.map((l) => ({ id: l.studentId, role: 'student' })), title, body, link: '/student#/courses', type: 'training' }).catch(() => {}); await notifyTeachers(schoolId, tids, title, body); out.reminders += 1; }
    }
  }
  return out;
}

module.exports = { ...R, E, Student, Teacher, School, TrInstructor, TrCourse, TrCohort, TrLearner, TrOrder, TrEntitlement, TrProgress, TrCoupon, plain, getSettings, putSettings, numbered, hashKey, makeLearner, resetKey, learnerAuth, scopeOf, inScope, takeSeat, freeSeat, bestEntitlement, grant, notifyAdmins, notifyTeachers, notifyLearner, teacherIdsOf, courseCard, sweep };
