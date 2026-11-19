// Quizzes and online exams: blueprint, review, publish, sealing, release, roster and item analysis (PRD E13).
const crypto = require('crypto');
const Assessment = require('../models/Assessment');
const Item = require('../models/QuestionItem');
const Attempt = require('../models/AssessAttempt');
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');
const Notation = require('../utils/assess/notation');
const E = require('../utils/assess/engine');
const S = require('../utils/assess/service');

const { oid, sid, who, bad, wrap } = S;
const str = (v, n) => String(v ?? '').trim().slice(0, n); const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const date = (v) => { if (!v) return undefined; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; };

function cleanSettings(b = {}, prev = {}) {
  const s = { ...prev };
  if (b.durationMin !== undefined) s.durationMin = Math.round(num(b.durationMin, 1, 300, 30)); if (b.attemptsMax !== undefined) s.attemptsMax = Math.round(num(b.attemptsMax, 1, 10, 1));
  if (b.passPct !== undefined) s.passPct = num(b.passPct, 0, 100, 40); if (b.discrepancyPct !== undefined) s.discrepancyPct = num(b.discrepancyPct, 1, 50, 15);
  if (b.reconnectGraceMin !== undefined) s.reconnectGraceMin = Math.round(num(b.reconnectGraceMin, 0, 30, 5)); if (b.offlineGraceMin !== undefined) s.offlineGraceMin = Math.round(num(b.offlineGraceMin, 0, 60, 15)); if (b.appealDays !== undefined) s.appealDays = Math.round(num(b.appealDays, 1, 30, 7));
  for (const k of ['shuffleQuestions', 'shuffleOptions', 'showAnswers', 'dualMarking']) if (b[k] !== undefined) s[k] = !!b[k];
  if (['best', 'last', 'average'].includes(b.scoring)) s.scoring = b.scoring; if (['resume', 'single-sitting'].includes(b.resume)) s.resume = b.resume; if (['login', 'admission', 'invigilator'].includes(b.identity)) s.identity = b.identity;
  if (b.opensAt !== undefined) s.opensAt = date(b.opensAt) || null; if (b.closesAt !== undefined) s.closesAt = date(b.closesAt) || null;
  return s;
}
const itemRow = (i, marks) => ({ ref: i._id, itemKey: i.itemKey, version: i.version, marks: marks || i.marks, kind: i.kind, topic: i.topic, difficulty: i.difficulty });
const total = (items) => Math.round(items.reduce((s, i) => s + (i.marks || 0), 0) * 100) / 100;

const sealedKey = (a) => a.kind === 'quiz' ? a.status !== 'Published' || false : (a.status !== 'Published' && a.status !== 'Review' ? true : false);
// keys are visible to the author while a paper is being written; once published, only after the window closes or an administrator authorises it
function keyVisible(a) { if (['Draft', 'Review'].includes(a.status)) return true; if (a.sealed?.keyAuthorizedAt) return true; const c = a.settings?.closesAt; return a.status === 'Closed' || a.status === 'Archived' || (!!c && new Date(c) < new Date()); }
function view(a, { keys = false, byRef = null, counts = null } = {}) {
  const showKey = keys && keyVisible(a);
  return { _id: a._id, title: a.title, kind: a.kind, subjectId: a.subjectId, classIds: a.classIds, instructions: a.instructions, instructionsUr: a.instructionsUr, source: a.source, blueprint: a.blueprint, settings: a.settings, status: a.status, totalMarks: a.totalMarks, review: a.review, release: a.release, authorId: a.authorId, authorName: a.authorName, keySealed: !keyVisible(a), keyAuthorizedAt: a.sealed?.keyAuthorizedAt, createdAt: a.createdAt, updatedAt: a.updatedAt, ...(counts ? { counts } : {}),
    items: a.items.map((r) => { const it = byRef?.get(String(r.ref)); return { ref: r.ref, itemKey: r.itemKey, version: r.version, marks: r.marks, kind: r.kind, topic: r.topic, difficulty: r.difficulty, ...(it ? { stem: it.stem, plain: Notation.plain(it.stem), state: it.state, ...(showKey ? { options: it.options, pairs: it.pairs, sequence: it.sequence, accepted: it.accepted, numAnswer: it.numAnswer, numTolerance: it.numTolerance, explanation: it.explanation } : { options: (it.options || []).map((o) => ({ id: o.id, text: o.text })) }) } : {}) }; }) };
}
const load = async (req, id, edit = false) => { const a = await Assessment.findOne({ _id: oid(id), schoolId: sid(req) }); if (!a) return { err: [404, 'Quiz not found.'] }; const scope = await S.scopeOf(req); if (!S.canSee(scope, a)) return { err: [404, 'Quiz not found.'] }; if (edit && !S.canManage(scope, a)) return { err: [403, 'Only the author or an administrator can change this.'] }; return { a, scope }; };

async function checkTargets(req, scope, classIds, subjectId) {
  const schoolId = sid(req); if (!classIds.length) return 'Choose at least one class.';
  const found = await Class.countDocuments({ schoolId, _id: { $in: classIds } }); if (found !== classIds.length) return 'One of the classes was not found.';
  if (subjectId && !(await Subject.exists({ _id: subjectId, schoolId }))) return 'Subject not found.';
  const out = classIds.find((c) => !S.covers(scope, c, subjectId)); if (out) return 'You can only set quizzes for classes and subjects you teach.'; return null;
}
async function attachItems(req, a, refs) {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const ids = refs.map((r) => oid(r.itemId)).filter(Boolean); const rows = await Item.find({ schoolId, _id: { $in: ids } }); const by = new Map(rows.map((r) => [String(r._id), r]));
  const out = []; for (const r of refs) { const it = by.get(String(r.itemId)); if (!it) return { error: 'One of the questions was not found.' }; if (!require('./assessBankController').visible(scope, it)) return { error: 'You cannot use one of these questions.' }; if (it.state !== 'Active') return { error: 'Only active questions can go into a quiz.' };
    const cur = it.current ? it : await Item.findOne({ schoolId, itemKey: it.itemKey, current: true }); if (!cur || cur.state !== 'Active') return { error: 'Only active questions can go into a quiz.' };
    const marks = r.marks !== undefined && r.marks !== '' ? Number(r.marks) : cur.marks; if (!(marks > 0 && marks <= 100)) return { error: 'Marks must be more than 0 and at most 100.' }; out.push(itemRow(cur, marks)); }
  if (new Set(out.map((x) => x.itemKey)).size !== out.length) return { error: 'The same question is in the quiz twice.' }; return { items: out };
}

exports.list = wrap('list', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; if (['Draft', 'Review', 'Published', 'Closed', 'Archived'].includes(req.query.status)) q.status = req.query.status;
  const rows = (await Assessment.find(q).sort({ updatedAt: -1 }).limit(200)).filter((a) => S.canSee(scope, a));
  const att = await Attempt.find({ schoolId, assessmentId: { $in: rows.map((a) => a._id) } }).select('assessmentId status');
  const c = {}; att.forEach((x) => { const k = String(x.assessmentId); c[k] ||= { started: 0, submitted: 0, marking: 0 }; c[k].started += 1; if (x.status !== 'InProgress') c[k].submitted += 1; if (x.status === 'Marking') c[k].marking += 1; });
  res.json({ assessments: rows.map((a) => ({ ...view(a), items: undefined, itemCount: a.items.length, counts: c[String(a._id)] || { started: 0, submitted: 0, marking: 0 } })) });
});

exports.create = wrap('create', async (req, res) => {
  const schoolId = sid(req); const w = who(req); const b = req.body || {}; const scope = await S.scopeOf(req);
  const title = str(b.title, 120); if (!title) return bad(res, 400, 'Give the quiz a title.');
  const classIds = [...new Set((Array.isArray(b.classIds) ? b.classIds : []).map(oid).filter(Boolean).map(String))].map(oid); const subjectId = oid(b.subjectId) || undefined;
  const e = await checkTargets(req, scope, classIds, subjectId); if (e) return bad(res, e.includes('not found') ? 404 : e.startsWith('Choose') ? 400 : 403, e);
  const settings = cleanSettings(b.settings || {}, { durationMin: 30, shuffleQuestions: true, shuffleOptions: true, attemptsMax: 1, scoring: 'best', resume: 'resume', reconnectGraceMin: 5, offlineGraceMin: 15, identity: 'login', passPct: 40, showAnswers: false, dualMarking: false, discrepancyPct: 15, appealDays: 7 });
  const a = new Assessment({ schoolId, title, kind: b.kind === 'exam' ? 'exam' : 'quiz', subjectId, classIds, instructions: str(b.instructions, 3000), instructionsUr: str(b.instructionsUr, 3000), source: 'fixed', settings, status: 'Draft', seedSalt: crypto.randomBytes(8).toString('hex'), authorId: w.id, authorRole: w.role, authorName: w.name });
  if (Array.isArray(b.itemRefs) && b.itemRefs.length) { const r = await attachItems(req, a, b.itemRefs); if (r.error) return bad(res, 422, r.error); a.items = r.items; a.totalMarks = total(r.items); }
  await a.save(); await audit(req, { action: 'assess.create', entityType: 'Assessment', entityId: a._id, schoolId, detail: { title, kind: a.kind } }); res.status(201).json({ assessment: view(a, { keys: true }) });
});

exports.get = wrap('get', async (req, res) => {
  const { a, err } = await load(req, req.params.id); if (err) return bad(res, ...err);
  const byRef = await S.itemsByRef(sid(req), a.items.map((i) => i.ref)); res.json({ assessment: view(a, { keys: true, byRef }) });
});

exports.update = wrap('update', async (req, res) => {
  const { a, scope, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); const b = req.body || {};
  if (!['Draft', 'Review'].includes(a.status)) return bad(res, 422, 'A published quiz cannot be edited. You can extend its window or close it.');
  if (a.status === 'Review') { a.status = 'Draft'; a.review = { ...a.review, decisionNote: undefined }; }
  if (b.title !== undefined) { const t = str(b.title, 120); if (!t) return bad(res, 400, 'Give the quiz a title.'); a.title = t; }
  if (b.kind !== undefined) a.kind = b.kind === 'exam' ? 'exam' : 'quiz'; if (b.instructions !== undefined) a.instructions = str(b.instructions, 3000); if (b.instructionsUr !== undefined) a.instructionsUr = str(b.instructionsUr, 3000);
  if (b.classIds !== undefined || b.subjectId !== undefined) { const classIds = b.classIds !== undefined ? [...new Set(b.classIds.map(oid).filter(Boolean).map(String))].map(oid) : a.classIds; const subjectId = b.subjectId !== undefined ? (oid(b.subjectId) || undefined) : a.subjectId; const e = await checkTargets(req, scope, classIds, subjectId); if (e) return bad(res, 403, e); a.classIds = classIds; a.subjectId = subjectId; }
  if (b.settings) a.settings = cleanSettings(b.settings, a.settings.toObject ? a.settings.toObject() : a.settings);
  if (Array.isArray(b.itemRefs)) { const r = await attachItems(req, a, b.itemRefs); if (r.error) return bad(res, 422, r.error); a.items = r.items; a.totalMarks = total(r.items); a.source = 'fixed'; }
  await a.save(); res.json({ assessment: view(a, { keys: true, byRef: await S.itemsByRef(sid(req), a.items.map((i) => i.ref)) }) });
});

exports.remove = wrap('remove', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (a.status !== 'Draft') return bad(res, 422, 'Only a draft can be deleted. Close or archive a published quiz.');
  await Assessment.deleteOne({ _id: a._id }); res.json({ ok: true });
});

// ── blueprint (CAP-0312) ──
async function pool(req, a) { const scope = await S.scopeOf(req); const q = { schoolId: sid(req), current: true, state: 'Active' }; if (a.subjectId) q.$or = [{ subjectId: a.subjectId }, { subjectId: null }, { subjectId: undefined }]; return (await Item.find(q)).filter((i) => require('./assessBankController').visible(scope, i)); }
const cleanRules = (rules) => (Array.isArray(rules) ? rules : []).slice(0, 20).map((r) => ({ id: str(r.id, 12) || crypto.randomBytes(3).toString('hex'), topic: str(r.topic, 80), difficulty: ['Easy', 'Medium', 'Hard'].includes(r.difficulty) ? r.difficulty : '', kind: require('./assessBankController').KINDS.includes(r.kind) ? r.kind : '', bloom: str(r.bloom, 20), count: Math.round(num(r.count, 0, 100, 0)) })).filter((r) => r.count > 0);
exports.blueprintPreview = wrap('bpPreview', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); const rules = cleanRules(req.body?.rules || a.blueprint?.rules); if (!rules.length) return bad(res, 400, 'Add at least one rule with a number of questions.');
  const salt = str(req.body?.salt, 40) || a.seedSalt; const r = E.pickBlueprint(rules, await pool(req, a), salt); const by = (k) => r.picked.reduce((m, x) => { m[x[k] || '—'] = (m[x[k] || '—'] || 0) + 1; return m; }, {});
  res.json({ picked: r.picked.map((i) => ({ itemId: i._id, plain: Notation.plain(i.stem), kind: i.kind, topic: i.topic, difficulty: i.difficulty, marks: i.marks })), short: r.short, balance: { difficulty: by('difficulty'), topic: by('topic'), kind: by('kind') }, totalMarks: total(r.picked), salt });
});
exports.blueprintApply = wrap('bpApply', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (!['Draft', 'Review'].includes(a.status)) return bad(res, 422, 'A published quiz cannot be changed.');
  const rules = cleanRules(req.body?.rules); if (!rules.length) return bad(res, 400, 'Add at least one rule with a number of questions.'); const r = E.pickBlueprint(rules, await pool(req, a), str(req.body?.salt, 40) || a.seedSalt);
  if (r.short.length && !req.body?.allowShort) return bad(res, 422, 'The bank does not have enough questions for every rule.', { short: r.short });
  if (!r.picked.length) return bad(res, 422, 'No question matches these rules.'); a.blueprint = { rules, balance: true }; a.source = 'blueprint'; a.items = r.picked.map((i) => itemRow(i)); a.totalMarks = total(a.items); a.status = 'Draft'; await a.save();
  res.json({ assessment: view(a, { keys: true, byRef: await S.itemsByRef(sid(req), a.items.map((i) => i.ref)) }), short: r.short });
});

// ── review, publish, close ──
function problems(a, byRef) {
  const p = []; if (!a.items.length) p.push('Add at least one question.'); if (!a.classIds.length) p.push('Choose the classes.'); const s = a.settings;
  if (a.kind === 'exam' && (!s.opensAt || !s.closesAt)) p.push('An exam needs an opening and closing time.'); if (s.opensAt && s.closesAt && new Date(s.closesAt) <= new Date(s.opensAt)) p.push('The closing time must be after the opening time.');
  if (s.closesAt && new Date(s.closesAt) < new Date()) p.push('The closing time has already passed.'); if (s.opensAt && s.closesAt && (new Date(s.closesAt) - new Date(s.opensAt)) / 60000 < s.durationMin && a.kind === 'exam') p.push('The window is shorter than the time allowed.');
  a.items.forEach((r, i) => { const it = byRef.get(String(r.ref)); if (!it || it.state !== 'Active') p.push(`Question ${i + 1} is no longer active.`); }); if (a.items.some((r) => r.kind === 'essay') && !s.dualMarking && a.kind === 'exam') p.push('An exam with essay questions should use two markers. Turn on double marking or confirm one marker is enough.');
  return p;
}
exports.submitReview = wrap('submitReview', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (a.status !== 'Draft') return bad(res, 422, 'Only a draft can be sent for review.'); const w = who(req);
  const byRef = await S.itemsByRef(sid(req), a.items.map((i) => i.ref)); const p = problems(a, byRef).filter((x) => !x.startsWith('An exam with essay')); if (p.length) return bad(res, 422, p[0], { problems: p });
  a.status = 'Review'; a.review = { submittedById: w.id, submittedByName: w.name, submittedAt: new Date() }; await a.save();
  await N.notify({ schoolId: sid(req), recipients: await N.admins(sid(req)), title: `${a.kind === 'exam' ? 'Exam' : 'Quiz'} waiting for review`, body: `${a.title} was sent by ${w.name}.`, link: '/admin/dashboard#/assessments', type: 'general' });
  res.json({ assessment: view(a) });
});
async function publish(req, res, a, how) {
  const schoolId = sid(req); const w = who(req); const byRef = await S.itemsByRef(schoolId, a.items.map((i) => i.ref)); const p = problems(a, byRef); if (p.length) return bad(res, 422, p[0], { problems: p });
  const upd = await Assessment.updateOne({ _id: a._id, status: { $in: ['Draft', 'Review'] } }, { $set: { status: 'Published', 'release.state': 'Held', 'review.decidedById': w.id, 'review.decidedByName': w.name, 'review.decidedAt': new Date(), 'review.note': how } });
  if (!upd.modifiedCount) return bad(res, 409, 'Someone else already published this.');
  await Item.updateMany({ schoolId, _id: { $in: a.items.map((i) => i.ref) } }, { $set: { locked: true, 'usage.lastUsedAt': new Date() }, $inc: { 'usage.quizzes': 1 } });
  const students = await S.classStudents(schoolId, a.classIds); const open = a.settings.opensAt ? ` Opens ${new Date(a.settings.opensAt).toLocaleString('en-GB')}.` : '';
  await N.notify({ schoolId, recipients: students.map((s) => ({ id: s._id, role: 'student' })), title: `New ${a.kind}: ${a.title}`, body: `${a.settings.durationMin} minutes.${open}`, link: '/student/dashboard#/assessments', type: 'general', key: `assess-${a._id}` });
  await audit(req, { action: 'assess.publish', entityType: 'Assessment', entityId: a._id, schoolId, detail: { title: a.title, how, items: a.items.length } });
  return res.json({ assessment: view(await Assessment.findById(a._id)) });
}
exports.publish = wrap('publish', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (!['Draft', 'Review'].includes(a.status)) return bad(res, 409, `This is already ${a.status.toLowerCase()}.`);
  if (a.kind === 'exam') return bad(res, 422, 'An exam has to be sent for review and approved by an administrator.'); return publish(req, res, a, 'Author published a quiz');
});
exports.approve = wrap('approve', async (req, res) => {
  const { a, err } = await load(req, req.params.id); if (err) return bad(res, ...err); if (req.user.role !== 'admin') return bad(res, 403, 'Only an administrator can approve.'); if (a.status !== 'Review') return bad(res, 422, 'Only a paper in review can be approved.');
  const w = who(req); const own = String(a.authorId) === String(w.id) || String(a.review?.submittedById) === String(w.id); const sole = own ? await S.soleAdmin(sid(req)) : false; if (own && !sole) return bad(res, 403, 'A different administrator must approve what you wrote or sent.');
  return publish(req, res, a, sole && own ? 'Approved by the only administrator' : str(req.body?.note, 200) || 'Approved');
});
exports.reject = wrap('reject', async (req, res) => {
  const { a, err } = await load(req, req.params.id); if (err) return bad(res, ...err); if (req.user.role !== 'admin') return bad(res, 403, 'Only an administrator can send it back.'); if (a.status !== 'Review') return bad(res, 422, 'Only a paper in review can be sent back.');
  const note = str(req.body?.note, 300); if (note.length < 3) return bad(res, 400, 'Say what needs to change.'); const w = who(req); a.status = 'Draft'; a.review = { ...(a.review.toObject ? a.review.toObject() : a.review), decidedById: w.id, decidedByName: w.name, decidedAt: new Date(), note }; await a.save();
  await N.notify({ schoolId: sid(req), recipients: [{ id: a.authorId, role: a.authorRole === 'admin' ? 'admin' : 'teacher' }], title: `${a.title} was sent back`, body: note, link: '/teacher/dashboard#/assessments', type: 'general' }); res.json({ assessment: view(a) });
});
exports.close = wrap('close', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (a.status !== 'Published') return bad(res, 422, 'Only a published quiz can be closed.');
  a.status = 'Closed'; if (!a.settings.closesAt || new Date(a.settings.closesAt) > new Date()) a.settings.closesAt = new Date(); await a.save();
  // anyone still writing is finished with what the server holds
  const open = await Attempt.find({ schoolId: sid(req), assessmentId: a._id, status: 'InProgress' }); const byRef = await S.itemsByRef(sid(req), a.items.map((i) => i.ref));
  for (const att of open) { const r = await Attempt.updateOne({ _id: att._id, status: 'InProgress' }, { $set: { status: 'Submitted', submittedAt: new Date(), submitMethod: 'teacher' } }); if (!r.modifiedCount) continue; const f = await Attempt.findById(att._id); await S.gradeAttempt(f, a, byRef); await f.save(); }
  await audit(req, { action: 'assess.close', entityType: 'Assessment', entityId: a._id, schoolId: sid(req), detail: { finished: open.length } }); res.json({ assessment: view(a), finished: open.length });
});
exports.archive = wrap('archive', async (req, res) => { const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (!['Closed', 'Draft'].includes(a.status)) return bad(res, 422, 'Close the quiz before archiving it.'); a.status = 'Archived'; await a.save(); res.json({ assessment: view(a) }); });
exports.extend = wrap('extend', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (a.status !== 'Published') return bad(res, 422, 'Only a published quiz can be extended.'); const to = date(req.body?.closesAt); const reason = str(req.body?.reason, 200);
  if (!to || to <= new Date()) return bad(res, 400, 'Choose a closing time in the future.'); if (a.settings.closesAt && to <= new Date(a.settings.closesAt)) return bad(res, 400, 'The new closing time must be later than the current one.'); if (reason.length < 5) return bad(res, 400, 'Say why the window is being extended.');
  a.settings.closesAt = to; await a.save(); await audit(req, { action: 'assess.extend', entityType: 'Assessment', entityId: a._id, schoolId: sid(req), detail: { to, reason } });
  await N.notify({ schoolId: sid(req), recipients: (await S.classStudents(sid(req), a.classIds)).map((s) => ({ id: s._id, role: 'student' })), title: `${a.title}: new closing time`, body: `Now closes ${to.toLocaleString('en-GB')}.`, link: '/student/dashboard#/assessments', type: 'general' }); res.json({ assessment: view(a) });
});

// ── sealed paper and key (CAP-0324) ──
exports.paper = wrap('paper', async (req, res) => {
  const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); const withKey = req.query.key === '1'; const s = a.settings;
  if (a.status === 'Published' && s.opensAt && new Date(s.opensAt) > new Date() && !a.sealed?.keyAuthorizedAt) return bad(res, 423, 'The paper is sealed until the exam opens.', { unlocksAt: s.opensAt });
  if (withKey && !keyVisible(a)) return bad(res, 423, 'The answer key is sealed until the exam closes, or until an administrator authorises it.', { unlocksAt: s.closesAt });
  const byRef = await S.itemsByRef(sid(req), a.items.map((i) => i.ref)); await audit(req, { action: 'assess.paper.download', entityType: 'Assessment', entityId: a._id, schoolId: sid(req), detail: { key: withKey } });
  res.json({ title: a.title, kind: a.kind, instructions: a.instructions, totalMarks: a.totalMarks, durationMin: s.durationMin, items: a.items.map((r, n) => { const it = byRef.get(String(r.ref)); return { no: n + 1, kind: r.kind, marks: r.marks, stem: it?.stem, plain: Notation.plain(it?.stem), options: (it?.options || []).map((o) => ({ id: o.id, text: o.text, ...(withKey ? { correct: o.correct } : {}) })), pairs: it?.pairs?.map((p) => ({ left: p.left, right: p.right })), sequence: it?.sequence, ...(withKey ? { accepted: it?.accepted, numAnswer: it?.numAnswer, explanation: it?.explanation } : {}) }; }) });
});
exports.authorizeKey = wrap('authorizeKey', async (req, res) => {
  if (req.user.role !== 'admin') return bad(res, 403, 'Only an administrator can authorise an early release.'); const { a, err } = await load(req, req.params.id); if (err) return bad(res, ...err); const reason = str(req.body?.reason, 300); if (reason.length < 5) return bad(res, 400, 'Say why the paper and key are being released early.');
  const w = who(req); if (String(a.authorId) === String(w.id) && !(await S.soleAdmin(sid(req)))) return bad(res, 403, 'A different administrator must authorise this.');
  a.sealed = { keyAuthorizedAt: new Date(), keyAuthorizedById: w.id, keyAuthorizedByName: w.name, keyReason: reason }; await a.save(); await audit(req, { action: 'assess.key.authorize', entityType: 'Assessment', entityId: a._id, schoolId: sid(req), detail: { reason } }); res.json({ assessment: view(a) });
});
exports.invigilatorCode = wrap('invigilator', async (req, res) => { const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); res.json({ code: E.invigilatorCode(a._id), validFor: new Date().toISOString().slice(0, 10), identity: a.settings.identity }); });

// ── roster, release, analysis ──
exports.roster = wrap('roster', async (req, res) => {
  const schoolId = sid(req); const { a, err } = await load(req, req.params.id); if (err) return bad(res, ...err); await S.sweep(schoolId, { assessmentId: a._id });
  const [students, attempts] = await Promise.all([S.classStudents(schoolId, a.classIds), Attempt.find({ schoolId, assessmentId: a._id }).select('-variant -answers -saves')]);
  const by = {}; attempts.forEach((x) => { (by[String(x.studentId)] ||= []).push(x); });
  const rows = students.map((s) => { const list = (by[String(s._id)] || []).sort((x, y) => x.attemptNo - y.attemptNo); const best = S.counted(list, a.settings.scoring);
    return { studentId: s._id, name: s.name, admissionNumber: s.admissionNumber, attempts: list.map((x) => ({ _id: x._id, no: x.attemptNo, status: x.status, total: x.total, max: x.max, pct: x.pct, submittedAt: x.submittedAt, late: x.lateByNetwork, submitMethod: x.submitMethod, incidents: (x.incidents || []).length, focusLeft: (x.focus || []).filter((f) => f.kind === 'left').length, marking: x.items.filter((i) => i.state !== 'Auto' && i.state !== 'Final').length, voided: x.status === 'Voided' })), counted: best ? { total: best.total, max: best.max, pct: best.pct, passed: best.pct >= a.settings.passPct, average: !!best.average } : null }; });
  res.json({ assessment: view(a), rows, released: S.isReleased(a), summary: { students: rows.length, notStarted: rows.filter((r) => !r.attempts.length).length, submitted: rows.filter((r) => r.counted).length, marking: rows.reduce((s, r) => s + r.attempts.filter((x) => x.marking).length, 0) } });
});
exports.release = wrap('release', async (req, res) => {
  const schoolId = sid(req); const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); const b = req.body || {}; const w = who(req);
  if (!['Published', 'Closed'].includes(a.status)) return bad(res, 422, 'Results can only be released for a published or closed quiz.'); if (a.release.state === 'Released') return bad(res, 409, 'The results are already released.');
  if (a.kind === 'exam' && req.user.role !== 'admin') return bad(res, 403, 'An administrator releases exam results.');
  const reason = str(b.reason, 300); const force = !!b.force; if (force && req.user.role !== 'admin') return bad(res, 403, 'Only an administrator can release early or with marking unfinished.'); if (force && reason.length < 5) return bad(res, 400, 'Say why the results are being released early.');
  await S.sweep(schoolId, { assessmentId: a._id });
  const open = await Attempt.countDocuments({ schoolId, assessmentId: a._id, status: { $in: ['InProgress', 'Marking'] } });
  const early = a.status !== 'Closed' && (!a.settings.closesAt || new Date(a.settings.closesAt) > new Date());
  if (!force && (open || early)) return bad(res, 422, early ? 'The quiz is still open. Close it first.' : `${open} attempt${open > 1 ? 's are' : ' is'} still being written or marked.`, { open, early });
  if (b.mode === 'schedule') { const at = date(b.at); if (!at || at <= new Date()) return bad(res, 400, 'Choose a time in the future.'); a.release = { state: 'Scheduled', scheduledAt: at, releasedById: w.id, releasedByName: w.name, forced: force, forceReason: reason }; }
  else a.release = { state: 'Released', releasedAt: new Date(), releasedById: w.id, releasedByName: w.name, forced: force, forceReason: reason };
  await a.save(); await audit(req, { action: 'assess.release', entityType: 'Assessment', entityId: a._id, schoolId, detail: { mode: b.mode || 'now', force, reason } });
  const done = (await Attempt.find({ schoolId, assessmentId: a._id, status: { $in: ['Graded', 'Marking'] } }).select('studentId')).map((x) => x.studentId);
  const rec = [...done.map((id) => ({ id, role: 'student' })), ...(await N.parentsOf(schoolId, done, 'viewMarks'))];
  await N.notify({ schoolId, recipients: rec, title: `Results: ${a.title}`, body: a.release.state === 'Released' ? 'Your result is ready.' : `Results appear ${a.release.scheduledAt.toLocaleString('en-GB')}.`, link: { student: '/student/dashboard#/assessments', parent: '/parent/dashboard' }, type: 'marks' });
  res.json({ assessment: view(a) });
});
exports.analysis = wrap('analysis', async (req, res) => {
  const schoolId = sid(req); const { a, err } = await load(req, req.params.id); if (err) return bad(res, ...err); await S.sweep(schoolId, { assessmentId: a._id });
  const attempts = await Attempt.find({ schoolId, assessmentId: a._id, status: 'Graded', countsAsAttempt: { $ne: false } }); const byRef = await S.itemsByRef(schoolId, a.items.map((i) => i.ref));
  const rows = attempts.map((x) => ({ total: x.total, scores: Object.fromEntries(x.items.map((i) => [String(i.ref), { score: i.final ?? i.auto ?? 0, max: i.max, answer: (x.answers || {})[String(i.ref)] }])) }));
  const stats = E.analyse(a.items.map((r) => ({ ref: r.ref, options: ['mcq', 'multi', 'tf'].includes(r.kind) })), rows);
  const marks = rows.map((r) => r.total); const n = marks.length; const mean = n ? marks.reduce((s, x) => s + x, 0) / n : 0; const sd = n > 1 ? Math.sqrt(marks.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  res.json({ n, mean: Math.round(mean * 100) / 100, sd: Math.round(sd * 100) / 100, high: n ? Math.max(...marks) : null, low: n ? Math.min(...marks) : null, passRate: n ? Math.round((attempts.filter((x) => x.passed).length / n) * 1000) / 10 : null, note: n < 30 ? 'Fewer than 30 finished attempts. Item figures are rough guides only.' : '',
    items: stats.map((s, i) => { const r = a.items[i]; const it = byRef.get(String(r.ref)); return { ...s, no: i + 1, plain: Notation.plain(it?.stem || ''), kind: r.kind, marks: r.marks, topic: r.topic, difficulty: r.difficulty, options: (it?.options || []).map((o) => ({ id: o.id, text: o.text, correct: o.correct, picked: s.distractors[o.id] || 0 })) }; }) });
});
exports.applyAnalysis = wrap('applyAnalysis', async (req, res) => {
  const schoolId = sid(req); const { a, err } = await load(req, req.params.id, true); if (err) return bad(res, ...err); if (a.status === 'Draft') return bad(res, 422, 'Nothing to apply yet.');
  const attempts = await Attempt.find({ schoolId, assessmentId: a._id, status: 'Graded', countsAsAttempt: { $ne: false } }); if (!attempts.length) return bad(res, 422, 'No finished attempts to learn from.'); let n = 0;
  for (const r of a.items) { const got = attempts.map((x) => x.items.find((i) => String(i.ref) === String(r.ref))).filter(Boolean); const full = got.filter((i) => (i.final ?? i.auto ?? 0) >= i.max - 1e-9).length;
    await Item.updateOne({ _id: r.ref, schoolId }, { $inc: { 'usage.attempts': got.length, 'usage.correct': full } }); n += 1; }
  await audit(req, { action: 'assess.analysis.apply', entityType: 'Assessment', entityId: a._id, schoolId, detail: { items: n } }); res.json({ updated: n });
});
exports.view = view;
