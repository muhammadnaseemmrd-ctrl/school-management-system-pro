// Students writing quizzes and exams, and seeing their results (PRD E13: CAP-0313..0316, 0318, 0325, 0326).
const Assessment = require('../models/Assessment');
const Attempt = require('../models/AssessAttempt');
const Appeal = require('../models/AssessAppeal');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const AuditLog = require('../models/AuditLog');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');
const G = require('../utils/guardianRights');
const Notation = require('../utils/assess/notation');
const E = require('../utils/assess/engine');
const S = require('../utils/assess/service');

const { oid, sid, bad, wrap } = S;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const DISCLOSE = ['Your answers and the time you save them.', 'Whether this window loses focus (for example, you switch to another app). This is shown to your teacher only as a note.', 'We do not record your camera, microphone or screen.'];
const MAX_FAILS = 5;

const me = async (req) => Student.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('name classId admissionNumber');
// where a student stands for one assessment
async function standing(schoolId, student, a, attempts) {
  const access = await S.accessFor(schoolId, student._id, a); const w = S.windowOf(a, access); const now = Date.now();
  const used = attempts.filter((x) => x.countsAsAttempt !== false && x.status !== 'Voided').length; const allowed = (a.settings.attemptsMax || 1) + (access.extraAttempts || 0);
  const open = attempts.find((x) => x.status === 'InProgress');
  let state = 'open';
  if (a.status !== 'Published') state = 'closed'; else if (w.opensAt && new Date(w.opensAt) > now) state = 'upcoming'; else if (w.closesAt && new Date(w.closesAt) < now && !open) state = 'closed'; else if (!open && used >= allowed) state = 'done';
  return { access, window: w, used, allowed, open, state };
}
const forClass = (student) => ({ classIds: student.classId, status: { $in: ['Published', 'Closed'] } });

exports.available = wrap('available', async (req, res) => {
  const schoolId = sid(req); const st = await me(req); if (!st) return bad(res, 404, 'Student not found.'); await S.sweep(schoolId, { studentId: st._id });
  const list = await Assessment.find({ schoolId, ...forClass(st) }).sort({ 'settings.opensAt': -1 }).limit(100);
  const attempts = await Attempt.find({ schoolId, studentId: st._id, assessmentId: { $in: list.map((a) => a._id) } }).select('-variant -answers');
  const out = [];
  for (const a of list) {
    const mine = attempts.filter((x) => String(x.assessmentId) === String(a._id)); const s = await standing(schoolId, st, a, mine); const released = S.isReleased(a); const best = released ? S.counted(mine, a.settings.scoring) : null;
    if (a.status === 'Closed' && !mine.length) continue;
    out.push({ _id: a._id, title: a.title, kind: a.kind, subjectId: a.subjectId, instructions: a.instructions, durationMin: a.settings.durationMin, extraTimePct: s.access.extraTimePct, totalMarks: a.totalMarks, questions: a.items.length, opensAt: s.window.opensAt, closesAt: s.window.closesAt, makeup: s.window.makeup,
      identity: a.settings.identity, attemptsUsed: s.used, attemptsAllowed: s.allowed, state: s.state, inProgressId: s.open?._id, resumeDueAt: s.open?.dueAt, released,
      result: best ? { attemptId: best._id, total: best.total, max: best.max, pct: best.pct, passed: best.pct >= a.settings.passPct, pendingMarks: (best.items || []).filter((i) => !['Auto', 'Final'].includes(i.state)).length } : null,
      attempts: mine.map((x) => ({ _id: x._id, no: x.attemptNo, status: x.status })) });
  }
  res.json({ assessments: out, disclosure: DISCLOSE });
});

async function failedRecently(schoolId, studentId) { return AuditLog.countDocuments({ schoolId, actorId: studentId, action: 'assess.identity.fail', createdAt: { $gte: new Date(Date.now() - 3600000) } }); }
async function checkIdentity(req, a, st) {
  const method = a.settings.identity; if (method === 'login') return { ok: true, method };
  const idn = req.body?.identity || {}; const ok = method === 'admission' ? str(idn.admission, 40).toLowerCase() === String(st.admissionNumber || '').toLowerCase() && !!st.admissionNumber : str(idn.code, 10) === E.invigilatorCode(a._id);
  return { ok, method };
}

exports.start = wrap('start', async (req, res) => {
  const schoolId = sid(req); const st = await me(req); if (!st) return bad(res, 404, 'Student not found.');
  const a = await Assessment.findOne({ _id: oid(req.params.id), schoolId, ...forClass(st) }); if (!a) return bad(res, 404, 'Quiz not found.');
  await S.sweep(schoolId, { studentId: st._id, assessmentId: a._id });
  const mine = await Attempt.find({ schoolId, studentId: st._id, assessmentId: a._id }); const s = await standing(schoolId, st, a, mine);
  if (s.open) return respond(res, a, s.open, st, s.access, true);
  if (s.state === 'upcoming') return bad(res, 423, `This opens ${new Date(s.window.opensAt).toLocaleString('en-GB')}.`, { opensAt: s.window.opensAt }); if (s.state === 'closed') return bad(res, 422, 'This quiz is closed.'); if (s.state === 'done') return bad(res, 409, 'You have used all your attempts.');
  if ((await failedRecently(schoolId, st._id)) >= MAX_FAILS) return bad(res, 429, 'Too many wrong identity checks. Ask your invigilator for help.');
  const id = await checkIdentity(req, a, st); if (!id.ok) { await audit(req, { action: 'assess.identity.fail', entityType: 'Assessment', entityId: a._id, schoolId, detail: { method: id.method } }); return bad(res, 403, id.method === 'admission' ? 'That admission number does not match.' : 'That code is not correct. Ask your invigilator for today\'s code.', { identity: id.method }); }
  const itemsByRef = await S.itemsByRef(schoolId, a.items.map((i) => i.ref)); const attemptNo = mine.reduce((m, x) => Math.max(m, x.attemptNo), 0) + 1; const startedAt = new Date();
  const mins = a.settings.durationMin * (1 + (s.access.extraTimePct || 0) / 100); let dueAt = new Date(startedAt.getTime() + mins * 60000); if (s.window.closesAt && dueAt > new Date(s.window.closesAt) && a.kind === 'exam') dueAt = new Date(s.window.closesAt);
  const seed = E.seedFor({ assessmentId: a._id, studentId: st._id, attemptNo, salt: a.seedSalt }); const variant = E.buildVariant(a, itemsByRef, seed);
  let att; try { att = await Attempt.create({ schoolId, assessmentId: a._id, studentId: st._id, attemptNo, status: 'InProgress', seed, variant, variantHash: E.variantHash(variant), startedAt, dueAt, extraTimePct: s.access.extraTimePct || 0, access: { largeText: s.access.largeText, readAloud: s.access.readAloud, separateSitting: s.access.separateSitting, ids: s.access.ids }, identity: { method: id.method, ok: true, at: startedAt }, answers: {}, history: [{ at: startedAt, by: st._id, byName: st.name, action: 'started', detail: id.method }] }); }
  catch (e) { if (e.code === 11000) { const again = await Attempt.findOne({ schoolId, assessmentId: a._id, studentId: st._id, status: 'InProgress' }); if (again) return respond(res, a, again, st, s.access, true); return bad(res, 409, 'This attempt was already started.'); } throw e; }
  await audit(req, { action: 'assess.attempt.start', entityType: 'AssessAttempt', entityId: att._id, schoolId, detail: { assessmentId: a._id, attemptNo } });
  return respond(res, a, att, st, s.access, false);
});

async function respond(res, a, att, st, access, resumed) {
  const by = await S.itemsByRef(att.schoolId, a.items.map((i) => i.ref)); const locale = st.language === 'ur' ? 'ur' : 'en'; const refs = att.variant?.order || a.items.map((i) => String(i.ref)); const marks = new Map(a.items.map((i) => [String(i.ref), i.marks]));
  const items = refs.map((ref) => { const it = by.get(ref); if (!it) return null; const raw = it.toObject ? it.toObject() : it; return E.publicItem({ ...raw, marks: marks.get(ref) }, att.variant, ref, locale); }).filter(Boolean);
  return res.status(resumed ? 200 : 201).json({ attemptId: att._id, resumed, title: a.title, kind: a.kind, instructions: a.instructions, instructionsUr: a.instructionsUr, startedAt: att.startedAt, dueAt: att.dueAt, serverNow: new Date(), durationMin: a.settings.durationMin, extraTimePct: att.extraTimePct, offlineGraceMin: a.settings.offlineGraceMin, resume: a.settings.resume, reconnectGraceMin: a.settings.reconnectGraceMin, seq: att.lastSeq, answers: att.answers || {},
    access: { largeText: !!att.access?.largeText, readAloud: !!att.access?.readAloud }, totalMarks: a.totalMarks, items, disclosure: DISCLOSE });
}

async function ownAttempt(req, id) { const att = await Attempt.findOne({ _id: oid(id), schoolId: sid(req), studentId: oid(req.user.userId) }); return att; }
function validAnswers(a) { if (a === undefined || a === null) return {}; if (typeof a !== 'object' || Array.isArray(a)) return null; const out = {}; for (const [k, v] of Object.entries(a).slice(0, 300)) { if (!oid(k)) continue; out[k] = typeof v === 'string' ? v.slice(0, 20000) : v; } return out; }

exports.get = wrap('getAttempt', async (req, res) => {
  const schoolId = sid(req); const att = await ownAttempt(req, req.params.id); if (!att) return bad(res, 404, 'Attempt not found.'); await S.sweep(schoolId, { _id: att._id });
  const fresh = await Attempt.findById(att._id); if (fresh.status !== 'InProgress') return bad(res, 410, 'This attempt is finished.', { status: fresh.status });
  const a = await Assessment.findOne({ _id: fresh.assessmentId, schoolId }); const st = await me(req);
  // single-sitting papers can be picked up again only within the reconnect window
  if (a.settings.resume === 'single-sitting' && fresh.lastSavedAt && Date.now() - new Date(fresh.lastSavedAt).getTime() > a.settings.reconnectGraceMin * 60000) {
    const r = await Attempt.updateOne({ _id: fresh._id, status: 'InProgress' }, { $set: { status: 'Submitted', submittedAt: new Date(), submitMethod: 'timeout' } }); if (r.modifiedCount) { const f = await Attempt.findById(fresh._id); await S.gradeAttempt(f, a, await S.itemsByRef(schoolId, a.items.map((i) => i.ref))); await f.save(); }
    return bad(res, 410, 'This was a single-sitting paper and the connection was lost for too long. Your saved answers were submitted.');
  }
  return respond(res, a, fresh, st, {}, true);
});

exports.save = wrap('save', async (req, res) => {
  const schoolId = sid(req); const att = await ownAttempt(req, req.params.id); if (!att) return bad(res, 404, 'Attempt not found.'); if (att.status !== 'InProgress') return bad(res, 410, 'This attempt is finished.', { status: att.status });
  if (att.dueAt.getTime() < Date.now() - 2000) return bad(res, 422, 'Time is up. Submit to hand in what was saved before time ran out.', { timeUp: true });
  const answers = validAnswers(req.body?.answers); if (!answers) return bad(res, 400, 'The answers were not in the right shape.'); const seq = Number(req.body?.seq);
  if (!Number.isInteger(seq) || seq < 1) return bad(res, 400, 'Missing save number.'); if (seq <= att.lastSeq) return res.json({ ok: true, stale: true, receipt: null, lastSeq: att.lastSeq, serverNow: new Date(), dueAt: att.dueAt });
  const receipt = E.saveReceipt(att._id, seq, { ...(att.answers || {}), ...answers }); const merged = { ...(att.answers || {}), ...answers };
  const focus = (Array.isArray(req.body?.focus) ? req.body.focus : []).slice(0, 20).map((f) => ({ at: new Date(Number(f.at) || Date.now()), kind: f.kind === 'left' ? 'left' : 'back' }));
  const r = await Attempt.updateOne({ _id: att._id, status: 'InProgress', lastSeq: { $lt: seq } }, { $set: { answers: merged, lastSeq: seq, lastSavedAt: new Date(), saves: [...(att.saves || []).slice(-9), { seq, at: new Date(), hash: receipt.hash }], focus: [...(att.focus || []), ...focus].slice(-200) } });
  if (!r.modifiedCount) return res.json({ ok: true, stale: true, receipt: null, serverNow: new Date(), dueAt: att.dueAt });
  res.json({ ok: true, receipt, serverNow: new Date(), dueAt: att.dueAt, remainingSec: Math.max(0, Math.round((att.dueAt.getTime() - Date.now()) / 1000)) });
});

exports.submit = wrap('submit', async (req, res) => {
  const schoolId = sid(req); const att = await ownAttempt(req, req.params.id); if (!att) return bad(res, 404, 'Attempt not found.'); if (att.status !== 'InProgress') return bad(res, 409, 'You have already handed this in.', { status: att.status });
  const a = await Assessment.findOne({ _id: att.assessmentId, schoolId }); const late = Date.now() > att.dueAt.getTime() + 2000; const grace = (a.settings.offlineGraceMin || 0) * 60000; const receipt = req.body?.receipt;
  let method = 'student'; let lateByNetwork = false; let note = '';
  if (late) {
    // After the server's deadline only what the server already holds is marked. A valid signed receipt for it, shown inside the grace period, means the answers were saved in time and only the hand-in was delayed.
    const sig = E.verifyReceipt(att._id, receipt) && receipt.seq <= att.lastSeq && E.saveReceipt(att._id, att.lastSeq, att.answers).hash === receipt.hash && receipt.seq === att.lastSeq;
    if (sig && Date.now() <= att.dueAt.getTime() + grace) { lateByNetwork = true; note = 'Your answers were saved before time ran out. Handed in late because of the connection.'; } else { method = 'timeout'; note = 'Time was up. The answers saved before time ran out were marked.'; }
  } else { const answers = validAnswers(req.body?.answers); if (answers === null) return bad(res, 400, 'The answers were not in the right shape.'); if (Object.keys(answers).length) att.answers = { ...(att.answers || {}), ...answers }; }
  const r = await Attempt.updateOne({ _id: att._id, status: 'InProgress' }, { $set: { status: 'Submitted', submittedAt: late ? att.dueAt : new Date(), submitMethod: method, lateByNetwork, ...(late ? {} : { answers: att.answers }) } });
  if (!r.modifiedCount) return bad(res, 409, 'You have already handed this in.');
  const f = await Attempt.findById(att._id); await S.gradeAttempt(f, a, await S.itemsByRef(schoolId, a.items.map((i) => i.ref))); await f.save();
  await audit(req, { action: 'assess.attempt.submit', entityType: 'AssessAttempt', entityId: att._id, schoolId, detail: { method, lateByNetwork } });
  res.json({ ok: true, status: f.status, note, resultAfterRelease: true, late: lateByNetwork });
});

// ── results ──
const itemView = (att, a, by, show) => att.items.map((i, n) => { const it = by.get(String(i.ref)); const score = ['Auto', 'Final'].includes(i.state) ? (i.final ?? i.auto ?? 0) : null;
  return { no: n + 1, ref: i.ref, kind: i.kind, plain: Notation.plain(it?.stem || ''), max: i.max, score, pending: !['Auto', 'Final'].includes(i.state), answer: (att.answers || {})[String(i.ref)], feedback: i.state === 'Final' ? (i.mod?.comment || i.m2?.comment || i.m1?.comment || '') : '',
    ...(show && it ? { correct: it.kind === 'short' ? it.accepted : it.kind === 'numeric' ? it.numAnswer : (it.options || []).filter((o) => o.correct).map((o) => o.id), options: (it.options || []).map((o) => ({ id: o.id, text: o.text, correct: o.correct })), explanation: it.explanation } : {}) }; });
async function resultPayload(schoolId, att, a) {
  const by = await S.itemsByRef(schoolId, a.items.map((i) => i.ref)); const closed = a.status === 'Closed' || (a.settings.closesAt && new Date(a.settings.closesAt) < new Date()); const show = a.settings.showAnswers && closed;
  const appeal = await Appeal.findOne({ schoolId, attemptId: att._id }).sort({ createdAt: -1 }); const releasedAt = a.release.releasedAt || a.release.scheduledAt; const deadline = releasedAt ? new Date(new Date(releasedAt).getTime() + a.settings.appealDays * 86400000) : null;
  return { attemptId: att._id, title: a.title, kind: a.kind, status: att.status, total: att.total, max: att.max, pct: att.pct, passed: att.passed, resultVersion: att.resultVersion, signature: att.signature ? att.signature.slice(0, 16) : null, submittedAt: att.submittedAt, late: att.lateByNetwork, pendingMarks: att.items.filter((i) => !['Auto', 'Final'].includes(i.state)).length, items: itemView(att, a, by, show),
    appeal: appeal ? { _id: appeal._id, status: appeal.status, note: appeal.status === 'Requested' || appeal.status === 'InReview' ? '' : appeal.note, before: appeal.before, after: appeal.after } : null, canAppeal: !!deadline && deadline > new Date() && att.status === 'Graded' && !(appeal && ['Requested', 'InReview'].includes(appeal.status)), appealBy: deadline };
}
exports.result = wrap('result', async (req, res) => {
  const schoolId = sid(req); const att = await ownAttempt(req, req.params.id); if (!att) return bad(res, 404, 'Attempt not found.'); const a = await Assessment.findOne({ _id: att.assessmentId, schoolId });
  if (!S.isReleased(a)) return bad(res, 423, 'Results have not been released yet.'); if (!['Graded', 'Marking'].includes(att.status)) return bad(res, 422, 'This attempt has no result.'); res.json(await resultPayload(schoolId, att, a));
});

exports.appeal = wrap('appeal', async (req, res) => {
  const schoolId = sid(req); const att = await ownAttempt(req, req.params.id); if (!att) return bad(res, 404, 'Attempt not found.'); const a = await Assessment.findOne({ _id: att.assessmentId, schoolId }); if (!S.isReleased(a)) return bad(res, 423, 'Results have not been released yet.');
  if (att.status !== 'Graded') return bad(res, 422, 'Wait until every answer has been marked.'); const at = a.release.releasedAt || a.release.scheduledAt; if (new Date(at).getTime() + a.settings.appealDays * 86400000 < Date.now()) return bad(res, 422, `The ${a.settings.appealDays}-day appeal period has ended.`);
  const reason = str(req.body?.reason, 1000); if (reason.length < 10) return bad(res, 400, 'Tell us what you think is wrong (at least a sentence).'); const refs = (Array.isArray(req.body?.refs) ? req.body.refs : []).map(oid).filter(Boolean).filter((r) => att.items.some((i) => String(i.ref) === String(r)));
  if (await Appeal.countDocuments({ schoolId, attemptId: att._id, status: { $in: ['Requested', 'InReview'] } })) return bad(res, 409, 'You already have an appeal open for this result.');
  const doc = await Appeal.create({ schoolId, assessmentId: a._id, attemptId: att._id, studentId: att.studentId, refs, reason, status: 'Requested', before: att.total, requestedById: oid(req.user.userId), requestedByRole: 'student' });
  const st = await me(req); await N.notify({ schoolId, recipients: await N.admins(schoolId), title: 'Result appeal', body: `${st?.name || 'A student'} asked for ${a.title} to be looked at again.`, link: '/admin/dashboard#/assessments', type: 'general' });
  await audit(req, { action: 'assess.appeal.create', entityType: 'AssessAppeal', entityId: doc._id, schoolId, detail: { attemptId: att._id } }); res.status(201).json({ appeal: { _id: doc._id, status: doc.status } });
});

exports.results = wrap('results', async (req, res) => {
  const schoolId = sid(req); const st = await me(req); const att = await Attempt.find({ schoolId, studentId: st._id, status: { $in: ['Graded', 'Marking'] } }).select('-variant -answers').sort({ submittedAt: -1 }).limit(100);
  const as = await Assessment.find({ schoolId, _id: { $in: att.map((x) => x.assessmentId) } }); const by = new Map(as.map((x) => [String(x._id), x]));
  res.json({ results: att.filter((x) => by.get(String(x.assessmentId)) && S.isReleased(by.get(String(x.assessmentId)))).map((x) => { const a = by.get(String(x.assessmentId)); return { attemptId: x.attemptId || x._id, title: a.title, kind: a.kind, total: x.total, max: x.max, pct: x.pct, passed: x.passed, status: x.status, submittedAt: x.submittedAt }; }) });
});

// ── family (CAP-0325): released results only, and only for children whose guardian rights include marks ──
exports.family = wrap('family', async (req, res) => {
  const schoolId = sid(req); const parent = await Parent.findOne({ _id: oid(req.user.userId), schoolId }); if (!parent) return res.json({ results: [] });
  const ids = (parent.children || []).map(String); const rights = await G.resolveForParent(schoolId, parent, ids); const ok = ids.filter((id) => rights.get(id)?.linked && rights.get(id)?.rights?.viewMarks === true); if (!ok.length) return res.json({ results: [] });
  const att = await Attempt.find({ schoolId, studentId: { $in: ok.map(oid) }, status: { $in: ['Graded', 'Marking'] } }).select('-variant -answers').sort({ submittedAt: -1 }).limit(200);
  const as = await Assessment.find({ schoolId, _id: { $in: att.map((x) => x.assessmentId) } }); const by = new Map(as.map((x) => [String(x.assessmentId || x._id), x])); const names = new Map((await Student.find({ schoolId, _id: { $in: ok.map(oid) } }).select('name')).map((s) => [String(s._id), s.name]));
  const asBy = new Map(as.map((x) => [String(x._id), x]));
  res.json({ results: att.map((x) => ({ x, a: asBy.get(String(x.assessmentId)) })).filter((r) => r.a && S.isReleased(r.a)).map(({ x, a }) => ({ attemptId: x._id, studentId: x.studentId, studentName: names.get(String(x.studentId)) || '', title: a.title, kind: a.kind, total: x.total, max: x.max, pct: x.pct, passed: x.passed, status: x.status, pendingMarks: x.items.filter((i) => !['Auto', 'Final'].includes(i.state)).length, submittedAt: x.submittedAt })) });
});
exports.resultPayload = resultPayload;
