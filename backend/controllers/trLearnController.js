// What a learner sees (PRD E17): their courses and lessons, evidence of work, assignments, discussion, office hours, orders and certificates,
// plus the public page that sells a course honestly. Paid lessons open only for a learner with active access; the lesson text and the
// answers to its questions are never sent to anyone else.
const S = require('../utils/training/service');
const C = require('../utils/training/commerce');
const L = require('../utils/training/learning');
const { E, oid, sid, bad, wrap, clean, plain } = S;
const TrSubmission = require('../models/TrSubmission');
const TrCredential = require('../models/TrCredential');
const TrPost = require('../models/TrPost');
const TrSlot = require('../models/TrSlot');
const TrBundle = require('../models/TrBundle');
const TrSponsor = require('../models/TrSponsor');
const TrSponsorship = require('../models/TrSponsorship');
const { TrOrder, TrEntitlement, TrLearner, TrProgress, TrCourse, TrCohort } = S;

const run = (name, fn) => wrap(name, async (req, res) => { try { await fn(req, res); } catch (e) { if (e && e.http) return bad(res, e.http, e.message, e.extra || {}); throw e; } });
const first = (n) => String(n || '').trim().split(/\s+/).map((w, i) => (i === 0 ? w : `${w.charAt(0)}.`)).join(' ');

/* ───────── the learner's course view ───────── */
async function context(req, res, courseId) {
  const schoolId = sid(req); const learner = req.learner;
  const course = await TrCourse.findOne({ _id: oid(courseId), schoolId }); if (!course || !course.live) { bad(res, 404, 'Course not found.'); return null; }
  const ent = await S.bestEntitlement(schoolId, learner._id, course._id); const state = E.entState(ent);
  const prog = await TrProgress.findOne({ schoolId, learnerId: learner._id, courseId: course._id }); const lessons = E.flat(course.live.modules);
  const cohort = ent?.cohortId ? await TrCohort.findOne({ _id: ent.cohortId, schoolId }) : null;
  let unlocked = true; if (ent?.unlockAfter) { const prev = await TrEntitlement.findById(ent.unlockAfter); unlocked = !!prev && prev.completion === 'complete'; }
  const startedAt = cohort?.startsAt && cohort.startsAt > new Date(ent?.grantedAt || 0) ? cohort.startsAt : ent?.grantedAt;
  return { schoolId, learner, course, ent, state, prog: prog?.lessons || {}, lessons, cohort, unlocked, startedAt };
}
const access = (cx, lesson) => { const done = new Set(Object.keys(cx.prog).filter((k) => cx.prog[k]?.done)); return E.lessonAccess({ lessons: cx.lessons, lesson, done, ent: cx.ent, unlocked: cx.unlocked, startedAt: cx.startedAt }); };

exports.me = run('lrn.me', async (req, res) => {
  const schoolId = sid(req); const l = req.learner; const school = await S.School.findById(schoolId).select('name code'); const st = await S.getSettings(schoolId);
  const [ents, orders, creds] = await Promise.all([TrEntitlement.find({ schoolId, learnerId: l._id }).sort({ createdAt: -1 }).limit(100), TrOrder.find({ schoolId, learnerId: l._id }).sort({ createdAt: -1 }).limit(30), TrCredential.find({ schoolId, learnerId: l._id }).sort({ createdAt: -1 })]);
  const cs = await TrCourse.find({ schoolId, _id: { $in: ents.map((e) => e.courseId) } }); const cm = new Map(cs.map((c) => [String(c._id), c]));
  const progs = await TrProgress.find({ schoolId, learnerId: l._id }); const pm = new Map(progs.map((p) => [String(p.courseId), p]));
  const cohorts = await TrCohort.find({ schoolId, _id: { $in: ents.map((e) => e.cohortId).filter(Boolean) } }); const chm = new Map(cohorts.map((c) => [String(c._id), c]));
  const upcoming = [];
  const courses = ents.map((e) => {
    const c = cm.get(String(e.courseId)); const lessons = E.flat(c?.live?.modules || []); const req2 = lessons.filter((x) => x.required); const pr = pm.get(String(e.courseId))?.lessons || {}; const done = req2.filter((x) => pr[x.id]?.done).length;
    const co = e.cohortId ? chm.get(String(e.cohortId)) : null; if (co && E.entState(e) === 'active') for (const s of co.sessions || []) if (new Date(s.startsAt) > new Date()) upcoming.push({ courseTitle: c?.title || '', cohort: co.name, id: s.id, title: s.title, startsAt: s.startsAt, minutes: s.minutes, mode: s.mode, link: s.link, venue: s.venue });
    const next = lessons.find((x) => x.required && !pr[x.id]?.done);
    return { entitlementId: e._id, courseId: e.courseId, title: c?.title || '', slug: c?.slug || '', state: E.entState(e), source: e.source, expiresAt: e.expiresAt, completion: e.completion, percent: req2.length ? Math.round((done * 100) / req2.length) : 0, lessons: req2.length, done, nextLessonId: pm.get(String(e.courseId))?.lastLessonId || next?.id || '', cohort: co ? { _id: co._id, name: co.name, mode: co.mode } : null, revokedReason: e.status === 'revoked' ? e.revokedReason : '' };
  });
  res.json({ learner: { _id: l._id, name: l.name, email: l.email, minor: l.minor, viaStudent: !!l.studentId }, school: { name: school?.name || '', code: school?.code || '' }, paymentInstructions: st.paymentInstructions, currency: st.currency, courses, upcoming: upcoming.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 10),
    orders: orders.map((o) => ({ _id: o._id, orderNo: o.orderNo, title: o.title, status: o.status, total: o.total, currency: o.currency, refunded: o.refunded, createdAt: o.createdAt, installments: o.installments.map((i) => ({ no: i.no, amount: i.amount, due: i.due, status: i.status, receiptNo: i.receiptNo || '', rejected: i.proof?.rejected?.reason || '', reference: i.proof?.reference || i.reference || '' })) })), credentials: creds.map((c) => ({ _id: c._id, serial: c.serial, title: c.title, status: c.status, verifyKey: c.verifyKey, issuedAt: c.createdAt, kind: c.kind })) });
});

exports.course = run('lrn.course', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; const { course, ent, state, prog, lessons, cohort } = cx;
  const mods = course.live.modules.map((m) => ({ id: m.id, title: m.title, lessons: m.lessons.map((l) => { const full = lessons.find((x) => x.id === l.id); const a = access(cx, full); const rec = prog[l.id]; return { ...E.learnerLesson(l), state: rec?.done ? 'done' : a.ok ? 'open' : 'locked', why: a.ok ? '' : a.why, code: a.code || '', opensAt: a.opensAt || null, minutesDone: Math.round((rec?.active || 0) / 60) }; }) }));
  const req2 = lessons.filter((x) => x.required); const done = req2.filter((x) => prog[x.id]?.done).length; let readiness = null;
  if (ent && state !== 'none') readiness = E.readiness({ lessons, progress: prog, cohort, userId: String(cx.learner._id) });
  const subs = await TrSubmission.find({ schoolId: cx.schoolId, learnerId: cx.learner._id, courseId: course._id }).select('lessonId status percent attempt feedback reviewedAt');
  res.json({ course: { _id: course._id, title: course.title, summary: course.summary, version: course.live.version, skills: course.live.skills || [], discussion: course.discussion }, access: { state, source: ent?.source || '', expiresAt: ent?.expiresAt || null, completion: ent?.completion || 'none', completedAt: ent?.completedAt || null, note: ent?.completionNote || '' }, modules: mods, percent: req2.length ? Math.round((done * 100) / req2.length) : 0, readiness, submissions: subs,
    cohort: cohort ? { name: cohort.name, mode: cohort.mode, minAttendance: cohort.minAttendance, sessions: (cohort.sessions || []).map((s) => ({ id: s.id, title: s.title, startsAt: s.startsAt, minutes: s.minutes, mode: s.mode, link: state === 'active' ? s.link : '', venue: s.venue, mark: s.marked ? (s.attendance || {})[String(cx.learner._id)] || 'absent' : '' })) } : null });
});

exports.lesson = run('lrn.lesson', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; const lesson = cx.lessons.find((l) => l.id === req.params.lid); if (!lesson) return bad(res, 404, 'Lesson not found.');
  const a = access(cx, lesson); if (!a.ok) return bad(res, 403, a.why, { code: a.code });
  const rec = cx.prog[lesson.id] || {}; const sub = lesson.kind === 'assignment' ? await TrSubmission.find({ schoolId: cx.schoolId, learnerId: cx.learner._id, courseId: cx.course._id, lessonId: lesson.id }).sort({ attempt: 1 }) : [];
  if (cx.ent) await L.mutate(cx.schoolId, cx.learner._id, cx.course._id, async () => ({ lastLessonId: lesson.id })).catch(() => {});
  res.json({ lesson: E.learnerLesson(lesson, true), record: { active: rec.active || 0, passed: !!rec.passed, best: rec.best ?? null, done: !!rec.done, pos: rec.pos || 0, attempts: rec.attempts || 0 }, activeNeeded: E.activeNeeded(lesson), submissions: sub.map((s) => ({ _id: s._id, attempt: s.attempt, status: s.status, text: s.text, link: s.link, percent: s.percent, feedback: s.feedback, scores: s.scores, reviewedAt: s.reviewedAt, createdAt: s.createdAt })) });
});

exports.beat = run('lrn.beat', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; const lesson = cx.lessons.find((l) => l.id === req.params.lid); if (!lesson) return bad(res, 404, 'Lesson not found.');
  const a = access(cx, lesson); if (!a.ok) return bad(res, 403, a.why, { code: a.code }); if (!cx.ent) return res.json({ ok: true, active: 0 });
  if (!E.needsEvidence(lesson)) return res.json({ ok: true, active: 0 });
  const out = await L.mutate(cx.schoolId, cx.learner._id, cx.course._id, async (lessons) => { const r = E.beat(lessons[lesson.id], Date.now(), req.body?.visible === true); lessons[lesson.id] = r.rec; return { active: r.rec.active, added: r.added, needed: E.activeNeeded(lesson) }; });
  res.json({ ok: true, active: out.active, added: out.added, needed: out.needed });
});
exports.position = run('lrn.position', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx || !cx.ent) return; const lesson = cx.lessons.find((l) => l.id === req.params.lid); if (!lesson || !access(cx, lesson).ok) return bad(res, 403, 'You cannot open this lesson.');
  const pos = Math.min(36000, Math.max(0, E.int(req.body?.pos))); await L.mutate(cx.schoolId, cx.learner._id, cx.course._id, async (lessons) => { lessons[lesson.id] = { ...(lessons[lesson.id] || {}), pos }; }); res.json({ ok: true });
});
exports.answer = run('lrn.answer', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; const lesson = cx.lessons.find((l) => l.id === req.params.lid); if (!lesson || !lesson.check?.length) return bad(res, 404, 'This lesson has no questions.');
  const a = access(cx, lesson); if (!a.ok) return bad(res, 403, a.why, { code: a.code }); if (!cx.ent) return bad(res, 403, 'Join the course to answer its questions.');
  const g = E.gradeCheck(lesson, req.body?.answers || {});
  await L.mutate(cx.schoolId, cx.learner._id, cx.course._id, async (lessons) => { const r = lessons[lesson.id] || {}; lessons[lesson.id] = { ...r, passed: r.passed || g.passed, best: Math.max(r.best || 0, g.percent), attempts: (r.attempts || 0) + 1 }; });
  res.json({ percent: g.percent, passed: g.passed, needed: lesson.passPercent || 70, review: lesson.check.map((q) => ({ id: q.id, correct: !g.wrong.includes(q.id), why: g.wrong.includes(q.id) ? q.why : '' })) });
});
exports.complete = run('lrn.complete', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; const lesson = cx.lessons.find((l) => l.id === req.params.lid); if (!lesson) return bad(res, 404, 'Lesson not found.');
  const a = access(cx, lesson); if (!a.ok) return bad(res, 403, a.why, { code: a.code }); if (!cx.ent) return bad(res, 403, 'Join the course to track your progress.');
  const acc = await L.acceptedSet(cx.schoolId, cx.learner._id, cx.course._id); const miss = E.lessonMissing(lesson, cx.prog[lesson.id], acc.has(lesson.id));
  if (miss.length) return bad(res, 422, miss[0], { missing: miss });
  await L.mutate(cx.schoolId, cx.learner._id, cx.course._id, async (lessons) => { lessons[lesson.id] = { ...(lessons[lesson.id] || {}), done: true, doneAt: (lessons[lesson.id] || {}).doneAt || new Date() }; });
  const r = await L.refreshReadiness(cx.schoolId, cx.ent); res.json({ ok: true, ready: !!r?.ready, percent: r?.percent ?? 0 });
});

/* ───────── assignments ───────── */
exports.submit = run('lrn.submit', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; const lesson = cx.lessons.find((l) => l.id === req.params.lid); if (!lesson || lesson.kind !== 'assignment') return bad(res, 404, 'This lesson takes no hand-in.');
  const a = access(cx, lesson); if (!a.ok) return bad(res, 403, a.why, { code: a.code }); if (!cx.ent) return bad(res, 403, 'Join the course to hand in work.');
  const text = clean(req.body?.text, 6000); const link = E.httpsUrl(req.body?.link); if (link === null) return bad(res, 422, 'The link must start with https://'); if (text.length < 20 && !link) return bad(res, 422, 'Write at least a few sentences, or add a link to your work.');
  const prev = await TrSubmission.find({ schoolId: cx.schoolId, learnerId: cx.learner._id, courseId: cx.course._id, lessonId: lesson.id }).sort({ attempt: -1 }).limit(1); const last = prev[0];
  if (last && last.status === 'submitted') return bad(res, 409, 'Your last hand-in is still waiting to be reviewed.'); if (last && last.status === 'accepted') return bad(res, 409, 'Your work was already accepted.');
  const allowed = (lesson.maxAttempts || 3) + (last?.extraAttempts || 0); if (last && last.attempt >= allowed) return bad(res, 409, 'You have used every attempt. Ask the instructor for another.');
  try { const row = await TrSubmission.create({ schoolId: cx.schoolId, learnerId: cx.learner._id, courseId: cx.course._id, lessonId: lesson.id, lessonTitle: lesson.title, learnerName: cx.learner.name, courseTitle: cx.course.title, attempt: (last?.attempt || 0) + 1, text, link: link || '', extraAttempts: last?.extraAttempts || 0 });
    await S.notifyTeachers(cx.schoolId, await S.teacherIdsOf(cx.schoolId, cx.course.instructorIds), 'Work to review', `${cx.learner.name} handed in "${lesson.title}".`); res.status(201).json({ ok: true, attempt: row.attempt }); }
  catch (e) { if (S.isDup(e)) return bad(res, 409, 'That was already handed in.'); throw e; }
});

/* ───────── discussion ───────── */
exports.discussion = run('lrn.discussion', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; if (cx.course.discussion === 'off') return res.json({ posts: [], canPost: false, mode: 'off' });
  const q = { schoolId: cx.schoolId, courseId: cx.course._id, $or: [{ status: 'visible' }, { status: 'held', learnerId: cx.learner._id }] }; if (req.query.lessonId) q.lessonId = String(req.query.lessonId);
  const rows = await TrPost.find(q).sort({ createdAt: 1 }).limit(300);
  res.json({ mode: cx.course.discussion, canPost: E.entState(cx.ent) === 'active', minor: cx.learner.minor, posts: rows.map((p) => ({ _id: p._id, parentId: p.parentId, lessonId: p.lessonId, authorName: p.authorKind === 'staff' ? `${p.authorName} (instructor)` : first(p.authorName), mine: String(p.learnerId) === String(cx.learner._id), staff: p.authorKind === 'staff', status: p.status, body: p.body, createdAt: p.createdAt, reported: (p.reports || []).some((r) => String(r.learnerId) === String(cx.learner._id)) })) });
});
exports.post = run('lrn.post', async (req, res) => {
  const cx = await context(req, res, req.params.id); if (!cx) return; if (cx.course.discussion === 'off') return bad(res, 409, 'Discussion is switched off for this course.');
  if (E.entState(cx.ent) !== 'active') return bad(res, 403, 'Only learners with access can post.');
  const body = clean(req.body?.body, 1500); if (body.length < 2) return bad(res, 400, 'Write something first.');
  if ((await TrPost.countDocuments({ schoolId: cx.schoolId, learnerId: cx.learner._id, createdAt: { $gte: new Date(Date.now() - 3600000) } })) >= 10) return bad(res, 429, 'You have posted a lot this hour. Please wait a little.');
  let parentId = null; if (req.body?.parentId) { const par = await TrPost.findOne({ _id: oid(req.body.parentId), schoolId: cx.schoolId, courseId: cx.course._id, status: 'visible' }); if (!par) return bad(res, 404, 'That message is not there any more.'); parentId = par._id; }
  const held = cx.course.discussion === 'moderated' || cx.learner.minor;
  const row = await TrPost.create({ schoolId: cx.schoolId, courseId: cx.course._id, lessonId: clean(req.body?.lessonId, 20), parentId, authorKind: 'learner', learnerId: cx.learner._id, authorName: cx.learner.name, body, status: held ? 'held' : 'visible' });
  if (held) await S.notifyTeachers(cx.schoolId, await S.teacherIdsOf(cx.schoolId, cx.course.instructorIds), 'Discussion post to approve', `A post on "${cx.course.title}" is waiting.`);
  res.status(201).json({ _id: row._id, status: row.status });
});
exports.report = run('lrn.report', async (req, res) => {
  const schoolId = sid(req); const p = await TrPost.findOne({ _id: oid(req.params.id), schoolId, status: 'visible' }); if (!p) return bad(res, 404, 'That message is not there.');
  const ent = await S.bestEntitlement(schoolId, req.learner._id, p.courseId); if (!ent) return bad(res, 403, 'You are not in this course.');
  if (String(p.learnerId) === String(req.learner._id)) return bad(res, 409, 'This is your own message.'); if ((p.reports || []).some((r) => String(r.learnerId) === String(req.learner._id))) return bad(res, 409, 'You already reported this.');
  const reports = [...(p.reports || []), { learnerId: req.learner._id, at: new Date(), reason: clean(req.body?.reason, 200) }]; const set = { reports, reportCount: reports.length }; if (reports.length >= 3) set.status = 'held';
  await TrPost.updateOne({ _id: p._id }, { $set: set }); const course = await TrCourse.findById(p.courseId).select('title instructorIds');
  await S.notifyTeachers(schoolId, await S.teacherIdsOf(schoolId, course?.instructorIds), 'A message was reported', `A post on "${course?.title}" was reported.`); res.json({ ok: true, held: reports.length >= 3 });
});

/* ───────── office hours ───────── */
exports.slots = run('lrn.slots', async (req, res) => {
  const schoolId = sid(req); const ent = await S.bestEntitlement(schoolId, req.learner._id, req.params.id); if (E.entState(ent) !== 'active') return bad(res, 403, 'Office hours are for learners with access.');
  const rows = await TrSlot.find({ schoolId, courseId: oid(req.params.id), startsAt: { $gt: new Date() }, status: { $in: ['open', 'booked'] }, $or: [{ status: 'open' }, { bookedBy: req.learner._id }] }).sort({ startsAt: 1 }).limit(100);
  res.json({ slots: rows.map((s) => ({ _id: s._id, startsAt: s.startsAt, minutes: s.minutes, instructorName: s.instructorName, mode: s.mode, status: s.status, mine: String(s.bookedBy) === String(req.learner._id), link: String(s.bookedBy) === String(req.learner._id) ? s.link : '', venue: s.venue, topic: s.topic })) });
});
exports.bookSlot = run('lrn.bookSlot', async (req, res) => {
  const schoolId = sid(req); const s = await TrSlot.findOne({ _id: oid(req.params.id), schoolId }); if (!s) return bad(res, 404, 'Slot not found.'); const ent = await S.bestEntitlement(schoolId, req.learner._id, s.courseId); if (E.entState(ent) !== 'active') return bad(res, 403, 'Office hours are for learners with access.');
  if (s.startsAt <= new Date()) return bad(res, 409, 'That time has passed.');
  const mine = await TrSlot.countDocuments({ schoolId, courseId: s.courseId, bookedBy: req.learner._id, status: 'booked', startsAt: { $gt: new Date() } }); if (mine >= 2) return bad(res, 409, 'You already have two bookings coming up for this course.');
  const r = await TrSlot.updateOne({ _id: s._id, status: 'open', bookedBy: null }, { $set: { status: 'booked', bookedBy: req.learner._id, bookedName: req.learner.name, bookedAt: new Date(), topic: clean(req.body?.topic, 200) } }); if (!r.matchedCount) return bad(res, 409, 'Someone just took that slot. Pick another.');
  const course = await TrCourse.findById(s.courseId).select('title'); await S.notifyTeachers(schoolId, await S.teacherIdsOf(schoolId, [s.instructorId]), 'Office hour booked', `${req.learner.name} booked ${new Date(s.startsAt).toISOString().replace('T', ' ').slice(0, 16)} UTC for "${course?.title}".`); res.json({ ok: true });
});
exports.cancelSlot = run('lrn.cancelSlot', async (req, res) => {
  const schoolId = sid(req); const s = await TrSlot.findOne({ _id: oid(req.params.id), schoolId, bookedBy: req.learner._id, status: 'booked' }); if (!s) return bad(res, 404, 'You have no booking there.');
  if (s.startsAt.getTime() - Date.now() < 2 * 3600000) return bad(res, 409, 'Bookings can be cancelled up to 2 hours before. Message the instructor instead.');
  const r = await TrSlot.updateOne({ _id: s._id, bookedBy: req.learner._id, status: 'booked' }, { $set: { status: 'open', bookedBy: null, bookedName: '', bookedAt: null, topic: '' } }); res.json({ ok: !!r.matchedCount });
});

/* ───────── certificates ───────── */
exports.credentialPdf = run('lrn.credentialPdf', async (req, res) => {
  const c = await TrCredential.findOne({ _id: oid(req.params.id), schoolId: sid(req), learnerId: req.learner._id }); if (!c) return bad(res, 404, 'Certificate not found.');
  const buf = await require('../utils/training/pdf').render(c, `${req.protocol}://${req.get('host')}`); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${c.serial}.pdf"`, 'Cache-Control': 'no-store' }); res.send(buf);
});
// a portable copy of the evidence the learner can keep or share
exports.credentialExport = run('lrn.credentialExport', async (req, res) => {
  const c = await TrCredential.findOne({ _id: oid(req.params.id), schoolId: sid(req), learnerId: req.learner._id }); if (!c) return bad(res, 404, 'Certificate not found.');
  res.json({ format: 'aulensia-credential@1', serial: c.serial, checkCode: c.verifyKey, checkPath: `/verify-credential/${c.verifyKey}`, status: c.status, issuedAt: c.createdAt, expiresAt: c.expiresAt, snapshot: c.snapshot, contentHash: c.contentHash, signature: c.signature });
});

/* ───────── buying ───────── */
exports.catalog = run('lrn.catalog', async (req, res) => {
  const schoolId = sid(req); const [courses, bundles, cohorts] = await Promise.all([TrCourse.find({ schoolId, status: 'published' }).select('slug title summary level price installments access'), TrBundle.find({ schoolId, status: 'published' }), TrCohort.find({ schoolId, status: { $in: ['open', 'running'] } })]);
  res.json({ courses: courses.map((c) => ({ ...S.courseCard(c), cohorts: cohorts.filter((x) => String(x.courseId) === String(c._id)).filter((x) => !x.enrolUntil || x.enrolUntil > new Date()).map((x) => ({ _id: x._id, name: x.name, startsAt: x.startsAt, seatsLeft: x.capacity > 0 ? Math.max(0, x.capacity - x.seatsTaken) : null })) })), bundles: bundles.map((b) => ({ _id: b._id, title: b.title, summary: b.summary, price: b.price, ordered: b.ordered, courses: b.courseIds.length })) });
});
exports.checkout = run('lrn.checkout', async (req, res) => {
  const b = req.body || {}; const o = await C.placeOrder(sid(req), { learner: req.learner, courseId: b.courseId, bundleId: b.bundleId, cohortId: b.cohortId, couponCode: b.coupon, installments: b.installments, source: 'learner', by: req.learner.name });
  const st = await S.getSettings(sid(req)); await S.notifyAdmins(sid(req), o.total ? 'New course order' : 'New free enrolment', `${req.learner.name} ordered ${o.title} (${o.orderNo}).`); res.status(201).json({ order: orderView(o), paymentInstructions: st.paymentInstructions });
});
const orderView = (o) => ({ _id: o._id, orderNo: o.orderNo, title: o.title, status: o.status, list: o.list, discount: o.discount, tax: o.tax, total: o.total, currency: o.currency, installments: (o.installments || []).map((i) => ({ no: i.no, amount: i.amount, due: i.due, status: i.status })) });
exports.proof = run('lrn.proof', async (req, res) => {
  const o = await TrOrder.findOne({ _id: oid(req.params.id), schoolId: sid(req), learnerId: req.learner._id }); if (!o) return bad(res, 404, 'Order not found.');
  const i = await C.learnerProof(sid(req), o, E.int(req.body?.no), { reference: req.body?.reference, method: req.body?.method, note: req.body?.note });
  await S.notifyAdmins(sid(req), 'Payment proof to check', `${req.learner.name} sent proof for ${o.orderNo} (instalment ${i.no}).`); res.json({ ok: true, note: 'Thank you. Access opens when the school confirms the payment.' });
});
exports.cancelOrder = run('lrn.cancelOrder', async (req, res) => { const o = await TrOrder.findOne({ _id: oid(req.params.id), schoolId: sid(req), learnerId: req.learner._id }); if (!o) return bad(res, 404, 'Order not found.'); if ((o.installments || []).some((i) => i.proof && !i.proof.rejected)) return bad(res, 409, 'You sent proof of payment. Ask the school to check it or cancel it.'); await C.cancelOrder(sid(req), o, 'Cancelled by learner'); res.json({ ok: true }); });

/* ───────── the public page ───────── */
async function storefront(req, res) {
  const school = await S.School.findOne({ code: clean(req.params.code, 20).toUpperCase(), isActive: true }).select('name code'); if (!school) { bad(res, 404, 'School not found.'); return null; }
  const st = await S.getSettings(school._id); if (!st.storefront.enabled) { bad(res, 404, 'This school has no courses on sale.'); return null; } return { school, st };
}
exports.pubList = run('pub.list', async (req, res) => {
  const s = await storefront(req, res); if (!s) return; const schoolId = s.school._id;
  const [courses, bundles, cohorts] = await Promise.all([TrCourse.find({ schoolId, status: 'published' }).select('slug title summary level language price installments access landing'), TrBundle.find({ schoolId, status: 'published' }), TrCohort.find({ schoolId, status: { $in: ['open', 'running'] } }).select('courseId name startsAt capacity seatsTaken enrolUntil mode')]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ school: { name: s.school.name, code: s.school.code }, headline: s.st.storefront.headline, about: s.st.storefront.about, currency: s.st.currency, courses: courses.map((c) => ({ ...S.courseCard(c), headline: c.landing?.headline || '', nextCohort: cohorts.filter((x) => String(x.courseId) === String(c._id) && (!x.enrolUntil || x.enrolUntil > new Date())).sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0))[0]?.startsAt || null })), bundles: bundles.map((b) => ({ _id: b._id, title: b.title, summary: b.summary, price: b.price, ordered: b.ordered, courses: b.courseIds.length })) });
});
exports.pubCourse = run('pub.course', async (req, res) => {
  const s = await storefront(req, res); if (!s) return; const schoolId = s.school._id; const c = await TrCourse.findOne({ schoolId, slug: clean(req.params.slug, 80), status: 'published' }); if (!c || !c.live) return bad(res, 404, 'Course not found.');
  const [ins, cohorts] = await Promise.all([S.TrInstructor.find({ schoolId, _id: { $in: c.instructorIds }, status: 'verified' }).select('name bio credentials'), TrCohort.find({ schoolId, courseId: c._id, status: { $in: ['open', 'running'] } }).sort({ startsAt: 1 })]);
  const lessons = E.flat(c.live.modules); const pol = s.st.policies[s.st.policies.length - 1]; const refundDays = c.refundDays ?? pol.refundDays; const total = lessons.reduce((a, l) => a + (l.required ? l.minutes : 0), 0);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ school: { name: s.school.name, code: s.school.code }, currency: s.st.currency, course: { _id: c._id, slug: c.slug, title: c.title, summary: c.summary, level: c.level, language: c.language, price: c.price, access: c.access, installments: c.installments, version: c.live.version, ...c.landing && { landing: { headline: c.landing.headline, outcomes: c.landing.outcomes, requirements: c.landing.requirements, audience: c.landing.audience, faq: c.landing.faq } }, skills: c.live.skills || [], hours: Math.round((total / 60) * 10) / 10, lessons: lessons.length },
    syllabus: c.live.modules.map((m) => ({ title: m.title, lessons: m.lessons.map((l) => ({ title: l.title, kind: l.kind, minutes: l.minutes, preview: l.preview, ...(l.preview ? { body: l.body } : {}) })) })), instructors: ins,
    cohorts: cohorts.filter((x) => !x.enrolUntil || x.enrolUntil > new Date()).map((x) => ({ _id: x._id, name: x.name, mode: x.mode, startsAt: x.startsAt, endsAt: x.endsAt, seatsLeft: x.capacity > 0 ? Math.max(0, x.capacity - x.seatsTaken) : null, sessions: (x.sessions || []).length })),
    terms: { taxPercent: pol.taxPercent, taxLabel: pol.taxLabel, refundDays, jurisdiction: pol.jurisdiction, paymentInstructions: s.st.paymentInstructions } });
});
exports.pubQuote = run('pub.quote', async (req, res) => {
  const s = await storefront(req, res); if (!s) return; const schoolId = s.school._id; const b = req.body || {}; const pol = s.st.policies[s.st.policies.length - 1];
  const c = b.bundleId ? await TrBundle.findOne({ _id: oid(b.bundleId), schoolId, status: 'published' }) : await TrCourse.findOne({ _id: oid(b.courseId), schoolId, status: 'published' }); if (!c) return bad(res, 404, 'That is not on sale.');
  let discount = 0; let note = ''; if (b.coupon) { const cd = await S.TrCoupon.findOne({ schoolId, code: clean(b.coupon, 24).toUpperCase() }); const ck = E.couponCheck(cd, { courseId: b.bundleId ? null : c._id, list: c.price, used: 0 }); if (!ck.ok || (b.bundleId && (cd.courseIds || []).length)) note = ck.reason || 'That code does not apply to bundles.'; else discount = ck.discount; }
  const p = E.priceOrder({ list: c.price, discount, taxPercent: pol.taxPercent }); const n = Math.min(Math.max(1, E.int(b.installments, 1)), p.total > 0 ? (c.installments?.max || 1) : 1);
  res.json({ ...p, currency: s.st.currency, taxLabel: pol.taxLabel, taxPercent: pol.taxPercent, couponNote: note, installments: p.total > 0 ? E.split(p.total, n).map((i) => ({ no: i.no, amount: i.amount, due: i.due })) : [] });
});
exports.pubCheckout = run('pub.checkout', async (req, res) => {
  const b = req.body || {}; if (b.website) return res.status(201).json({ ok: true });                        // honeypot
  const s = await storefront(req, res); if (!s) return; const schoolId = s.school._id; const name = clean(b.name, 120); const email = clean(b.email, 160).toLowerCase();
  if (!name) return bad(res, 400, 'Please give your name.'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 400, 'Please give a valid email address.'); if (b.consent !== true) return bad(res, 400, 'Please agree to the terms to continue.');
  const m = await S.makeLearner(schoolId, { name, email, phone: b.phone, consent: true, source: 'storefront' }); if (m.learner.status !== 'active') return bad(res, 409, 'This account is paused. Please contact the school.');
  let o; try { o = await C.placeOrder(schoolId, { learner: m.learner, courseId: b.courseId, bundleId: b.bundleId, cohortId: b.cohortId, couponCode: b.coupon, installments: b.installments, source: 'storefront', by: name }); } catch (e) { if (!m.existing && e.http) await TrLearner.deleteOne({ _id: m.learner._id }); throw e; }
  await S.notifyAdmins(schoolId, o.total ? 'New course order' : 'New free enrolment', `${name} ordered ${o.title} (${o.orderNo}).`);
  res.status(201).json({ order: orderView(o), key: m.key, paymentInstructions: s.st.paymentInstructions, free: o.total === 0, message: m.existing ? 'Your order is recorded. Use the private link you saved earlier to see it. If you have lost it, ask the school.' : 'Save your private link: it is the only way into your courses and it is shown once.' });
});
// anyone can check a certificate by its code; nothing private is shown
exports.pubCredential = run('pub.credential', async (req, res) => {
  const key = String(req.params.key || '').toUpperCase(); const miss = () => res.status(404).json({ valid: false, message: 'We could not find a certificate with this code.' }); if (!/^[A-F0-9]{12}$/.test(key)) return miss();
  const c = await TrCredential.findOne({ verifyKey: key }); if (!c) return miss(); const ok = L.verifyCredential(c); const school = await S.School.findById(c.schoolId).select('name'); const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
  res.set('Cache-Control', 'no-store'); res.json({ valid: c.status === 'valid' && ok && !expired, status: c.status !== 'valid' ? 'Withdrawn' : !ok ? 'Altered' : expired ? 'Expired' : 'Valid', serial: c.serial, kind: c.kind, title: c.title, school: school?.name || '', learner: E.maskName(c.learnerName), issuedAt: c.createdAt, expiresAt: c.expiresAt, skills: c.snapshot?.skills || [] });
});
// a sponsor sees only its own learners' completion
exports.pubSponsor = run('pub.sponsor', async (req, res) => {
  const key = String(req.params.key || ''); if (!/^sp_[a-f0-9]{48}$/.test(key)) return bad(res, 404, 'This report link is not valid.'); const sp = await TrSponsor.findOne({ reportKeyHash: S.hashKey(key) }); if (!sp || sp.status !== 'approved') return bad(res, 404, 'This report link is not valid.');
  const invs = await TrSponsorship.find({ schoolId: sp.schoolId, sponsorId: sp._id, status: { $in: ['invoiced', 'paid'] } }).sort({ createdAt: -1 }); const school = await S.School.findById(sp.schoolId).select('name');
  const out = []; for (const inv of invs) {
    const ls = await TrLearner.find({ schoolId: sp.schoolId, _id: { $in: inv.learnerIds } }).select('name'); const ents = await TrEntitlement.find({ schoolId: sp.schoolId, sponsorshipId: inv._id }); const course = await TrCourse.findById(inv.courseId).select('live'); const req2 = E.flat(course?.live?.modules || []).filter((x) => x.required);
    const progs = await TrProgress.find({ schoolId: sp.schoolId, courseId: inv.courseId, learnerId: { $in: inv.learnerIds } }); const creds = await TrCredential.find({ schoolId: sp.schoolId, entitlementId: { $in: ents.map((e) => e._id) }, status: 'valid' }).select('entitlementId verifyKey');
    out.push({ invoiceNo: inv.invoiceNo, course: inv.courseTitle, status: inv.status, seats: inv.seats, total: inv.total, paidAt: inv.paidAt, learners: ls.map((l) => { const e = ents.find((x) => String(x.learnerId) === String(l._id)); const pr = progs.find((p) => String(p.learnerId) === String(l._id))?.lessons || {}; const done = req2.filter((x) => pr[x.id]?.done).length; return { name: l.name, state: !e ? 'Not started (awaiting payment)' : e.completion === 'complete' ? 'Completed' : done ? 'In progress' : 'Not started', percent: req2.length ? Math.round((done * 100) / req2.length) : 0, completedAt: e?.completedAt || null, checkCode: creds.find((c) => String(c.entitlementId) === String(e?._id))?.verifyKey || '' }; }) });
  }
  res.set('Cache-Control', 'no-store'); res.json({ sponsor: sp.name, school: school?.name || '', invoices: out });
});
