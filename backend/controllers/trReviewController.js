// Review work (PRD E17): hand-ins, course completion, certificates, discussion moderation and office hours. A course counts as finished only
// after an instructor or administrator reviews it; a certificate is signed and can be checked by anyone without seeing private records.
const S = require('../utils/training/service');
const L = require('../utils/training/learning');
const { E, oid, sid, bad, wrap, clean, plain } = S;
const { audit } = require('../utils/audit');
const TrSubmission = require('../models/TrSubmission');
const TrCredential = require('../models/TrCredential');
const TrPost = require('../models/TrPost');
const TrSlot = require('../models/TrSlot');
const TrBundle = require('../models/TrBundle');
const { TrEntitlement, TrLearner, TrCourse, TrProgress } = S;

const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'training', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const run = (name, fn) => wrap(name, async (req, res) => { try { await fn(req, res); } catch (e) { if (e && e.http) return bad(res, e.http, e.message, e.extra || {}); throw e; } });
const inScopeIds = (scope) => (scope.admin ? null : [...scope.courses].map(oid));

/* ───────── hand-ins ───────── */
exports.submissions = run('rv.submissions', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; const ids = inScopeIds(scope); if (ids) q.courseId = { $in: ids }; if (req.query.courseId) q.courseId = oid(req.query.courseId);
  q.status = ['submitted', 'returned', 'accepted'].includes(req.query.status) ? req.query.status : 'submitted';
  const rows = await TrSubmission.find(q).sort({ createdAt: 1 }).limit(200); const course = await TrCourse.find({ schoolId, _id: { $in: rows.map((r) => r.courseId) } }).select('live'); const cm = new Map(course.map((c) => [String(c._id), c]));
  res.json({ submissions: rows.map((r) => { const lesson = E.flat(cm.get(String(r.courseId))?.live?.modules || []).find((l) => l.id === r.lessonId); return { ...plain(r), rubric: lesson?.rubric || [], passPercent: lesson?.passPercent || 60, brief: lesson?.body || '', maxAttempts: lesson?.maxAttempts || 3 }; }) });
});
exports.reviewSubmission = run('rv.review', async (req, res) => {
  const schoolId = sid(req); const sub = await TrSubmission.findOne({ _id: oid(req.params.id), schoolId }); if (!sub) return bad(res, 404, 'Hand-in not found.');
  const scope = await S.scopeOf(req); if (!S.inScope(scope, sub.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  if (sub.status !== 'submitted') return bad(res, 409, 'This hand-in was already reviewed.');
  const course = await TrCourse.findOne({ _id: sub.courseId, schoolId }); const lesson = E.flat(course?.live?.modules || []).find((l) => l.id === sub.lessonId); if (!lesson) return bad(res, 404, 'That lesson is no longer in the course.');
  const b = req.body || {}; const decision = b.decision === 'accept' ? 'accept' : b.decision === 'return' ? 'return' : ''; if (!decision) return bad(res, 400, 'Choose accept or return.');
  const rp = E.rubricPercent(lesson, b.scores); if (!rp.ok) return bad(res, 422, rp.reason); const feedback = clean(b.feedback, 1500);
  if (decision === 'accept' && rp.percent < (lesson.passPercent || 60)) return bad(res, 422, `The score is ${rp.percent}%, below the ${lesson.passPercent || 60}% needed. Return it with feedback instead.`);
  if (decision === 'return' && feedback.length < 10) return bad(res, 422, 'Tell the learner what to improve (at least 10 characters).');
  const done = await TrSubmission.updateOne({ _id: sub._id, status: 'submitted' }, { $set: { status: decision === 'accept' ? 'accepted' : 'returned', scores: b.scores, percent: rp.percent, feedback, reviewedByName: req.actorName || '', reviewedAt: new Date() } }); if (!done.matchedCount) return bad(res, 409, 'Someone else just reviewed this.');
  const ent = await S.bestEntitlement(schoolId, sub.learnerId, sub.courseId); const learner = await TrLearner.findById(sub.learnerId);
  if (decision === 'accept' && ent) { await L.mutate(schoolId, sub.learnerId, sub.courseId, async (ls) => { ls[sub.lessonId] = { ...(ls[sub.lessonId] || {}), done: true, doneAt: (ls[sub.lessonId] || {}).doneAt || new Date() }; }); await L.refreshReadiness(schoolId, ent); }
  await S.notifyLearner(schoolId, learner, decision === 'accept' ? 'Your work was accepted' : 'Your work was returned', `"${sub.lessonTitle}": ${decision === 'accept' ? `${rp.percent}%` : feedback.slice(0, 120)}`);
  await A(req, 'training.submission.review', sub._id, `${decision} ${rp.percent}%`); res.json({ ok: true, percent: rp.percent });
});
exports.moreAttempts = run('rv.moreAttempts', async (req, res) => {
  const schoolId = sid(req); const sub = await TrSubmission.findOne({ _id: oid(req.params.id), schoolId }); if (!sub) return bad(res, 404, 'Hand-in not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, sub.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  if (sub.status !== 'returned') return bad(res, 409, 'Only a returned hand-in can get another attempt.'); const n = Math.min(3, Math.max(1, E.int(req.body?.extra, 1)));
  await TrSubmission.updateMany({ schoolId, learnerId: sub.learnerId, courseId: sub.courseId, lessonId: sub.lessonId }, { $set: { extraAttempts: (sub.extraAttempts || 0) + n } }); await A(req, 'training.submission.attempts', sub._id, `+${n}`); res.json({ ok: true });
});

/* ───────── completion review ───────── */
exports.completions = run('rv.completions', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId, completion: { $in: req.query.all === '1' ? ['ready', 'held', 'complete'] : ['ready', 'held'] } }; const ids = inScopeIds(scope); if (ids) q.courseId = { $in: ids };
  const ents = await TrEntitlement.find(q).sort({ updatedAt: 1 }).limit(200); const ls = await TrLearner.find({ schoolId, _id: { $in: ents.map((e) => e.learnerId) } }).select('name'); const cs = await TrCourse.find({ schoolId, _id: { $in: ents.map((e) => e.courseId) } }).select('title live');
  const lm = new Map(ls.map((x) => [String(x._id), x.name])); const cm = new Map(cs.map((x) => [String(x._id), x]));
  const out = []; for (const e of ents) {
    const c = cm.get(String(e.courseId)); const r = await L.refreshReadiness(schoolId, e); const subs = await TrSubmission.find({ schoolId, learnerId: e.learnerId, courseId: e.courseId, status: 'accepted' }).select('lessonTitle percent');
    const order = e.orderId ? await S.TrOrder.findById(e.orderId).select('status refunded orderNo') : null;
    out.push({ entitlementId: e._id, learnerId: e.learnerId, learnerName: lm.get(String(e.learnerId)) || '', courseId: e.courseId, courseTitle: c?.title || '', state: E.entState(e), completion: e.completion, completionNote: e.completionNote, percent: r?.percent ?? 0, attendance: r?.attendance ?? null, missing: r?.missing || [], work: subs.map((s) => ({ title: s.lessonTitle, percent: s.percent })), refunded: order ? (order.refunded || 0) > 0 : false, orderNo: order?.orderNo || '', completedAt: e.completedAt });
  }
  res.json({ completions: out });
});
exports.decideCompletion = run('rv.decideCompletion', async (req, res) => {
  const schoolId = sid(req); const e = await TrEntitlement.findOne({ _id: oid(req.params.id), schoolId }); if (!e) return bad(res, 404, 'Not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, e.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  const decision = req.body?.decision; const note = clean(req.body?.note, 400); if (!['approve', 'hold'].includes(decision)) return bad(res, 400, 'Choose approve or hold.');
  if (e.completion === 'complete') return bad(res, 409, 'This completion was already approved.');
  if (decision === 'hold') { if (note.length < 10) return bad(res, 422, 'Tell the learner why it is on hold (at least 10 characters).'); await TrEntitlement.updateOne({ _id: e._id }, { $set: { completion: 'held', completionNote: note, reviewedByName: req.actorName || '' } }); await A(req, 'training.completion.hold', e._id, note); return res.json({ ok: true }); }
  const st = E.entState(e); if (st !== 'active') return bad(res, 409, st === 'paused' ? 'Access is paused for an overdue payment. Settle it before issuing a certificate.' : 'This learner no longer has access, so no certificate can be issued.');
  const order = e.orderId ? await S.TrOrder.findById(e.orderId) : null; if (order && (order.refunded || 0) > 0) return bad(res, 409, 'Part of this order was refunded. Check the refund before issuing a certificate.');
  const r = await L.refreshReadiness(schoolId, e); if (!r?.ready) return bad(res, 409, `Not finished yet: ${r?.missing?.[0] || 'lessons are missing'}.`, { missing: r?.missing || [] });
  const won = await TrEntitlement.updateOne({ _id: e._id, completion: { $in: ['ready', 'held'] } }, { $set: { completion: 'complete', completedAt: new Date(), completionNote: note, reviewedByName: req.actorName || '' } }); if (!won.matchedCount) return bad(res, 409, 'This was just decided by someone else.');
  const learner = await TrLearner.findById(e.learnerId); const course = await TrCourse.findOne({ _id: e.courseId, schoolId });
  const { credential } = await L.issueCredential(schoolId, { kind: 'course', learner, course, ent: e, by: req.actorName || '' });
  await S.notifyLearner(schoolId, learner, 'Course completed', `Your certificate for "${course.title}" is ready.`); await A(req, 'training.completion.approve', e._id, credential.serial); res.json({ ok: true, serial: credential.serial, verifyKey: credential.verifyKey });
});

/* ───────── certificates ───────── */
exports.credentials = run('rv.credentials', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; const ids = inScopeIds(scope); if (ids) q.courseId = { $in: ids }; if (req.query.status) q.status = String(req.query.status); if (req.query.flag === '1') q.refundFlag = true;
  const rows = await TrCredential.find(q).select('-snapshot').sort({ createdAt: -1 }).limit(200); res.json({ credentials: rows.map((r) => ({ ...plain(r), signature: undefined })) });
});
exports.credentialPdf = run('rv.credentialPdf', async (req, res) => {
  const schoolId = sid(req); const c = await TrCredential.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Certificate not found.'); const scope = await S.scopeOf(req); if (c.courseId && !S.inScope(scope, c.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  const buf = await require('../utils/training/pdf').render(c, `${req.protocol}://${req.get('host')}`); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${c.serial}.pdf"`, 'Cache-Control': 'no-store' }); res.send(buf);
});
exports.revokeCredential = run('rv.revoke', async (req, res) => {
  const schoolId = sid(req); const c = await TrCredential.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Certificate not found.'); const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Write why it is withdrawn (at least 10 characters). The record stays.');
  if (c.status === 'revoked') return bad(res, 409, 'Already withdrawn.'); await TrCredential.updateOne({ _id: c._id }, { $set: { status: 'revoked', revokedReason: reason, revokedAt: new Date(), revokedByName: req.actorName || '' } }); await A(req, 'training.credential.revoke', c._id, reason); res.json({ ok: true });
});
// after a refund an administrator decides whether the certificate stands
exports.clearFlag = run('rv.clearFlag', async (req, res) => {
  const schoolId = sid(req); const c = await TrCredential.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Certificate not found.'); const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Write why the certificate stands (at least 10 characters).');
  await TrCredential.updateOne({ _id: c._id }, { $set: { refundFlag: false } }); await A(req, 'training.credential.keep', c._id, reason); res.json({ ok: true });
});
exports.specialization = run('rv.specialization', async (req, res) => {
  const schoolId = sid(req); const learner = await TrLearner.findOne({ _id: oid(req.body?.learnerId), schoolId }); const bundle = await TrBundle.findOne({ _id: oid(req.body?.bundleId), schoolId }); if (!learner || !bundle) return bad(res, 404, 'Learner or bundle not found.');
  const courses = await TrCourse.find({ schoolId, _id: { $in: bundle.courseIds } }); const missing = [];
  for (const c of courses) { const e = await S.bestEntitlement(schoolId, learner._id, c._id); if (!e || e.completion !== 'complete') missing.push(c.title); }
  if (missing.length) return bad(res, 409, `Not every course is complete yet: ${missing.slice(0, 3).join(', ')}.`, { missing });
  const skills = []; for (const c of courses) for (const s of c.live?.skills || c.skills || []) if (!skills.some((x) => x.code === s.code)) skills.push(s);
  const { credential, created } = await L.issueCredential(schoolId, { kind: 'specialization', learner, bundle, by: req.actorName || '', extra: { courses: courses.map((c) => c.title), skills } });
  await A(req, 'training.credential.specialization', credential._id, credential.serial); res.status(created ? 201 : 200).json({ serial: credential.serial, verifyKey: credential.verifyKey, created });
});

/* ───────── discussion ───────── */
exports.posts = run('rv.posts', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; const ids = inScopeIds(scope); if (ids) q.courseId = { $in: ids }; if (req.query.courseId) q.courseId = oid(req.query.courseId);
  const view = String(req.query.view || 'held'); if (view === 'held') q.status = 'held'; else if (view === 'reported') { q.status = 'visible'; q.reportCount = { $gt: 0 }; } else if (view === 'hidden') q.status = 'hidden';
  const rows = await TrPost.find(q).sort({ createdAt: -1 }).limit(150); const cs = await TrCourse.find({ schoolId, _id: { $in: rows.map((r) => r.courseId) } }).select('title'); const cm = new Map(cs.map((c) => [String(c._id), c.title]));
  res.json({ posts: rows.map((p) => ({ ...plain(p), courseTitle: cm.get(String(p.courseId)) || '', reports: (p.reports || []).map((r) => ({ at: r.at, reason: r.reason })) })) });
});
exports.decidePost = run('rv.decidePost', async (req, res) => {
  const schoolId = sid(req); const p = await TrPost.findOne({ _id: oid(req.params.id), schoolId }); if (!p) return bad(res, 404, 'Post not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, p.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  const action = req.body?.action; if (!['show', 'hide'].includes(action)) return bad(res, 400, 'Choose show or hide.'); const reason = clean(req.body?.reason, 300); if (action === 'hide' && reason.length < 5) return bad(res, 422, 'Write a short reason for hiding it.');
  await TrPost.updateOne({ _id: p._id }, { $set: { status: action === 'show' ? 'visible' : 'hidden', hiddenReason: action === 'hide' ? reason : '', decidedByName: req.actorName || '', ...(action === 'show' ? { reports: [], reportCount: 0 } : {}) } }); await A(req, `training.post.${action}`, p._id, reason); res.json({ ok: true });
});
exports.staffPost = run('rv.staffPost', async (req, res) => {
  const schoolId = sid(req); const c = await TrCourse.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Course not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, c._id)) return bad(res, 403, 'You are not an instructor on this course.');
  const body = clean(req.body?.body, 1500); if (body.length < 2) return bad(res, 400, 'Write something first.'); let parentId = null; if (req.body?.parentId) { const par = await TrPost.findOne({ _id: oid(req.body.parentId), schoolId, courseId: c._id }); if (!par) return bad(res, 404, 'That message is not there.'); parentId = par._id; }
  const row = await TrPost.create({ schoolId, courseId: c._id, parentId, authorKind: 'staff', authorName: req.actorName || 'Instructor', body, status: 'visible', lessonId: clean(req.body?.lessonId, 20) }); res.status(201).json(row);
});

/* ───────── office hours ───────── */
exports.slots = run('rv.slots', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId, startsAt: { $gt: new Date(Date.now() - 7 * E.DAY) } }; const ids = inScopeIds(scope); if (ids) q.courseId = { $in: ids }; if (req.query.courseId) q.courseId = oid(req.query.courseId);
  const rows = await TrSlot.find(q).sort({ startsAt: 1 }).limit(300); const cs = await TrCourse.find({ schoolId, _id: { $in: rows.map((r) => r.courseId) } }).select('title'); const cm = new Map(cs.map((c) => [String(c._id), c.title])); res.json({ slots: rows.map((s) => ({ ...plain(s), courseTitle: cm.get(String(s.courseId)) || '' })) });
});
exports.createSlots = run('rv.createSlots', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const c = await TrCourse.findOne({ _id: oid(b.courseId), schoolId, status: 'published' }); if (!c) return bad(res, 404, 'Course not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, c._id)) return bad(res, 403, 'You are not an instructor on this course.');
  let ins = null; if (scope.admin) ins = await S.TrInstructor.findOne({ _id: oid(b.instructorId), schoolId }); else ins = await S.TrInstructor.findOne({ schoolId, teacherId: oid(req.user.userId) }); if (!ins || !c.instructorIds.map(String).includes(String(ins._id))) return bad(res, 422, 'Pick an instructor named on this course.');
  const mode = b.mode === 'venue' ? 'venue' : 'online'; const link = b.link ? E.httpsUrl(b.link) : ''; if (link === null) return bad(res, 422, 'The meeting link must start with https://'); if (mode === 'online' && !link) return bad(res, 422, 'An online slot needs a meeting link.'); if (mode === 'venue' && !clean(b.venue, 200)) return bad(res, 422, 'Say where the slot is.');
  const minutes = Math.min(120, Math.max(5, E.int(b.minutes, 20))); const start = new Date(b.startsAt); if (Number.isNaN(start.getTime()) || start <= new Date()) return bad(res, 422, 'Pick a time in the future.');
  const count = Math.min(12, Math.max(1, E.int(b.count, 1))); const made = [];
  for (let i = 0; i < count; i += 1) { const at = new Date(start.getTime() + i * minutes * 60000); const clash = await TrSlot.findOne({ schoolId, instructorId: ins._id, status: { $in: ['open', 'booked'] }, startsAt: { $gt: new Date(at.getTime() - minutes * 60000), $lt: new Date(at.getTime() + minutes * 60000) } }); if (clash) return bad(res, 409, 'That overlaps another slot of this instructor.'); made.push(await TrSlot.create({ schoolId, courseId: c._id, instructorId: ins._id, instructorName: ins.name, startsAt: at, minutes, mode, link: link || '', venue: clean(b.venue, 200) })); }
  res.status(201).json({ created: made.length });
});
exports.cancelSlot = run('rv.cancelSlot', async (req, res) => {
  const schoolId = sid(req); const s = await TrSlot.findOne({ _id: oid(req.params.id), schoolId }); if (!s) return bad(res, 404, 'Slot not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, s.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  if (!['open', 'booked'].includes(s.status)) return bad(res, 409, 'This slot is closed.'); await TrSlot.updateOne({ _id: s._id }, { $set: { status: 'cancelled' } });
  if (s.bookedBy) { const l = await TrLearner.findById(s.bookedBy); await S.notifyLearner(schoolId, l, 'Office hour cancelled', `Your booking on ${new Date(s.startsAt).toISOString().slice(0, 16).replace('T', ' ')} UTC was cancelled by the instructor.`); } res.json({ ok: true });
});
exports.slotOutcome = run('rv.slotOutcome', async (req, res) => {
  const schoolId = sid(req); const s = await TrSlot.findOne({ _id: oid(req.params.id), schoolId }); if (!s) return bad(res, 404, 'Slot not found.'); const scope = await S.scopeOf(req); if (!S.inScope(scope, s.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  if (s.status !== 'booked') return bad(res, 409, 'Only a booked slot can be marked.'); if (s.startsAt > new Date()) return bad(res, 409, 'That time has not come yet.'); const outcome = req.body?.outcome; if (!['attended', 'missed'].includes(outcome)) return bad(res, 400, 'Choose attended or missed.');
  await TrSlot.updateOne({ _id: s._id, status: 'booked' }, { $set: { status: outcome, followUp: clean(req.body?.followUp, 400) } }); res.json({ ok: true });
});
