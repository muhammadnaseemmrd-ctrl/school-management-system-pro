// Marking, moderation, appeals and access arrangements for online assessments (PRD E13: CAP-0314, 0315, 0318, 0321, 0322, 0326).
const Assessment = require('../models/Assessment');
const Attempt = require('../models/AssessAttempt');
const Appeal = require('../models/AssessAppeal');
const Access = require('../models/AssessAccess');
const Rubric = require('../models/Rubric');
const Student = require('../models/Student');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');
const Notation = require('../utils/assess/notation');
const E = require('../utils/assess/engine');
const S = require('../utils/assess/service');

const { oid, sid, who, bad, wrap } = S;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const is025 = (n) => Number.isFinite(n) && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9;
const mark = (m) => (m ? { score: m.score, criteria: m.criteria, comment: m.comment, byName: m.byName, at: m.at } : null);

async function loadAttempt(req, id) {
  const schoolId = sid(req); const att = await Attempt.findOne({ _id: oid(id), schoolId }); if (!att) return { err: [404, 'Attempt not found.'] };
  const a = await Assessment.findOne({ _id: att.assessmentId, schoolId }); if (!a) return { err: [404, 'Quiz not found.'] }; const scope = await S.scopeOf(req); if (!S.canSee(scope, a)) return { err: [404, 'Attempt not found.'] };
  return { att, a, scope };
}
// What a given marker may see of one item: the first mark is hidden from the second marker, and both are hidden from the moderator's own judgement only by the discrepancy rule
function stageFor(item, a) { if (['Auto', 'Final'].includes(item.state)) return 'done'; if (!a.settings.dualMarking) return 'm1'; if (!item.m1?.score && item.m1?.score !== 0) return 'm1'; if (!item.m2?.score && item.m2?.score !== 0) return 'm2'; return 'mod'; }
const myTurn = (item, a, uid) => { const st = stageFor(item, a); if (st === 'done') return false; const by = (m) => m?.by && String(m.by) === String(uid); if (st === 'm1') return true; if (st === 'm2') return !by(item.m1); if (st === 'mod') return !by(item.m1) && !by(item.m2); return false; };

exports.queue = wrap('queue', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const uid = req.user.userId; const q = { schoolId, status: 'Marking' }; if (oid(req.query.assessmentId)) q.assessmentId = oid(req.query.assessmentId);
  const attempts = await Attempt.find(q).select('-variant').sort({ submittedAt: 1 }).limit(300); const as = await Assessment.find({ schoolId, _id: { $in: [...new Set(attempts.map((x) => String(x.assessmentId)))].map(oid) } }); const by = new Map(as.map((x) => [String(x._id), x]));
  const names = new Map((await Student.find({ schoolId, _id: { $in: attempts.map((x) => x.studentId) } }).select('name admissionNumber')).map((s) => [String(s._id), s]));
  const rows = []; const cand = {};
  for (const att of attempts) { const a = by.get(String(att.assessmentId)); if (!a || !S.canSee(scope, a)) continue; cand[String(a._id)] ||= {}; const c = (cand[String(a._id)][String(att.studentId)] ||= Object.keys(cand[String(a._id)]).length + 1);
    const todo = att.items.filter((i) => !['Auto', 'Final'].includes(i.state)); const mine = todo.filter((i) => myTurn(i, a, uid));
    rows.push({ attemptId: att._id, assessmentId: a._id, title: a.title, dual: !!a.settings.dualMarking, candidate: a.settings.dualMarking ? `Candidate ${String(c).padStart(3, '0')}` : (names.get(String(att.studentId))?.name || ''), submittedAt: att.submittedAt, waiting: todo.length, yourTurn: mine.length, stages: { m1: todo.filter((i) => stageFor(i, a) === 'm1').length, m2: todo.filter((i) => stageFor(i, a) === 'm2').length, mod: todo.filter((i) => stageFor(i, a) === 'mod').length } }); }
  res.json({ rows });
});

exports.grader = wrap('grader', async (req, res) => {
  const schoolId = sid(req); const { att, a, err } = await loadAttempt(req, req.params.id); if (err) return bad(res, ...err); const uid = req.user.userId; const by = await S.itemsByRef(schoolId, a.items.map((i) => i.ref)); const st = await Student.findOne({ _id: att.studentId, schoolId }).select('name admissionNumber');
  const rubricIds = [...new Set(a.items.map((i) => by.get(String(i.ref))?.rubricId).filter(Boolean).map(String))]; const rubrics = new Map((await Rubric.find({ schoolId, _id: { $in: rubricIds.map(oid) } })).map((r) => [String(r._id), r]));
  res.json({ attemptId: att._id, title: a.title, status: att.status, dual: !!a.settings.dualMarking, discrepancyPct: a.settings.discrepancyPct, student: a.settings.dualMarking && att.status === 'Marking' ? { name: 'Hidden while marking', admissionNumber: '' } : { name: st?.name, admissionNumber: st?.admissionNumber }, total: att.total, max: att.max, incidents: att.incidents, focus: { left: (att.focus || []).filter((f) => f.kind === 'left').length }, late: att.lateByNetwork, submitMethod: att.submitMethod,
    items: att.items.map((i, n) => { const it = by.get(String(i.ref)); const stage = stageFor(i, a); const rub = it?.rubricId ? rubrics.get(String(it.rubricId)) : null; const own = (m) => m?.by && String(m.by) === String(uid);
      return { no: n + 1, ref: i.ref, kind: i.kind, plain: Notation.plain(it?.stem || ''), max: i.max, auto: i.auto, state: i.state, stage, yourTurn: myTurn(i, a, uid), answer: (att.answers || {})[String(i.ref)], accepted: it?.accepted, needsReview: i.needsReview, rubric: rub ? { _id: rub._id, name: rub.name, criteria: rub.criteria, comments: rub.comments } : null,
        // blind second marking: the second marker never sees the first mark; the moderator sees both
        m1: stage === 'm2' && !own(i.m1) ? null : mark(i.m1), m2: stage === 'mod' || i.state === 'Final' || own(i.m2) ? mark(i.m2) : null, mod: mark(i.mod), final: i.final }; }) });
});

async function score(req, item, it, b, schoolId) {
  let points = Number(b.score); const crit = Array.isArray(b.criteria) ? b.criteria : null; let criteria;
  if (it?.rubricId && crit && crit.length) { const r = await Rubric.findOne({ _id: it.rubricId, schoolId }); if (!r) return { error: 'Rubric not found.' }; criteria = []; points = 0;
    for (const c of r.criteria) { const g = crit.find((x) => String(x.id) === String(c.id)); if (!g) return { error: `Score "${c.name}" too.` }; const lvl = c.levels.find((l) => l.points === Number(g.points)); if (!lvl) return { error: `"${c.name}": choose one of the levels.` }; criteria.push({ id: c.id, points: lvl.points }); points += lvl.points; } }
  if (!Number.isFinite(points) || b.score === '' || (b.score === undefined && !criteria)) return { error: 'Give a mark.' }; if (points < 0 || points > item.max) return { error: `The mark must be between 0 and ${item.max}.` }; if (!is025(points)) return { error: 'Marks go in steps of 0.25.' };
  return { points, criteria };
}

exports.mark = wrap('mark', async (req, res) => {
  const schoolId = sid(req); const { att, a, err } = await loadAttempt(req, req.params.id); if (err) return bad(res, ...err); const w = who(req);
  if (att.status !== 'Marking') return bad(res, 422, att.status === 'Graded' ? 'This attempt is already marked. Use an appeal to change a mark.' : 'This attempt is not ready for marking.');
  const item = att.items.find((i) => String(i.ref) === String(req.params.ref)); if (!item) return bad(res, 404, 'Question not found in this attempt.'); const stage = stageFor(item, a); if (stage === 'done') return bad(res, 409, 'This answer is already marked.');
  if (!myTurn(item, a, w.id)) return bad(res, 403, stage === 'm2' ? 'A different person must give the second mark.' : 'A third person who has not marked this answer must moderate it.');
  const it = (await S.itemsByRef(schoolId, [item.ref])).get(String(item.ref)); const r = await score(req, item, it, req.body || {}, schoolId); if (r.error) return bad(res, 400, r.error);
  const m = { by: w.id, byName: w.name, byRole: w.role, score: r.points, criteria: r.criteria, comment: str(req.body?.comment, 1000), at: new Date() }; const idx = att.items.indexOf(item); const next = [...att.items];
  const it2 = { ...(item.toObject ? item.toObject() : item) }; let outcome;
  if (stage === 'm1') { it2.m1 = m; if (!a.settings.dualMarking) { it2.final = r.points; it2.state = 'Final'; outcome = 'final'; } else { it2.state = 'Marked1'; outcome = 'waiting second marker'; } }
  else if (stage === 'm2') { it2.m2 = m; const gap = Math.abs((it2.m1.score ?? 0) - r.points) / (item.max || 1) * 100;
    if (gap > a.settings.discrepancyPct) { it2.state = 'Moderation'; outcome = 'moderation'; } else { it2.final = Math.round(((it2.m1.score + r.points) / 2) * 4) / 4; it2.state = 'Final'; outcome = 'final'; } }
  else { it2.mod = m; it2.final = r.points; it2.state = 'Final'; outcome = 'final'; }
  next[idx] = it2; att.items = next; const { pending } = S.recompute(att);
  if (!pending) { att.status = 'Graded'; att.passed = att.pct >= (a.settings.passPct || 0); att.signature = E.resultSignature(att); att.signedAt = new Date(); }
  att.history = [...(att.history || []), { at: new Date(), by: w.id, byName: w.name, action: `mark.${stage}`, detail: `${r.points}/${item.max}` }]; await att.save();
  await audit(req, { action: 'assess.mark', entityType: 'AssessAttempt', entityId: att._id, schoolId, detail: { ref: item.ref, stage, outcome } }); res.json({ ok: true, stage, outcome, graded: att.status === 'Graded', total: att.total, pct: att.pct, remaining: pending });
});

exports.incident = wrap('incident', async (req, res) => {
  const { att, err } = await loadAttempt(req, req.params.id); if (err) return bad(res, ...err); const note = str(req.body?.note, 400); if (note.length < 3) return bad(res, 400, 'Say what happened.'); const w = who(req);
  att.incidents = [...(att.incidents || []), { note, severity: ['note', 'warning', 'serious'].includes(req.body?.severity) ? req.body.severity : 'note', by: w.id, byName: w.name, at: new Date() }]; await att.save(); await audit(req, { action: 'assess.incident', entityType: 'AssessAttempt', entityId: att._id, schoolId: sid(req), detail: { severity: req.body?.severity } }); res.status(201).json({ incidents: att.incidents });
});
exports.voidAttempt = wrap('void', async (req, res) => {
  if (req.user.role !== 'admin') return bad(res, 403, 'Only an administrator can void an attempt.'); const { att, err } = await loadAttempt(req, req.params.id); if (err) return bad(res, ...err); const reason = str(req.body?.reason, 300); if (reason.length < 5) return bad(res, 400, 'Say why this attempt is being voided.'); if (att.status === 'Voided') return bad(res, 409, 'Already voided.');
  const w = who(req); att.status = 'Voided'; att.countsAsAttempt = false; att.voidReason = reason; att.history = [...(att.history || []), { at: new Date(), by: w.id, byName: w.name, action: 'void', detail: reason }]; await att.save(); await audit(req, { action: 'assess.void', entityType: 'AssessAttempt', entityId: att._id, schoolId: sid(req), detail: { reason } });
  await N.notify({ schoolId: sid(req), recipients: [{ id: att.studentId, role: 'student' }], title: 'An attempt was cancelled', body: 'You can write this again if attempts are left. Ask your teacher if you have questions.', link: '/student/dashboard#/assessments', type: 'general' }); res.json({ ok: true });
});

// ── appeals ──
const appealView = (p, att, st) => ({ _id: p._id, assessmentId: p.assessmentId, attemptId: p.attemptId, studentName: st?.name, reason: p.reason, refs: p.refs, status: p.status, reviewerName: p.reviewerName, decidedAt: p.decidedAt, note: p.note, before: p.before, after: p.after, changes: p.changes, resultVersion: p.resultVersion, createdAt: p.createdAt, markers: att ? [...new Set(att.items.flatMap((i) => [i.m1?.byName, i.m2?.byName, i.mod?.byName]).filter(Boolean))] : [] });
exports.appeals = wrap('appeals', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; if (['Requested', 'InReview', 'Upheld', 'Rejected', 'Revised'].includes(req.query.status)) q.status = req.query.status; const rows = await Appeal.find(q).sort({ createdAt: -1 }).limit(200);
  const as = new Map((await Assessment.find({ schoolId, _id: { $in: rows.map((r) => r.assessmentId) } })).map((a) => [String(a._id), a])); const atts = new Map((await Attempt.find({ schoolId, _id: { $in: rows.map((r) => r.attemptId) } })).map((x) => [String(x._id), x]));
  const sts = new Map((await Student.find({ schoolId, _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((s) => [String(s._id), s]));
  res.json({ appeals: rows.filter((r) => as.get(String(r.assessmentId)) && S.canSee(scope, as.get(String(r.assessmentId)))).map((r) => ({ ...appealView(r, atts.get(String(r.attemptId)), sts.get(String(r.studentId))), title: as.get(String(r.assessmentId)).title })) });
});
exports.decideAppeal = wrap('decideAppeal', async (req, res) => {
  const schoolId = sid(req); const p = await Appeal.findOne({ _id: oid(req.params.id), schoolId }); if (!p) return bad(res, 404, 'Appeal not found.'); const { att, a, err } = await loadAttempt(req, p.attemptId); if (err) return bad(res, 404, 'Appeal not found.'); const w = who(req); const b = req.body || {};
  if (!['Requested', 'InReview'].includes(p.status)) return bad(res, 409, 'This appeal is already decided.');
  const marked = att.items.some((i) => [i.m1, i.m2, i.mod].some((m) => m?.by && String(m.by) === String(w.id))); if (marked) return bad(res, 403, 'You marked part of this work, so someone else must review the appeal.');
  const decision = ['uphold', 'reject', 'revise'].includes(b.decision) ? b.decision : null; if (!decision) return bad(res, 400, 'Choose uphold, reject or revise.'); const note = str(b.note, 1000); if (note.length < 5) return bad(res, 400, 'Explain the decision.');
  if (decision === 'uphold' || decision === 'reject') { // "uphold" = the original mark stands
    const r = await Appeal.updateOne({ _id: p._id, status: { $in: ['Requested', 'InReview'] } }, { $set: { status: decision === 'uphold' ? 'Upheld' : 'Rejected', reviewerId: w.id, reviewerName: w.name, decidedAt: new Date(), note, after: att.total, resultVersion: att.resultVersion } }); if (!r.modifiedCount) return bad(res, 409, 'This appeal is already decided.');
  } else {
    const changes = []; const items = [...att.items]; const list = Array.isArray(b.changes) ? b.changes : []; if (!list.length) return bad(res, 400, 'Say which marks change.');
    for (const c of list) { const i = items.findIndex((x) => String(x.ref) === String(c.ref)); if (i < 0) return bad(res, 404, 'One of the questions is not in this attempt.'); const s = Number(c.score); if (!(s >= 0 && s <= items[i].max) || !is025(s)) return bad(res, 400, `A revised mark must be between 0 and ${items[i].max}, in steps of 0.25.`);
      const before = items[i].final ?? items[i].auto ?? 0; if (before === s) continue; changes.push({ ref: items[i].ref, before, after: s }); items[i] = { ...(items[i].toObject ? items[i].toObject() : items[i]), final: s, state: 'Final' }; }
    if (!changes.length) return bad(res, 400, 'None of the marks would change. Choose uphold instead.'); const before = att.total;
    const r = await Appeal.updateOne({ _id: p._id, status: { $in: ['Requested', 'InReview'] } }, { $set: { status: 'Revised' } }); if (!r.modifiedCount) return bad(res, 409, 'This appeal is already decided.');
    att.items = items; S.recompute(att); att.passed = att.pct >= (a.settings.passPct || 0); att.resultVersion = (att.resultVersion || 1) + 1; att.signature = E.resultSignature(att); att.signedAt = new Date(); att.history = [...(att.history || []), { at: new Date(), by: w.id, byName: w.name, action: 'appeal.revise', detail: `${before} to ${att.total}` }]; await att.save();
    await Appeal.updateOne({ _id: p._id }, { $set: { reviewerId: w.id, reviewerName: w.name, decidedAt: new Date(), note, before, after: att.total, changes, resultVersion: att.resultVersion, signature: att.signature } });
  }
  const fresh = await Appeal.findById(p._id); await audit(req, { action: 'assess.appeal.decide', entityType: 'AssessAppeal', entityId: p._id, schoolId, detail: { decision, before: fresh.before, after: fresh.after } });
  await N.notify({ schoolId, recipients: await N.studentAndParents(schoolId, [att.studentId]), title: `Appeal decided: ${a.title}`, body: decision === 'revise' ? `Your mark was changed to ${att.total} out of ${att.max}.` : 'The original mark stands.', link: { student: '/student/dashboard#/assessments', parent: '/parent/dashboard' }, type: 'marks' });
  res.json({ appeal: appealView(fresh, att, null), total: att.total, resultVersion: att.resultVersion });
});

// ── access arrangements and make-up windows ──
const accView = (r, sees, names) => ({ _id: r._id, studentId: r.studentId, studentName: names?.get(String(r.studentId)) || '', assessmentId: r.assessmentId, mode: r.mode, status: r.status, extraTimePct: r.extraTimePct, extraAttempts: r.extraAttempts, largeText: r.largeText, readAloud: r.readAloud, separateSitting: r.separateSitting, opensAt: r.opensAt, closesAt: r.closesAt, validFrom: r.validFrom, validTo: r.validTo, reason: sees ? r.reason : undefined, requestedByName: r.requestedByName, decidedByName: r.decidedByName, decisionNote: r.decisionNote, createdAt: r.createdAt });
exports.accessList = wrap('accessList', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; if (['Requested', 'Active', 'Declined', 'Revoked'].includes(req.query.status)) q.status = req.query.status; if (oid(req.query.studentId)) q.studentId = oid(req.query.studentId); if (oid(req.query.assessmentId)) q.assessmentId = oid(req.query.assessmentId);
  const rows = await Access.find(q).sort({ createdAt: -1 }).limit(300); const studs = await Student.find({ schoolId, _id: { $in: rows.map((r) => r.studentId) } }).select('name classId'); const names = new Map(studs.map((s) => [String(s._id), s.name])); const cls = new Map(studs.map((s) => [String(s._id), s.classId]));
  const shown = rows.filter((r) => scope.admin || (r.requestedById && String(r.requestedById) === scope.teacherId) || S.covers(scope, cls.get(String(r.studentId)), null));
  res.json({ access: shown.map((r) => accView(r, scope.admin || String(r.requestedById) === String(req.user.userId), names)) });
});
exports.accessCreate = wrap('accessCreate', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const w = who(req); const b = req.body || {}; const st = await Student.findOne({ _id: oid(b.studentId), schoolId }).select('name classId'); if (!st) return bad(res, 404, 'Student not found.');
  if (!scope.admin && !S.covers(scope, st.classId, null)) return bad(res, 403, 'You can only request this for students in your classes.'); const mode = b.mode === 'makeup' ? 'makeup' : 'access'; const reason = str(b.reason, 500); if (reason.length < 5) return bad(res, 400, 'Say why (this is only seen by administrators and you).');
  let assessmentId; if (b.assessmentId) { const a = await Assessment.findOne({ _id: oid(b.assessmentId), schoolId }); if (!a || !a.classIds.some((c) => String(c) === String(st.classId))) return bad(res, 404, 'Quiz not found for this student\'s class.'); if (!scope.admin && !S.canSee(scope, a)) return bad(res, 403, 'You can only do this for quizzes you teach.'); assessmentId = a._id; }
  const d = (v) => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : undefined; };
  const doc = { schoolId, studentId: st._id, assessmentId, mode, status: 'Requested', extraTimePct: Math.min(100, Math.max(0, Math.round(Number(b.extraTimePct) || 0))), extraAttempts: Math.min(5, Math.max(0, Math.round(Number(b.extraAttempts) || 0))), largeText: !!b.largeText, readAloud: !!b.readAloud, separateSitting: !!b.separateSitting, validFrom: d(b.validFrom), validTo: d(b.validTo), reason, requestedById: w.id, requestedByName: w.name, requestedByRole: w.role };
  if (mode === 'makeup') { if (!assessmentId) return bad(res, 400, 'Choose the quiz this make-up is for.'); doc.opensAt = d(b.opensAt); doc.closesAt = d(b.closesAt); if (!doc.opensAt || !doc.closesAt || doc.closesAt <= doc.opensAt) return bad(res, 400, 'Give a make-up window with a closing time after the opening time.'); if (doc.closesAt < new Date()) return bad(res, 400, 'The make-up window has already passed.'); doc.extraAttempts = Math.max(1, doc.extraAttempts); }
  else if (!doc.extraTimePct && !doc.largeText && !doc.readAloud && !doc.separateSitting && !doc.extraAttempts) return bad(res, 400, 'Choose at least one arrangement.');
  if (doc.validFrom && doc.validTo && doc.validTo < doc.validFrom) return bad(res, 400, '"Valid to" is before "valid from".');
  if (req.user.role === 'admin') { doc.status = 'Active'; doc.decidedById = w.id; doc.decidedByName = w.name; doc.decidedAt = new Date(); doc.decisionNote = 'Entered by an administrator'; }
  const row = await Access.create(doc); await audit(req, { action: 'assess.access.create', entityType: 'AssessAccess', entityId: row._id, schoolId, detail: { mode, status: row.status } });
  if (row.status === 'Requested') await N.notify({ schoolId, recipients: await N.admins(schoolId), title: mode === 'makeup' ? 'Make-up request' : 'Exam arrangement request', body: `${w.name} asked on behalf of ${st.name}.`, link: '/admin/dashboard#/assessments', type: 'general' });
  else await N.notify({ schoolId, recipients: [{ id: st._id, role: 'student' }], title: mode === 'makeup' ? 'You have a make-up window' : 'Your exam arrangements are set', body: mode === 'makeup' ? `Opens ${doc.opensAt.toLocaleString('en-GB')}.` : 'They will apply automatically when you start.', link: '/student/dashboard#/assessments', type: 'general' });
  res.status(201).json({ access: accView(row, true) });
});
exports.accessDecide = wrap('accessDecide', async (req, res) => {
  const schoolId = sid(req); if (req.user.role !== 'admin') return bad(res, 403, 'Only an administrator decides on exam arrangements.'); const r = await Access.findOne({ _id: oid(req.params.id), schoolId }); if (!r) return bad(res, 404, 'Request not found.'); const w = who(req);
  if (r.status !== 'Requested') return bad(res, 409, `This request is already ${r.status.toLowerCase()}.`); const ok = req.body?.decision === 'approve'; const note = str(req.body?.note, 300); if (!ok && note.length < 3) return bad(res, 400, 'Say why it is declined.');
  const up = await Access.updateOne({ _id: r._id, status: 'Requested' }, { $set: { status: ok ? 'Active' : 'Declined', decidedById: w.id, decidedByName: w.name, decidedAt: new Date(), decisionNote: note } }); if (!up.modifiedCount) return bad(res, 409, 'Someone else already decided this.');
  await audit(req, { action: 'assess.access.decide', entityType: 'AssessAccess', entityId: r._id, schoolId, detail: { ok } });
  if (ok) await N.notify({ schoolId, recipients: [{ id: r.studentId, role: 'student' }, ...(r.requestedById ? [{ id: r.requestedById, role: r.requestedByRole === 'admin' ? 'admin' : 'teacher' }] : [])], title: r.mode === 'makeup' ? 'Make-up approved' : 'Exam arrangements approved', body: r.mode === 'makeup' ? `Window: ${r.opensAt.toLocaleString('en-GB')} to ${r.closesAt.toLocaleString('en-GB')}.` : 'They apply automatically when you start.', link: '/student/dashboard#/assessments', type: 'general' });
  else if (r.requestedById) await N.notify({ schoolId, recipients: [{ id: r.requestedById, role: r.requestedByRole === 'admin' ? 'admin' : 'teacher' }], title: 'Request declined', body: note, link: '/teacher/dashboard#/assessments', type: 'general' });
  res.json({ access: accView(await Access.findById(r._id), true) });
});
exports.accessRevoke = wrap('accessRevoke', async (req, res) => {
  const schoolId = sid(req); if (req.user.role !== 'admin') return bad(res, 403, 'Only an administrator can withdraw arrangements.'); const r = await Access.findOne({ _id: oid(req.params.id), schoolId }); if (!r) return bad(res, 404, 'Request not found.'); if (r.status !== 'Active') return bad(res, 409, 'Only active arrangements can be withdrawn.');
  const note = str(req.body?.note, 300); if (note.length < 3) return bad(res, 400, 'Say why.'); const w = who(req); r.status = 'Revoked'; r.decidedById = w.id; r.decidedByName = w.name; r.decidedAt = new Date(); r.decisionNote = note; await r.save(); await audit(req, { action: 'assess.access.revoke', entityType: 'AssessAccess', entityId: r._id, schoolId, detail: { note } }); res.json({ access: accView(r, true) });
});
