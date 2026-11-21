// The writing assistant (PRD E31): drafts that a person must check, a trail of what went in and out, and rules the school controls.
const Rubric = require('../models/Rubric');
const AiSource = require('../models/AiSource');
const AssistantDraft = require('../models/AssistantDraft');
const AIApproval = require('../models/AIApproval');
const AiAudit = require('../models/AiAudit');
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const QuestionItem = require('../models/QuestionItem');
const vault = require('../utils/integrations/vault');
const net = require('../utils/integrations/net');
const Catalog = require('../utils/ai/catalog');
const Builtin = require('../utils/ai/builtin');
const External = require('../utils/ai/external');
const FeeChecks = require('../utils/ai/feeChecks');
const A = require('../utils/ai/service');

const { S, Fail, oid, sid, Screen } = A;
const { KINDS, MAX, LIMITS, LIMIT_RANGE } = Catalog;
const wrap = S.wrap; const bad = S.bad;
const txt = (v, n) => Screen.plain(String(v == null ? '' : v)).slice(0, n);
const ctxOf = (req) => S.ctxOf(req);
const tell = async (schoolId, recipients, title, body, link) => { try { await S.N.notify({ schoolId, recipients, title, body, link, type: 'ai' }); } catch (e) { console.error('ai notify:', e.message); } };
const wide = async (req) => { const sc = await S.CS.scopeOf(req.user); return !sc; };
const needWide = async (req) => { if (req.user.role !== 'admin') throw new Fail(403, 'Only administrators can do this.'); if (!(await wide(req))) throw new Fail(403, 'This is set for the whole school. Ask a school-wide administrator.'); };

// the classes a teacher teaches (null = all, for a school-wide administrator)
async function classScope(req) {
  if (req.user.role === 'admin') { const sc = await S.CS.scopeOf(req.user); return sc ? new Set([...sc.classIds].map(String)) : null; }
  const schoolId = sid(req); const mine = new Set(); const me = oid(req.user.userId);
  for (const c of await Class.find({ schoolId, classTeacherId: me }).select('_id')) mine.add(String(c._id));
  const t = await Teacher.findOne({ _id: me, schoolId }).select('classIds subjectClassAssignments');
  for (const c of t?.classIds || []) mine.add(String(c)); for (const a of t?.subjectClassAssignments || []) if (a.classId) mine.add(String(a.classId));
  return mine;
}

/* ───────── what the signed-in person can do ───────── */
exports.me = wrap('me', async (req, res) => {
  const d = await A.policyDoc(sid(req)); const a = A.activeOf(d); const u = await A.usage(sid(req), oid(req.user.userId));
  const kinds = Object.entries(KINDS).map(([k, v]) => ({ key: k, label: v.label, help: v.help, on: !!(a.enabled && a.purposes?.[v.purpose]), separate: v.separate, publishes: v.publishes }));
  res.json({ userId: String(req.user.userId), level: req.aiLevel, enabled: !!a.enabled, provider: a.provider === 'external' ? `Outside model (${a.external?.model || ''})` : 'Built-in drafter (no outside model)', kinds, limits: { perHour: a.limits.perUserPerHour, usedHour: u.hour }, canReview: req.aiLevel !== 'teacher', wide: req.user.role === 'admin' ? await wide(req) : false, trainingUse: 'excluded', pendingPolicy: !!d.pending });
});

/* ───────── the school's rules ───────── */
exports.policy = wrap('policy', async (req, res) => {
  const d = await A.policyDoc(sid(req)); const a = A.activeOf(d);
  res.json({ version: d.version, active: A.policyView(a), pending: d.pending ? { ...A.policyView(d.pending), madeByName: d.pending.madeByName, madeById: d.pending.madeById, reason: d.pending.reason, at: d.pending.at } : null, history: (d.history || []).slice(-30).reverse(), ranges: LIMIT_RANGE, kinds: Object.entries(KINDS).map(([k, v]) => ({ key: k, label: v.label })) });
});
exports.propose = wrap('propose', async (req, res) => {
  await needWide(req); const schoolId = sid(req); const b = req.body || {}; const reason = S.text(b.reason, 'The reason', { min: 5, max: 300 });
  const d = await A.policyDoc(schoolId); const cur = A.activeOf(d); const base = d.pending || cur;
  const purposes = {}; for (const k of Object.keys(KINDS)) purposes[KINDS[k].purpose] = b.purposes && k in b.purposes ? !!b.purposes[k] : !!(base.purposes || {})[KINDS[k].purpose];
  const enabled = b.enabled === undefined ? !!base.enabled : !!b.enabled;
  if (enabled && !Object.values(purposes).some(Boolean)) throw new Fail(422, 'Choose at least one kind of writing to allow.');
  const provider = b.provider === 'external' ? 'external' : b.provider === 'builtin' ? 'builtin' : base.provider;
  const limits = { ...LIMITS, ...(base.limits || {}) };
  for (const k of Object.keys(LIMIT_RANGE)) if (b.limits && b.limits[k] !== undefined) { const n = Number(b.limits[k]); const [lo, hi] = LIMIT_RANGE[k]; if (!Number.isInteger(n) || n < lo || n > hi) throw new Fail(422, `${k} must be a whole number from ${lo} to ${hi}.`); limits[k] = n; }
  let external = base.external || cur.external || null;
  if (provider === 'external') {
    const e = b.external || {}; const baseUrl = String(e.baseUrl || external?.baseUrl || '').trim(); const model = txt(e.model || external?.model, 80);
    const chk = net.checkUrl(baseUrl); if (!baseUrl || !chk.ok) throw new Fail(422, `The model address is not allowed: ${chk.why || 'give an https address'}.`);
    if (!model) throw new Fail(422, 'Name the model.');
    const keyIn = String(e.apiKey || '').trim(); if (!keyIn && !external?.keySealed) throw new Fail(422, 'Give the key for the model service.');
    const confirmed = e.termsConfirmed === true || (!!external?.termsConfirmedBy && e.termsConfirmed !== false && baseUrl === external.baseUrl);
    if (!confirmed) throw new Fail(422, 'Confirm that the model service does not train on, or keep, the school\'s text beyond its stated terms.');
    external = { baseUrl, model, keySealed: keyIn ? vault.seal(keyIn) : external.keySealed, keyHint: keyIn ? `…${keyIn.slice(-4)}` : external.keyHint, termsConfirmedBy: keyIn || e.termsConfirmed === true ? ctxOf(req).actor.name : external.termsConfirmedBy, termsConfirmedAt: keyIn || e.termsConfirmed === true ? new Date() : external.termsConfirmedAt };
  }
  const pending = { enabled, purposes, provider, external: provider === 'external' ? external : (base.external || null), limits, madeById: ctxOf(req).actor.id, madeByName: ctxOf(req).actor.name, reason, at: new Date() };
  await require('../models/AiPolicy').updateOne({ _id: d._id }, { $set: { pending } });
  await A.audit(ctxOf(req), { action: 'policy', reason: `proposed: ${reason}`, ok: true });
  const others = (await S.N.admins(schoolId)).filter((x) => String(x.id) !== String(ctxOf(req).actor.id));
  await tell(schoolId, others, 'Writing assistant: a change waits for you', `${ctxOf(req).actor.name} proposed a change. ${reason}`, '/admin/dashboard#/ai');
  res.status(202).json({ pending: A.policyView(pending), message: 'The change waits for a different administrator to approve it.' });
});
exports.decidePolicy = wrap('decidePolicy', async (req, res) => {
  await needWide(req); const schoolId = sid(req); const ctx = ctxOf(req); const d = await A.policyDoc(schoolId); const p = d.pending;
  if (!p) throw new Fail(404, 'No change is waiting.');
  const decision = req.body?.decision; if (!['approve', 'reject'].includes(decision)) throw new Fail(422, 'Choose approve or reject.');
  const note = S.text(req.body?.note, 'A note', { min: decision === 'reject' ? 5 : 0, max: 300 });
  const sole = await S.separate(ctx, p.madeById, 'A change to the writing assistant');
  const version = d.version + 1; const entry = { version, at: new Date(), madeByName: p.madeByName, deciderName: ctx.actor.name, reason: p.reason, decision, note, soleAdmin: sole, enabled: p.enabled, provider: p.provider };
  const set = { pending: null, history: [...(d.history || []), entry].slice(-100) };
  if (decision === 'approve') { const { madeById, madeByName, reason, at, ...rest } = p; set.active = rest; set.version = version; }
  const r = await require('../models/AiPolicy').updateOne({ _id: d._id, version: d.version }, { $set: set });
  if (!r.matchedCount) throw new Fail(409, 'Someone else just changed this. Please look again.');
  await AIApproval.create({ schoolId, subject: 'policy', subjectId: String(d._id), subjectNo: `v${version}`, decision, byId: ctx.actor.id, byName: ctx.actor.name, byRole: 'admin', note, soleAdmin: sole, at: new Date() });
  await A.audit(ctx, { action: 'policy', reason: `${decision}: ${p.reason}`, approverName: ctx.actor.name });
  await tell(schoolId, [{ id: p.madeById, role: 'admin' }], `Writing assistant change ${decision === 'approve' ? 'approved' : 'declined'}`, note || p.reason, '/admin/dashboard#/ai');
  res.json({ version: decision === 'approve' ? version : d.version, decision, soleAdmin: sole });
});
exports.testModel = wrap('testModel', async (req, res) => {
  await needWide(req); const d = await A.policyDoc(sid(req)); const which = req.body?.which === 'pending' ? d.pending : A.activeOf(d);
  if (!which || which.provider !== 'external' || !which.external) throw new Fail(422, 'No outside model is set up.');
  const t0 = Date.now();
  try { const r = await External.generate(which.external, 'translation', { text: 'ready', from: 'en', to: 'ur' }, { sources: [] }); await A.audit(ctxOf(req), { action: 'test', provider: 'external', model: r.model, ok: true, ms: Date.now() - t0 }); res.json({ ok: true, model: r.model, ms: Date.now() - t0 }); }
  catch (e) { await A.audit(ctxOf(req), { action: 'test', provider: 'external', ok: false, reason: e.message, ms: Date.now() - t0 }); res.status(502).json({ ok: false, message: e.code === 'EPRIVATE' || e.code === 'EBADURL' ? 'That address is not allowed.' : e.message }); }
});

/* ───────── glossary ───────── */
exports.glossary = wrap('glossary', async (req, res) => { const d = await A.policyDoc(sid(req)); res.json({ entries: d.glossary || [], builtin: Catalog.BUILTIN_GLOSSARY.length, by: d.glossaryByName, at: d.glossaryAt }); });
exports.saveGlossary = wrap('saveGlossary', async (req, res) => {
  const list = (Array.isArray(req.body?.entries) ? req.body.entries : []).slice(0, MAX.glossary).map((g) => ({ en: txt(g.en, 60).toLowerCase(), ur: txt(g.ur, 60) })).filter((g) => g.en && g.ur);
  const bads = []; for (const g of list) { const c = await Screen.inputs(sid(req), { en: g.en, ur: g.ur }); if (c.blocked.length) bads.push(g.en); }
  if (bads.length) throw new Fail(422, `A glossary term looks like a person's name or care matter: ${bads.slice(0, 3).join(', ')}.`);
  const d = await A.policyDoc(sid(req)); await require('../models/AiPolicy').updateOne({ _id: d._id }, { $set: { glossary: list, glossaryAt: new Date(), glossaryByName: ctxOf(req).actor.name } });
  await A.audit(ctxOf(req), { action: 'glossary', reason: `${list.length} terms` }); res.json({ entries: list });
});

/* ───────── teaching sources ───────── */
const srcView = (s, full) => ({ _id: s._id, title: s.title, subject: s.subject, grade: s.grade, license: s.license, state: s.state, uses: s.uses, addedByName: s.addedByName, addedById: s.addedById, decidedByName: s.decidedByName, decidedAt: s.decidedAt, decisionNote: s.decisionNote, soleAdmin: s.soleAdmin, chars: (s.text || '').length, createdAt: s.createdAt, ...(full ? { text: s.text } : {}) });
const canSeeSource = (req, lv, s) => s.state === 'Approved' || lv !== 'teacher' || String(s.addedById) === String(req.user.userId);
exports.sources = wrap('sources', async (req, res) => {
  const lv = req.aiLevel; const q = { schoolId: sid(req) }; if (req.query.state) q.state = String(req.query.state);
  let rows = await AiSource.find(q).sort({ createdAt: -1 }).limit(300); rows = rows.filter((s) => canSeeSource(req, lv, s));
  res.json({ sources: rows.map((s) => srcView(s, false)) });
});
exports.source = wrap('source', async (req, res) => { const s = await AiSource.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!s || !canSeeSource(req, req.aiLevel, s)) throw new Fail(404, 'Source not found.'); res.json({ source: srcView(s, true) }); });
exports.addSource = wrap('addSource', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const ctx = ctxOf(req);
  const title = S.text(b.title, 'The title', { min: 3, max: 120 }); const text = String(b.text || '').trim(); if (text.length < 80) throw new Fail(422, 'Paste at least a few sentences of teaching material.'); if (text.length > MAX.source) throw new Fail(422, `Keep each source under ${MAX.source} characters.`);
  const lic = b.license || {}; const kind = ['original', 'open', 'licensed'].includes(lic.kind) ? lic.kind : 'original'; const source = txt(lic.source, 200);
  if (kind !== 'original' && !source) throw new Fail(422, 'Say where this text comes from and who holds the copyright.');
  if ((await AiSource.countDocuments({ schoolId, state: { $ne: 'Retired' } })) >= 200) throw new Fail(422, 'The school already has 200 sources. Retire some first.');
  const chk = await Screen.sourceCheck(schoolId, text); if (!chk.ok) throw new Fail(422, chk.message);
  const sc = Screen.scanSource(chk.text);
  const doc = await AiSource.create({ schoolId, title, text: sc.text, subject: txt(b.subject, 60), grade: txt(b.grade, 30), license: { kind, source, holder: txt(lic.holder, 120) }, state: 'Pending', hash: A.sha(sc.text), addedById: ctx.actor.id, addedByName: ctx.actor.name, addedByRole: ctx.role });
  await A.audit(ctx, { action: 'source', reason: `added ${title}` });
  const revs = (await S.N.admins(schoolId)).filter((x) => String(x.id) !== String(ctx.actor.id)); await tell(schoolId, revs, 'A teaching source waits for approval', title, '/admin/dashboard#/ai');
  res.status(201).json({ source: srcView(doc, false), neutralised: sc.hits.length, removed: chk.removed });
});
exports.decideSource = wrap('decideSource', async (req, res) => {
  const schoolId = sid(req); const ctx = ctxOf(req); const s = await AiSource.findOne({ _id: oid(req.params.id), schoolId }); if (!s) throw new Fail(404, 'Source not found.');
  if (s.state !== 'Pending') throw new Fail(409, 'This source was already decided.');
  const decision = req.body?.decision; if (!['approve', 'reject'].includes(decision)) throw new Fail(422, 'Choose approve or reject.');
  const note = S.text(req.body?.note, 'A note', { min: decision === 'reject' ? 5 : 0, max: 300 });
  const sole = await S.separate(ctx, s.addedById, 'Approval of a teaching source');
  const r = await AiSource.updateOne({ _id: s._id, state: 'Pending' }, { $set: { state: decision === 'approve' ? 'Approved' : 'Retired', decidedById: ctx.actor.id, decidedByName: ctx.actor.name, decidedAt: new Date(), decisionNote: note, soleAdmin: sole } });
  if (!r.matchedCount) throw new Fail(409, 'This source was already decided.');
  await AIApproval.create({ schoolId, subject: 'source', subjectId: String(s._id), subjectNo: s.title.slice(0, 40), decision, byId: ctx.actor.id, byName: ctx.actor.name, byRole: ctx.role, note, contentHash: s.hash, soleAdmin: sole, at: new Date() });
  await A.audit(ctx, { action: 'source', reason: `${decision} ${s.title}`, approverName: ctx.actor.name });
  await tell(schoolId, [{ id: s.addedById, role: s.addedByRole || 'teacher' }], `Teaching source ${decision === 'approve' ? 'approved' : 'declined'}`, s.title, '/teacher/dashboard#/ai');
  res.json({ ok: true, soleAdmin: sole });
});
exports.retireSource = wrap('retireSource', async (req, res) => {
  const s = await AiSource.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!s) throw new Fail(404, 'Source not found.');
  if (req.aiLevel === 'teacher' && String(s.addedById) !== String(req.user.userId)) throw new Fail(403, 'Only the person who added it, or a reviewer, can retire a source.');
  await AiSource.updateOne({ _id: s._id }, { $set: { state: 'Retired' } }); await A.audit(ctxOf(req), { action: 'source', reason: `retired ${s.title}` }); res.json({ ok: true });
});
// a search that only ever shows approved sources, with the source named, so the exact origin is always visible (CAP-0503)
exports.search = wrap('search', async (req, res) => {
  const q = txt(req.query.q, 120); const terms = [...new Set(Builtin.keyWords(q))].slice(0, 8); if (!terms.length) return res.json({ results: [] });
  const rows = await AiSource.find({ schoolId: sid(req), state: 'Approved' }).limit(200); const out = [];
  for (const s of rows) for (const sent of Builtin.sentences(s.text)) { const w = new Set(Builtin.keyWords(sent)); const score = terms.filter((t) => w.has(t)).length; if (score) out.push({ sourceId: s._id, title: s.title, license: s.license.kind, excerpt: sent.slice(0, 260), score }); }
  res.json({ results: out.sort((a, b) => b.score - a.score).slice(0, 10) });
});

/* ───────── drafts ───────── */
const draftView = (d, full = true) => ({ _id: d._id, no: d.no, kind: d.kind, kindLabel: KINDS[d.kind]?.label, status: d.status, title: d.title, requesterName: d.requesterName, requesterId: d.requesterId, classId: d.classId, edits: d.edits, flags: d.flags, provenance: d.provenance, createdAt: d.createdAt, submittedAt: d.submittedAt, decidedByName: d.decidedByName, decidedAt: d.decidedAt, decisionNote: d.decisionNote, soleAdmin: d.soleAdmin, published: d.published, separate: KINDS[d.kind]?.separate, publishes: KINDS[d.kind]?.publishes, expiresAt: d.expiresAt, ...(full ? { content: d.content, request: d.request } : {}) });
async function visible(req, lv, d) {
  if (String(d.requesterId) === String(req.user.userId)) return true;
  if (lv === 'teacher') return false;
  if (d.status === 'Draft') return false;                         // a draft is private until it is sent for review
  if (req.user.role === 'admin' && d.classId) { const cs = await classScope(req); if (cs && !cs.has(String(d.classId))) return false; }
  return true;
}
const loadDraft = async (req) => { const d = await AssistantDraft.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!d || !(await visible(req, req.aiLevel, d))) throw new Fail(404, 'Draft not found.'); return d; };
const mine = (req, d) => String(d.requesterId) === String(req.user.userId);

exports.drafts = wrap('drafts', async (req, res) => {
  const schoolId = sid(req); const lv = req.aiLevel; const scope = req.query.scope || 'mine'; const q = { schoolId };
  if (scope === 'review') { if (lv === 'teacher') throw new Fail(403, 'You cannot review assistant work.'); q.status = req.query.status || 'Review'; }
  else if (scope === 'all') { if (lv === 'teacher') throw new Fail(403, 'You cannot see everyone\'s drafts.'); q.status = { $ne: 'Draft' }; if (req.query.status) q.status = String(req.query.status); }
  else { q.requesterId = oid(req.user.userId); if (req.query.status) q.status = String(req.query.status); }
  if (req.query.kind && KINDS[req.query.kind]) q.kind = req.query.kind;
  const { p, l } = S.pg(req.query); const rows = await AssistantDraft.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l);
  const keep = []; for (const d of rows) if (await visible(req, lv, d)) keep.push(d);
  res.json({ drafts: keep.map((d) => draftView(d, false)), total: await AssistantDraft.countDocuments(q) });
});
exports.draft = wrap('draft', async (req, res) => {
  const d = await loadDraft(req); const approvals = await AIApproval.find({ schoolId: sid(req), subject: 'draft', subjectId: String(d._id) }).sort({ at: 1 });
  res.json({ draft: draftView(d), approvals: approvals.map((a) => ({ decision: a.decision, byName: a.byName, byRole: a.byRole, note: a.note, at: a.at, soleAdmin: a.soleAdmin, confirmed: a.confirmed })), trail: d.trail });
});

// check what the person asked for, per kind. -> { request, texts, classId, sourceIds, rubricId }
async function cleanRequest(req, kind, b) {
  const schoolId = sid(req); const cs = await classScope(req); const r = { }; const texts = {}; let classId = null; let sourceIds = []; let rubricId = null;
  const needClass = (v) => { const c = oid(v); if (!c) throw new Fail(422, 'Choose a class.'); if (cs && !cs.has(String(c))) throw new Fail(403, 'That class is not yours.'); return c; };
  const sources = () => { const ids = [...new Set((Array.isArray(b.sourceIds) ? b.sourceIds : []).map(String).map(oid).filter(Boolean).map(String))].slice(0, MAX.sources); return ids; };
  if (kind === 'lesson_plan' || kind === 'question_set') {
    r.topic = S.text(b.topic, 'The topic', { min: 3, max: MAX.topic }); texts.topic = r.topic; sourceIds = sources();
    if (b.classId) classId = needClass(b.classId);
    if (kind === 'lesson_plan') {
      r.subject = txt(b.subject, 60); r.grade = txt(b.grade, 40); const m = Number(b.minutes || 40); if (!Number.isInteger(m) || m < MAX.minutes[0] || m > MAX.minutes[1]) throw new Fail(422, `Lesson length must be ${MAX.minutes[0]} to ${MAX.minutes[1]} minutes.`); r.minutes = m;
      r.objectives = (Array.isArray(b.objectives) ? b.objectives : []).slice(0, MAX.objectives).map((o) => txt(o, MAX.objective)).filter(Boolean); r.objectives.forEach((o, i) => { texts[`objective${i}`] = o; }); texts.subject = r.subject; texts.grade = r.grade;
    } else {
      if (!sourceIds.length) throw new Fail(422, 'Choose at least one approved source: questions are made only from sources.');
      const n = Number(b.count || 5); if (!Number.isInteger(n) || n < 1 || n > MAX.questions) throw new Fail(422, `Ask for 1 to ${MAX.questions} questions.`); r.count = n;
      r.kinds = (Array.isArray(b.kinds) && b.kinds.length ? b.kinds : ['mcq', 'tf', 'short']).filter((k) => ['mcq', 'tf', 'short'].includes(k)); if (!r.kinds.length) throw new Fail(422, 'Choose multiple choice, true or false, or short answer.');
      r.difficulty = ['Easy', 'Medium', 'Hard'].includes(b.difficulty) ? b.difficulty : 'Medium';
    }
  } else if (kind === 'notice') {
    const f = b.facts || {}; r.noticeType = ['general', 'event', 'reminder', 'closure', 'exam'].includes(b.noticeType) ? b.noticeType : 'general';
    r.audience = ['All', 'Students', 'Teachers', 'Class Specific'].includes(b.audience) ? b.audience : null; if (!r.audience) throw new Fail(422, 'Choose who the notice is for.');
    if (cs && r.audience !== 'Class Specific') throw new Fail(403, 'You can write notices only for your own classes.');
    if (r.audience === 'Class Specific') { classId = needClass(b.classId); } else if (req.user.role !== 'admin') throw new Fail(403, 'You can write notices only for your own classes.');
    r.title = txt(b.title, 120); texts.title = r.title; r.facts = {}; for (const k of ['what', 'date', 'time', 'place', 'who', 'action', 'deadline', 'contact']) { r.facts[k] = txt(f[k], MAX.fact); texts[`fact_${k}`] = r.facts[k]; }
    if (!r.facts.what) throw new Fail(422, 'Say what the notice is about.'); if (!r.facts.date && !r.facts.deadline && r.noticeType !== 'general') throw new Fail(422, 'Give the date or deadline.');
  } else if (kind === 'rubric_feedback') {
    const rub = await Rubric.findOne({ _id: oid(b.rubricId), schoolId, archived: false }); if (!rub) throw new Fail(404, 'Choose one of the school\'s rubrics.'); rubricId = rub._id;
    r.rubricId = String(rub._id); r.levels = {}; for (const c of rub.criteria) { const n = Number(b.levels?.[c.id]); r.levels[c.id] = Number.isInteger(n) && n >= 0 && n < c.levels.length ? n : 0; }
    r.tone = b.tone === 'neutral' ? 'neutral' : 'encouraging'; r.strengths = txt(b.strengths, 500); r.nextSteps = txt(b.nextSteps, 500); texts.strengths = r.strengths; texts.nextSteps = r.nextSteps;
  } else {
    r.text = String(b.text || '').trim(); if (r.text.length < 3 || r.text.length > MAX.translation) throw new Fail(422, `Give 3 to ${MAX.translation} characters of text.`);
    r.from = b.from === 'ur' ? 'ur' : 'en'; r.to = r.from === 'en' ? 'ur' : 'en'; texts.text = r.text;
  }
  return { request: r, texts, classId, sourceIds, rubricId };
}

exports.create = wrap('create', async (req, res) => {
  const schoolId = sid(req); const ctx = ctxOf(req); const b = req.body || {}; const kind = b.kind;
  if (!KINDS[kind]) throw new Fail(422, 'Choose a kind of writing.');
  const d0 = await A.policyDoc(schoolId); const pol = A.activeOf(d0);
  if (!pol.enabled) throw new Fail(403, 'The writing assistant is switched off for this school.', { reason: 'ai_off' });
  if (!pol.purposes?.[KINDS[kind].purpose]) throw new Fail(403, `${KINDS[kind].label} is not allowed in this school.`, { reason: 'purpose_off' });
  const u = await A.usage(schoolId, ctx.actor.id);
  if (u.hour >= pol.limits.perUserPerHour) throw new Fail(429, `You have made ${u.hour} drafts in the last hour. Please wait a little.`, { reason: 'user_limit' });
  if (u.day >= pol.limits.perSchoolPerDay) throw new Fail(429, 'The school has reached its limit for today.', { reason: 'school_limit' });
  const q = await cleanRequest(req, kind, b);
  const screened = await Screen.inputs(schoolId, q.texts, { checkCare: true });
  if (screened.blocked.length) { await A.audit(ctx, { action: 'refused', kind, ok: false, reason: screened.blocked.map((x) => x.code).join(',') }); throw new Fail(422, screened.blocked[0].message, { reason: screened.blocked[0].code, fields: screened.blocked.map((x) => ({ field: x.field, code: x.code })) }); }
  // put the cleaned words back into the request
  const c = screened.clean; const rq = q.request;
  if (rq.topic !== undefined) rq.topic = c.topic; if (rq.subject !== undefined) rq.subject = c.subject; if (rq.grade !== undefined) rq.grade = c.grade; if (rq.objectives) rq.objectives = rq.objectives.map((_, i) => c[`objective${i}`]).filter(Boolean);
  if (rq.facts) { for (const k of Object.keys(rq.facts)) rq.facts[k] = c[`fact_${k}`]; rq.title = c.title; }
  if (rq.strengths !== undefined) { rq.strengths = c.strengths; rq.nextSteps = c.nextSteps; } if (rq.text !== undefined) rq.text = c.text;
  // sources: approved only, injection words removed
  const srcRows = q.sourceIds.length ? await AiSource.find({ schoolId, _id: { $in: q.sourceIds.map(oid) }, state: 'Approved' }) : []; if (srcRows.length !== q.sourceIds.length) throw new Fail(422, 'One of the sources is not approved or no longer exists.');
  const order = new Map(q.sourceIds.map((id, i) => [id, i])); srcRows.sort((a, z) => order.get(String(a._id)) - order.get(String(z._id)));
  const structural = []; let neut = 0; const sources = srcRows.map((s) => { const sc = Screen.scanSource(s.text); neut += sc.hits.length; return { id: String(s._id), title: s.title, text: sc.text.slice(0, 6000) }; });
  if (neut) structural.push(A.structural({ code: 'source_injection', severity: 'warn', message: `${neut} instruction-like phrase(s) in the sources were removed before use. Read the sources again.`, at: 's1' }));
  const rubric = q.rubricId ? await Rubric.findOne({ _id: q.rubricId, schoolId }) : null; const glossary = (d0.glossary || []);
  const rubricData = rubric ? { name: rubric.name, criteria: rubric.criteria.map((x) => ({ id: x.id, name: x.name, levels: x.levels })) } : null;
  // make it
  const t0 = Date.now(); let out; let prov;
  const reqForModel = { ...rq };
  try {
    if (pol.provider === 'external' && pol.external) {
      out = await External.generate(pol.external, kind, reqForModel, { sources, rubric: rubricData });
      prov = { provider: 'external', builtin: false, model: out.model, version: 'external', promptHash: out.promptHash, outputHash: out.outputHash };
    } else {
      const r = Builtin.run(kind, reqForModel, { sources, rubric: rubricData, glossary });
      out = { content: r.content, flags: r.flags, title: r.title }; prov = { provider: 'builtin', builtin: true, model: 'aulensia-scaffold', version: '1', promptHash: A.sha(JSON.stringify(reqForModel)), outputHash: A.sha(JSON.stringify(r.content)) };
    }
  } catch (e) {
    await A.audit(ctx, { action: 'generate', kind, provider: pol.provider, model: pol.external?.model || '', ok: false, reason: e.message, ms: Date.now() - t0, removed: screened.removed });
    if (e.code === 'EMODEL' || e.code === 'EBADREPLY' || e.code === 'ETIMEDOUT' || e.code === 'EPRIVATE' || e.code === 'EBADURL' || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') return bad(res, 502, e.code === 'EPRIVATE' || e.code === 'EBADURL' ? 'The model address is not allowed.' : e.message || 'The model service could not answer.', { reason: 'model_error' });
    throw e;
  }
  // clean what came back, then check it
  const content = JSON.parse(JSON.stringify(out.content)); for (const s of content.sections || []) { s.text = Screen.plain(s.text); s.heading = Screen.plain(s.heading || ''); }
  for (const qn of content.questions || []) { qn.stem = Screen.plain(qn.stem); (qn.options || []).forEach((o) => { o.text = Screen.plain(o.text); }); qn.accepted = (qn.accepted || []).map(Screen.plain); }
  const title = txt(out.title || b.title || KINDS[kind].label, 160) || KINDS[kind].label;
  const keep = [...(out.flags || []).map((f) => ({ ...A.structural(f) })), ...structural];
  if (kind === 'question_set' || kind === 'lesson_plan') for (const s of (content.sections || content.questions || [])) if ((s.kind === 'model' || s.kind === 'sourced') && !(s.cites || []).length) keep.push(A.structural({ code: 'uncited', severity: 'warn', message: 'This part gives facts without naming a source. Check it carefully.', at: s.id }));
  const flags = await A.flagsFor(schoolId, kind, content, keep);
  const no = await A.nextNo(schoolId);
  const doc = await AssistantDraft.create({ schoolId, no, kind, status: 'Draft', title, request: { ...rq, sourceIds: q.sourceIds }, content, contentHash: '', provenance: { ...prov, generatedAt: new Date(), sourceIds: sources.map((s) => s.id), sourceTitles: sources.map((s) => s.title), marker: 'Drafted with the writing assistant' }, flags, requesterId: ctx.actor.id, requesterName: ctx.actor.name, requesterRole: ctx.role, classId: q.classId, expiresAt: new Date(Date.now() + pol.limits.draftRetentionDays * 86400000), trail: [{ at: new Date(), byName: ctx.actor.name, action: 'made', note: '' }] });
  doc.contentHash = A.hashOf(doc); await AssistantDraft.updateOne({ _id: doc._id }, { $set: { contentHash: doc.contentHash } });
  if (srcRows.length) await AiSource.updateMany({ _id: { $in: srcRows.map((s) => s._id) } }, { $inc: { uses: 1 } });
  await A.audit(ctx, { action: 'generate', draftId: String(doc._id), draftNo: no, kind, provider: prov.provider, model: prov.model, version: prov.version, prompt: JSON.stringify(rq).slice(0, 6000), promptHash: prov.promptHash, outputHash: prov.outputHash, removed: screened.removed, flags: flags.length, ms: Date.now() - t0 });
  res.status(201).json({ draft: draftView(doc), removed: screened.removed });
});

function cleanQuestion(q, old) {
  const kind = old?.kind || q.kind; const o = { ...(old || {}), id: old?.id || q.id, kind, stem: txt(q.stem, 600), marks: Math.min(100, Math.max(1, Number(q.marks) || old?.marks || 1)), difficulty: ['Easy', 'Medium', 'Hard'].includes(q.difficulty) ? q.difficulty : (old?.difficulty || 'Medium'), topic: txt(q.topic ?? old?.topic, 80), cites: old?.cites || [], verified: false };
  if (!o.stem) throw new Fail(422, 'Every question needs its text.');
  if (kind === 'mcq') { const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((x, i) => ({ id: `o${i + 1}`, text: txt(x.text, 200), correct: !!x.correct })).filter((x) => x.text); if (opts.length < 2 || opts.filter((x) => x.correct).length !== 1) throw new Fail(422, 'A multiple choice question needs at least two choices and exactly one correct.'); if (new Set(opts.map((x) => x.text.toLowerCase())).size !== opts.length) throw new Fail(422, 'Two choices say the same thing.'); o.options = opts; }
  else if (kind === 'tf') { if (typeof q.answerTrue !== 'boolean') throw new Fail(422, 'Say whether the statement is true or false.'); o.answerTrue = q.answerTrue; }
  else { const acc = (Array.isArray(q.accepted) ? q.accepted : []).map((x) => txt(x, 120)).filter(Boolean).slice(0, 5); if (!acc.length) throw new Fail(422, 'Give at least one accepted answer.'); o.accepted = acc; }
  return o;
}
exports.edit = wrap('edit', async (req, res) => {
  const schoolId = sid(req); const ctx = ctxOf(req); const d = await loadDraft(req);
  if (!mine(req, d)) throw new Fail(403, 'Only the person who made the draft can change it.'); if (d.status !== 'Draft') throw new Fail(409, 'A draft can be changed only before it is sent for review.');
  const b = req.body || {}; const content = JSON.parse(JSON.stringify(d.content)); let changed = false;
  if (b.title !== undefined) { const t = txt(b.title, 160); if (!t) throw new Fail(422, 'The draft needs a title.'); if (t !== d.title) { d.title = t; changed = true; } }
  if (d.kind === 'question_set') {
    if (Array.isArray(b.questions)) {
      const old = new Map((content.questions || []).map((q) => [q.id, q])); const next = [];
      for (const q of b.questions.slice(0, MAX.questions)) { const o = old.get(q.id); if (!o) throw new Fail(422, 'A question was not found.'); next.push(cleanQuestion(q, o)); }
      if (!next.length) throw new Fail(422, 'Keep at least one question.'); content.questions = next; changed = true;
    }
  } else if (Array.isArray(b.sections)) {
    const old = new Map((content.sections || []).map((s) => [s.id, s])); const next = []; let n = (content.sections || []).length;
    for (const s of b.sections.slice(0, 14)) {
      const text = txt(s.text, 4000); if (!text) continue; const o = s.id ? old.get(s.id) : null; if (s.id && !o) throw new Fail(422, 'A section was not found.');
      if (o) next.push({ ...o, heading: txt(s.heading ?? o.heading, 100), text, edited: o.edited || text !== o.text }); else { n += 1; next.push({ id: `s${n}`, heading: txt(s.heading, 100), text, kind: 'teacher', cites: [] }); }
    }
    if (!next.length) throw new Fail(422, 'Keep at least one section.'); content.sections = next; changed = true;
  }
  if (!changed) return res.json({ draft: draftView(d) });
  // what a person typed into a draft is checked like any other words
  const flags = await A.flagsFor(schoolId, d.kind, content, d.flags);
  d.edits += 1; const trail = [...(d.trail || []), { at: new Date(), byName: ctx.actor.name, action: 'edited', note: '' }].slice(-60);
  const nd = { title: d.title, content }; const h = A.hashOf(nd);
  await AssistantDraft.updateOne({ _id: d._id, status: 'Draft' }, { $set: { title: d.title, content, flags, edits: d.edits, trail, contentHash: h } });
  await A.audit(ctx, { action: 'edit', draftId: String(d._id), draftNo: d.no, kind: d.kind, flags: flags.length, outputHash: h });
  const fresh = await AssistantDraft.findOne({ _id: d._id }); res.json({ draft: draftView(fresh) });
});
exports.submit = wrap('submit', async (req, res) => {
  const schoolId = sid(req); const ctx = ctxOf(req); const d = await loadDraft(req);
  if (!mine(req, d)) throw new Fail(403, 'Only the person who made the draft can send it for review.'); if (d.status !== 'Draft') throw new Fail(409, 'This draft was already sent.');
  const flags = await A.flagsFor(schoolId, d.kind, d.content, d.flags); const blocks = flags.filter((f) => f.severity === 'block');
  if (blocks.length) throw new Fail(422, 'Fix these before sending for review.', { reason: 'blocked', flags: blocks });
  const r = await AssistantDraft.updateOne({ _id: d._id, status: 'Draft' }, { $set: { status: 'Review', submittedAt: new Date(), flags, contentHash: A.hashOf(d) }, $push: { trail: { at: new Date(), byName: ctx.actor.name, action: 'sent for review', note: '' } } });
  if (!r.matchedCount) throw new Fail(409, 'This draft was already sent.');
  await A.audit(ctx, { action: 'submit', draftId: String(d._id), draftNo: d.no, kind: d.kind, flags: flags.length });
  if (KINDS[d.kind].separate) { const revs = (await S.N.admins(schoolId)).filter((x) => String(x.id) !== String(ctx.actor.id)); await tell(schoolId, revs, `${KINDS[d.kind].label} waits for review`, `${d.no}: ${d.title}`, '/admin/dashboard#/ai'); }
  res.json({ ok: true });
});
exports.decide = wrap('decide', async (req, res) => {
  const schoolId = sid(req); const ctx = ctxOf(req); const d = await loadDraft(req); const lv = req.aiLevel; const K = KINDS[d.kind]; const b = req.body || {};
  const decision = b.decision; if (!['approve', 'reject', 'return'].includes(decision)) throw new Fail(422, 'Choose approve, return for changes or reject.');
  if (d.status !== 'Review') throw new Fail(409, 'This draft is not waiting for review.');
  const own = mine(req, d);
  if (!own && lv === 'teacher') throw new Fail(403, 'You cannot review this.');
  if (own && K.separate && decision === 'approve' && !(await S.sole(schoolId) && req.user.role === 'admin')) throw new Fail(403, `${K.label} must be approved by someone other than the person who wrote it.`, { reason: 'maker_checker' });
  const note = S.text(b.note, 'A note', { min: decision === 'approve' ? 0 : 5, max: 400 });
  let sole = false;
  if (decision === 'approve') {
    if (K.separate && own) sole = true; else if (K.separate) sole = false;
    const flags = await A.flagsFor(schoolId, d.kind, d.content, d.flags); const blocks = flags.filter((f) => f.severity === 'block'); if (blocks.length) throw new Fail(422, 'This draft still has problems that must be fixed first.', { reason: 'blocked', flags: blocks });
    const conf = b.confirmed || {}; const ids = (arr) => new Set((Array.isArray(arr) ? arr : []).map(String));
    const need = d.kind === 'question_set' ? (d.content.questions || []).map((q) => q.id) : (d.content.sections || []).map((s) => s.id);
    const got = ids(d.kind === 'question_set' ? conf.questions : conf.sections); if (need.some((i) => !got.has(i))) throw new Fail(422, d.kind === 'question_set' ? 'Confirm that you checked the answer to every question.' : 'Confirm that you read every section.', { reason: 'not_read' });
    const acked = ids(conf.flags); const warns = flags.filter((f) => f.severity === 'warn'); if (warns.some((f) => !acked.has(f.id))) throw new Fail(422, 'Accept or fix each warning before approving.', { reason: 'warnings', flags: warns });
    if (d.kind === 'translation' && conf.readsTargetLanguage !== true) throw new Fail(422, 'A person who reads the target language must confirm the text.', { reason: 'language' });
    const hash = A.hashOf(d); if (hash !== d.contentHash) throw new Fail(409, 'The draft changed after it was sent. Please look again.');
    const exp = K.publishes ? new Date(Date.now() + 30 * 86400000) : null;
    const r = await AssistantDraft.updateOne({ _id: d._id, status: 'Review', contentHash: d.contentHash }, { $set: { status: 'Approved', decidedById: ctx.actor.id, decidedByName: ctx.actor.name, decidedAt: new Date(), decisionNote: note, soleAdmin: sole, expiresAt: exp, flags }, $push: { trail: { at: new Date(), byName: ctx.actor.name, action: 'approved', note } } });
    if (!r.matchedCount) throw new Fail(409, 'This draft was just decided by someone else.');
    await AIApproval.create({ schoolId, subject: 'draft', subjectId: String(d._id), subjectNo: d.no, decision: 'approve', byId: ctx.actor.id, byName: ctx.actor.name, byRole: ctx.role, note, confirmed: { sections: [...got].filter((i) => need.includes(i)), questions: d.kind === 'question_set' ? [...got] : [], flags: [...acked], readsTargetLanguage: conf.readsTargetLanguage === true }, contentHash: hash, soleAdmin: sole, at: new Date() });
  } else {
    const status = decision === 'reject' ? 'Rejected' : 'Draft';
    const r = await AssistantDraft.updateOne({ _id: d._id, status: 'Review' }, { $set: { status, decidedById: ctx.actor.id, decidedByName: ctx.actor.name, decidedAt: new Date(), decisionNote: note }, $push: { trail: { at: new Date(), byName: ctx.actor.name, action: decision === 'reject' ? 'rejected' : 'returned for changes', note } } });
    if (!r.matchedCount) throw new Fail(409, 'This draft was just decided by someone else.');
    await AIApproval.create({ schoolId, subject: 'draft', subjectId: String(d._id), subjectNo: d.no, decision, byId: ctx.actor.id, byName: ctx.actor.name, byRole: ctx.role, note, contentHash: d.contentHash, at: new Date() });
  }
  await A.audit(ctx, { action: decision === 'approve' ? 'approve' : decision, draftId: String(d._id), draftNo: d.no, kind: d.kind, approverName: ctx.actor.name, outputHash: d.contentHash });
  if (!own) await tell(schoolId, [{ id: d.requesterId, role: d.requesterRole || 'teacher' }], `${K.label} ${decision === 'approve' ? 'approved' : decision === 'return' ? 'returned' : 'declined'}`, `${d.no}: ${note || d.title}`, `/${d.requesterRole === 'admin' ? 'admin' : 'teacher'}/dashboard#/ai`);
  res.json({ ok: true, soleAdmin: sole });
});
exports.withdraw = wrap('withdraw', async (req, res) => {
  const ctx = ctxOf(req); const d = await loadDraft(req); if (!mine(req, d) && req.user.role !== 'admin') throw new Fail(403, 'Only the person who made the draft can withdraw it.');
  if (!['Draft', 'Review', 'Approved'].includes(d.status) || d.publishState !== 'none') throw new Fail(409, 'This draft can no longer be withdrawn.');
  const r = await AssistantDraft.updateOne({ _id: d._id, status: d.status, publishState: 'none' }, { $set: { status: 'Withdrawn', content: {}, expiresAt: new Date() }, $push: { trail: { at: new Date(), byName: ctx.actor.name, action: 'withdrawn', note: '' } } });
  if (!r.matchedCount) throw new Fail(409, 'This draft changed. Please look again.');
  await AIApproval.create({ schoolId: sid(req), subject: 'draft', subjectId: String(d._id), subjectNo: d.no, decision: 'withdraw', byId: ctx.actor.id, byName: ctx.actor.name, byRole: ctx.role, at: new Date() });
  await A.audit(ctx, { action: 'withdraw', draftId: String(d._id), draftNo: d.no, kind: d.kind }); res.json({ ok: true });
});

// a notice or a set of questions leaves the assistant only after approval, and only once
exports.publish = wrap('publish', async (req, res) => {
  const schoolId = sid(req); const ctx = ctxOf(req); const d = await loadDraft(req); const K = KINDS[d.kind];
  if (!K.publishes) throw new Fail(422, 'This kind of writing is used by copying it, not published from here.');
  if (d.status !== 'Approved') throw new Fail(409, 'Only an approved draft can be published.');
  if (!mine(req, d) && req.aiLevel === 'teacher') throw new Fail(403, 'You cannot publish this.');
  const ap = await AIApproval.findOne({ schoolId, subject: 'draft', subjectId: String(d._id), decision: 'approve' }).sort({ at: -1 });
  if (!ap || ap.contentHash !== A.hashOf(d)) throw new Fail(409, 'The draft no longer matches what was approved.');
  const claim = await AssistantDraft.updateOne({ _id: d._id, status: 'Approved', publishState: 'none' }, { $set: { publishState: 'claimed' } });
  if (!claim.matchedCount) throw new Fail(409, 'This draft is already being published or was published.');
  try {
    let published;
    if (d.kind === 'notice') {
      const sec = d.content.sections || []; const title = (sec[0]?.text || d.title).slice(0, 150); const body = sec[1]?.text || '';
      const ctl = require('../controllers/noticeController');
      const user = { userId: req.user.userId, role: req.user.role, schoolId: req.user.schoolId };
      const n = await ctl.publishNotice(user, { title, content: body, category: d.request.noticeType === 'exam' ? 'Exam' : d.request.noticeType === 'event' ? 'Event' : 'General', targetAudience: d.request.audience, targetClassId: d.classId || undefined, priority: 'Medium' }, { aiAssisted: true, aiDraftNo: d.no, aiReviewedBy: d.decidedByName });
      published = { type: 'Notice', ids: [String(n._id)], at: new Date(), byName: ctx.actor.name };
    } else {
      const bank = require('../controllers/assessBankController'); const items = [];
      const srcNames = (d.provenance?.sourceTitles || []).join('; ').slice(0, 150);
      for (const q of d.content.questions || []) {
        const body = { kind: q.kind, stem: q.stem, marks: q.marks || 1, difficulty: q.difficulty, topic: q.topic, tags: ['ai-assisted'], explanation: `Drafted with the writing assistant (${d.no}); answers checked by ${d.decidedByName}.`, license: { kind: 'adapted', source: `Assistant draft ${d.no} from: ${srcNames || 'school sources'}`.slice(0, 200), holder: ctx.actor.name || '' } };
        if (q.kind === 'mcq') body.options = q.options.map((o) => ({ text: o.text, correct: o.correct })); else if (q.kind === 'tf') body.answerTrue = q.answerTrue; else body.accepted = q.accepted;
        const c = bank.cleanItem(body); if (c.error) throw new Fail(422, `A question could not enter the bank: ${c.error}`); items.push(c.item);
      }
      const crypto = require('crypto'); const ids = [];
      for (const it of items) { const doc = await QuestionItem.create({ ...it, schoolId, itemKey: crypto.randomBytes(8).toString('hex'), version: 1, current: true, state: 'Draft', authorId: d.requesterId, authorRole: d.requesterRole, authorName: d.requesterName, sharing: 'private', aiAssisted: true, aiDraftNo: d.no, changeNote: `Assistant draft ${d.no}` }); ids.push(String(doc._id)); }
      published = { type: 'QuestionItem', ids, at: new Date(), byName: ctx.actor.name };
    }
    await AssistantDraft.updateOne({ _id: d._id }, { $set: { publishState: 'done', published, expiresAt: null }, $push: { trail: { at: new Date(), byName: ctx.actor.name, action: 'published', note: published.type } } });
    await AIApproval.create({ schoolId, subject: 'draft', subjectId: String(d._id), subjectNo: d.no, decision: 'publish', byId: ctx.actor.id, byName: ctx.actor.name, byRole: ctx.role, contentHash: d.contentHash, at: new Date() });
    await A.audit(ctx, { action: 'publish', draftId: String(d._id), draftNo: d.no, kind: d.kind, approverName: d.decidedByName });
    res.json({ ok: true, published });
  } catch (e) { await AssistantDraft.updateOne({ _id: d._id, publishState: 'claimed' }, { $set: { publishState: 'none' } }); throw e; }
});

/* ───────── trail, report, fee checks ───────── */
const guardCsv = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csvCell = (v) => `"${guardCsv(v).replace(/"/g, '""')}"`;
exports.audit = wrap('audit', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; if (req.aiLevel === 'teacher' || req.query.mine === '1') q.actorId = oid(req.user.userId);
  if (req.query.action) q.action = String(req.query.action); if (req.query.draft) q.draftId = String(req.query.draft); if (req.query.actor && req.user.role === 'admin') q.actorId = oid(req.query.actor);
  if (req.query.from || req.query.to) { q.at = {}; if (req.query.from && S.isDay(req.query.from)) q.at.$gte = new Date(`${req.query.from}T00:00:00Z`); if (req.query.to && S.isDay(req.query.to)) q.at.$lte = new Date(`${req.query.to}T23:59:59Z`); if (!Object.keys(q.at).length) delete q.at; }
  const { p, l } = S.pg(req.query);
  if (req.query.format === 'csv') {
    if (req.user.role !== 'admin') throw new Fail(403, 'Only administrators can download the trail.');
    const rows = await AiAudit.find(q).sort({ at: -1 }).limit(5000);
    const head = ['When', 'Who', 'Role', 'Action', 'Draft', 'Kind', 'Provider', 'Model', 'Prompt fingerprint', 'Output fingerprint', 'Removed before sending', 'Warnings', 'Worked', 'Reason', 'Approver'];
    const lines = [head.map(csvCell).join(',')]; for (const r of rows) lines.push([r.at.toISOString(), r.actorName, r.actorRole, r.action, r.draftNo, r.kind, r.provider, r.model, r.promptHash.slice(0, 12), r.outputHash.slice(0, 12), JSON.stringify(r.removed || {}), r.flags, r.ok ? 'yes' : 'no', r.reason, r.approverName].map(csvCell).join(','));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ai-trail.csv"' }); return res.send(`﻿${lines.join('\n')}`);
  }
  const rows = await AiAudit.find(q).sort({ at: -1 }).skip((p - 1) * l).limit(l);
  res.json({ rows: rows.map((r) => ({ _id: r._id, at: r.at, actorName: r.actorName, actorRole: r.actorRole, action: r.action, draftNo: r.draftNo, kind: r.kind, provider: r.provider, model: r.model, version: r.version, prompt: r.prompt, promptHash: r.promptHash, outputHash: r.outputHash, removed: r.removed, flags: r.flags, ok: r.ok, reason: r.reason, ms: r.ms, approverName: r.approverName })), total: await AiAudit.countDocuments(q) });
});
exports.report = wrap('report', async (req, res) => {
  const schoolId = sid(req); const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30)); const since = new Date(Date.now() - days * 86400000);
  const drafts = await AssistantDraft.find({ schoolId, createdAt: { $gte: since } }).select('kind status flags createdAt submittedAt decidedAt requesterName edits').lean();
  const byKind = {}; for (const d of drafts) { const k = (byKind[d.kind] ||= { made: 0, approved: 0, rejected: 0, returned: 0, flagged: 0, edited: 0 }); k.made += 1; if (d.status === 'Approved') k.approved += 1; if (d.status === 'Rejected') k.rejected += 1; if ((d.flags || []).some((f) => f.severity !== 'note')) k.flagged += 1; if (d.edits) k.edited += 1; }
  const waits = drafts.filter((d) => d.submittedAt && d.decidedAt).map((d) => (new Date(d.decidedAt) - new Date(d.submittedAt)) / 3600000).sort((a, b) => a - b);
  const audit = await AiAudit.find({ schoolId, at: { $gte: since } }).select('action ok reason at actorName actorId removed').lean();
  const refused = {}; const removed = {}; let modelErrors = 0; const perDay = {}; const people = {};
  for (const a of audit) { if (a.action === 'refused') for (const c of String(a.reason || '').split(',')) refused[c] = (refused[c] || 0) + 1; if (a.action === 'generate') { if (!a.ok) modelErrors += 1; else { const day = a.at.toISOString().slice(0, 10); perDay[day] = (perDay[day] || 0) + 1; people[a.actorName] = (people[a.actorName] || 0) + 1; } for (const [k, v] of Object.entries(a.removed || {})) removed[k] = (removed[k] || 0) + v; } }
  const reviewed = drafts.filter((d) => ['Approved', 'Rejected'].includes(d.status)).length;
  res.json({ days, drafts: drafts.length, byKind, approvalRate: reviewed ? Math.round((drafts.filter((d) => d.status === 'Approved').length / reviewed) * 100) : null, medianReviewHours: waits.length ? Math.round(waits[Math.floor(waits.length / 2)] * 10) / 10 : null, refused, removedBeforeSending: removed, modelErrors, perDay, topUsers: Object.entries(people).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, n })), trainingUse: 'excluded' });
});
exports.feeChecks = wrap('feeChecks', async (req, res) => { await needWide(req); const days = Math.min(180, Math.max(7, parseInt(req.query.days, 10) || 60)); res.json({ days, exceptions: await FeeChecks.find(sid(req), { days }) }); });
exports.feeChecked = wrap('feeChecked', async (req, res) => { await needWide(req); const key = String(req.params.key || '').slice(0, 40); const note = S.text(req.body?.note, 'A note', { min: 5, max: 300 }); await A.audit(ctxOf(req), { action: 'fee_check', draftNo: key, reason: note }); res.json({ ok: true }); });

/* ───────── nightly ───────── */
exports.sweepSchool = async (schoolId) => {
  const now = new Date(); let expired = 0;
  const due = await AssistantDraft.find({ schoolId, expiresAt: { $lte: now }, status: { $in: ['Draft', 'Review', 'Rejected', 'Approved', 'Withdrawn'] } }).select('_id status');
  for (const d of due) { const r = await AssistantDraft.updateOne({ _id: d._id, status: d.status, publishState: { $ne: 'done' } }, { $set: { status: d.status === 'Withdrawn' ? 'Withdrawn' : 'Expired', content: {}, expiresAt: null } }); if (r.matchedCount) expired += 1; }
  await AssistantDraft.updateMany({ schoolId, publishState: 'claimed', updatedAt: { $lte: new Date(Date.now() - 600000) } }, { $set: { publishState: 'none' } });
  const cut = new Date(Date.now() - 180 * 86400000); const purged = await AiAudit.updateMany({ schoolId, at: { $lte: cut }, prompt: { $ne: '' } }, { $set: { prompt: '' } });
  return { expired, purged: purged.modifiedCount || 0 };
};
exports.sweepAll = async () => { const School = require('../models/School'); const out = { schools: 0, expired: 0 }; for (const s of await School.find({}).select('_id')) { const r = await exports.sweepSchool(s._id); out.schools += 1; out.expired += r.expired; } return out; };
