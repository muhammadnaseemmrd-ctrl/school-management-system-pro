// Accreditation evidence, review cycles, audit findings, the board portal, service hours and the annual report (PRD E32).
const crypto = require('crypto');
const AccStandard = require('../models/AccStandard');
const AccEvidence = require('../models/AccEvidence');
const QaCycle = require('../models/QaCycle');
const AuditFinding = require('../models/AuditFinding');
const BoardMember = require('../models/BoardMember');
const BoardMeeting = require('../models/BoardMeeting');
const ServiceLog = require('../models/ServiceLog');
const AnnualReport = require('../models/AnnualReport');
const AlumniProfile = require('../models/AlumniProfile');
const DonorGift = require('../models/DonorGift');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const FeePayment = require('../models/FeePayment');
const School = require('../models/School');
const User = require('../models/User');
const V = require('../utils/advancement/service');

const { S, Fail, oid, sid, txt, money } = V;
const wrap = S.wrap; const bad = S.bad;
const ctxOf = (req) => S.ctxOf(req);
const nameOf = (req) => req.actorName || req.user.name || '';
const toId = (v, name) => { try { return oid(v); } catch (e) { throw new Fail(422, `${name} is not valid.`); } };
const tell = async (schoolId, recipients, title, body, link, key = '') => { try { await S.N.notify({ schoolId, recipients, title, body, link, type: 'quality', key }); } catch (e) { console.error('quality notify:', e.message); } };
const trail = (req, action, note = '') => ({ at: new Date(), byName: nameOf(req), action, note: String(note || '').slice(0, 300) });

/* ───────────────────────── standards and evidence ───────────────────────── */
exports.standards = wrap('standards', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; if (req.query.framework) q.framework = String(req.query.framework);
  const ss = await AccStandard.find(q).sort({ framework: 1, code: 1 }).limit(1000); res.json({ standards: ss, frameworks: [...new Set(ss.map((s) => s.framework))] });
});
exports.addStandard = wrap('addStandard', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const framework = txt(b.framework, 80); const code = txt(b.code, 30); const title = txt(b.title, 160);
  if (framework.length < 2 || !code || title.length < 3) throw new Fail(422, 'Give the framework, a code and a title.');
  let owner = null; if (b.ownerId) { owner = await V.person(schoolId, b.ownerId); if (!owner) throw new Fail(404, 'That owner is not a member of staff here.'); }
  try { const s = await AccStandard.create({ schoolId, framework, code, title, description: txt(b.description, 600), ownerId: owner?.id || null, ownerName: owner?.name || '' }); await V.note(req, 'standard.add', 'AccStandard', s._id, {}); res.status(201).json({ standard: s }); }
  catch (e) { if (e.code === 11000) throw new Fail(409, 'This code already exists in that framework.'); throw e; }
});
exports.editStandard = wrap('editStandard', async (req, res) => {
  const s = await AccStandard.findOne({ _id: toId(req.params.id, 'The standard'), schoolId: sid(req) }); if (!s) throw new Fail(404, 'Standard not found.'); const b = req.body || {}; const set = {};
  if (b.title !== undefined) { set.title = txt(b.title, 160); if (set.title.length < 3) throw new Fail(422, 'Give a title.'); } if (b.description !== undefined) set.description = txt(b.description, 600); if (b.retired !== undefined) set.retired = !!b.retired;
  if (b.ownerId) { const o = await V.person(sid(req), b.ownerId); if (!o) throw new Fail(404, 'That owner is not a member of staff here.'); set.ownerId = o.id; set.ownerName = o.name; }
  await AccStandard.updateOne({ _id: s._id }, { $set: set }); res.json({ standard: await AccStandard.findOne({ _id: s._id }) });
});
exports.evidence = wrap('evidence', async (req, res) => {
  const q = { schoolId: sid(req) }; if (req.query.standardId) q.standardId = toId(req.query.standardId, 'The standard'); if (req.query.status) q.status = String(req.query.status);
  res.json({ evidence: await AccEvidence.find(q).sort({ createdAt: -1 }).limit(500) });
});
exports.addEvidence = wrap('addEvidence', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const st = await AccStandard.findOne({ _id: toId(b.standardId, 'The standard'), schoolId }); if (!st) throw new Fail(404, 'Standard not found.'); if (st.retired) throw new Fail(409, 'This standard is retired.');
  const title = txt(b.title, 160); if (title.length < 3) throw new Fail(422, 'Give the evidence a title.'); const heldAt = txt(b.heldAt, 300); if (heldAt.length < 3) throw new Fail(422, 'Say where the evidence is kept (a link, or the place of the paper copy).');
  if (b.validUntil && !V.isDay(b.validUntil)) throw new Fail(422, 'Give the date as YYYY-MM-DD.'); if (b.validUntil && b.validUntil < V.day()) throw new Fail(422, 'That date has already passed.');
  const e = await AccEvidence.create({ schoolId, standardId: st._id, title, kind: ['document', 'link', 'observation', 'data'].includes(b.kind) ? b.kind : 'document', heldAt, period: txt(b.period, 40), validUntil: b.validUntil || '', status: 'Submitted', submittedById: oid(req.user.userId), submittedByName: nameOf(req), trail: [trail(req, 'submitted')] });
  await V.note(req, 'evidence.add', 'AccEvidence', e._id, {}); res.status(201).json({ evidence: e });
});
exports.reviewEvidence = wrap('reviewEvidence', async (req, res) => {
  const schoolId = sid(req); const e = await AccEvidence.findOne({ _id: toId(req.params.id, 'The evidence'), schoolId }); if (!e) throw new Fail(404, 'Evidence not found.'); if (e.status !== 'Submitted') throw new Fail(409, `This was already ${e.status.toLowerCase()}.`);
  const decision = String(req.body?.decision || ''); if (!['accept', 'reject'].includes(decision)) throw new Fail(422, 'Choose accept or reject.'); const noteText = txt(req.body?.note, 300); if (decision === 'reject' && noteText.length < 5) throw new Fail(422, 'Say what is missing.');
  const sole = await S.separate(ctxOf(req), e.submittedById, 'Evidence');
  if (decision === 'accept' && e.validUntil && e.validUntil < V.day()) throw new Fail(409, 'This evidence has already expired.');
  const r = await AccEvidence.updateOne({ _id: e._id, status: 'Submitted' }, { $set: { status: decision === 'accept' ? 'Accepted' : 'Rejected', reviewedById: oid(req.user.userId), reviewedByName: nameOf(req), reviewedAt: new Date(), reviewNote: noteText, soleAdmin: sole, trail: [...(e.trail || []), trail(req, decision === 'accept' ? 'accepted' : 'rejected', noteText)] } });
  if (!r.matchedCount) throw new Fail(409, 'Someone else already reviewed this.');
  await V.note(req, `evidence.${decision}`, 'AccEvidence', e._id, { soleAdmin: sole }); res.json({ ok: true, soleAdmin: sole });
});
// For each standard: is it met by evidence that has been accepted by someone else and has not run out?
exports.coverage = wrap('coverage', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId, retired: false }; if (req.query.framework) q.framework = String(req.query.framework);
  const ss = await AccStandard.find(q).sort({ framework: 1, code: 1 }).limit(1000); const ev = await AccEvidence.find({ schoolId }).limit(20000); const today = V.day(); const soon = V.addDays(today, 30);
  const by = new Map(); for (const e of ev) { const k = String(e.standardId); by.set(k, [...(by.get(k) || []), e]); }
  const rows = ss.map((s) => {
    const list = by.get(String(s._id)) || []; const good = list.filter((e) => e.status === 'Accepted' && (!e.validUntil || e.validUntil >= today)); const waiting = list.filter((e) => e.status === 'Submitted').length;
    const state = good.length ? (good.every((e) => e.validUntil && e.validUntil <= soon) ? 'Expiring' : 'Met') : waiting ? 'Waiting' : 'Gap';
    return { id: s._id, framework: s.framework, code: s.code, title: s.title, ownerName: s.ownerName, state, accepted: good.length, waiting, nextExpiry: good.map((e) => e.validUntil).filter(Boolean).sort()[0] || null };
  });
  const count = (k) => rows.filter((r) => r.state === k).length;
  res.json({ standards: rows, summary: { total: rows.length, met: count('Met'), expiring: count('Expiring'), waiting: count('Waiting'), gaps: count('Gap'), percentMet: rows.length ? Math.round(((count('Met') + count('Expiring')) / rows.length) * 100) : null } });
});

/* ───────────────────────── review cycles ───────────────────────── */
exports.cycles = wrap('cycles', async (req, res) => {
  const cs = await QaCycle.find({ schoolId: sid(req), retired: false }).sort({ nextDueOn: 1 }).limit(300); const today = V.day();
  res.json({ cycles: cs.map((c) => ({ ...c.toObject(), overdue: c.nextDueOn < today, dueSoon: c.nextDueOn >= today && c.nextDueOn <= V.addDays(today, 14) })) });
});
exports.addCycle = wrap('addCycle', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const title = txt(b.title, 120); if (title.length < 3) throw new Fail(422, 'Give the review a title.');
  const interval = Number(b.intervalMonths || 12); if (!Number.isInteger(interval) || interval < 1 || interval > 60) throw new Fail(422, 'Choose 1 to 60 months.'); if (!V.isDay(b.nextDueOn)) throw new Fail(422, 'Give the next due date as YYYY-MM-DD.');
  let owner = null; if (b.ownerId) { owner = await V.person(schoolId, b.ownerId); if (!owner) throw new Fail(404, 'That owner is not a member of staff here.'); }
  const c = await QaCycle.create({ schoolId, title, area: txt(b.area, 80), ownerId: owner?.id || null, ownerName: owner?.name || '', intervalMonths: interval, nextDueOn: b.nextDueOn });
  await V.note(req, 'cycle.add', 'QaCycle', c._id, {}); res.status(201).json({ cycle: c });
});
exports.completeCycle = wrap('completeCycle', async (req, res) => {
  const c = await QaCycle.findOne({ _id: toId(req.params.id, 'The review'), schoolId: sid(req), retired: false }); if (!c) throw new Fail(404, 'Review not found.');
  const outcome = String(req.body?.outcome || ''); if (!['no_change', 'updated', 'retired'].includes(outcome)) throw new Fail(422, 'Choose no change, updated or retired.'); const note = txt(req.body?.note, 400); if (note.length < 10) throw new Fail(422, 'Write what was reviewed and found.');
  const today = V.day(); const row = { on: today, byName: nameOf(req), outcome, note };
  const set = outcome === 'retired' ? { retired: true, history: [...c.history, row] } : { lastReviewedOn: today, nextDueOn: V.addMonths(today, c.intervalMonths), history: [...c.history, row].slice(-30) };
  const r = await QaCycle.updateOne({ _id: c._id, nextDueOn: c.nextDueOn }, { $set: set }); if (!r.matchedCount) throw new Fail(409, 'Someone else just completed this review.');
  await V.note(req, 'cycle.complete', 'QaCycle', c._id, { outcome }); res.json({ cycle: await QaCycle.findOne({ _id: c._id }) });
});

/* ───────────────────────── audit findings ───────────────────────── */
const fView = (f, today) => ({ ...f.toObject(), overdue: f.status !== 'Closed' && !!f.dueOn && f.dueOn < today });
exports.findings = wrap('findings', async (req, res) => {
  const q = { schoolId: sid(req) }; if (req.query.status) q.status = String(req.query.status); const today = V.day();
  res.json({ findings: (await AuditFinding.find(q).sort({ createdAt: -1 }).limit(500)).map((f) => fView(f, today)) });
});
exports.addFinding = wrap('addFinding', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const title = txt(b.title, 160); if (title.length < 4) throw new Fail(422, 'Give the finding a title.');
  const owner = await V.person(schoolId, b.ownerId); if (!owner) throw new Fail(422, 'Choose who is responsible. They must be a member of staff here.');
  if (b.dueOn && !V.isDay(b.dueOn)) throw new Fail(422, 'Give the date as YYYY-MM-DD.'); if (b.standardId) { const s = await AccStandard.findOne({ _id: toId(b.standardId, 'The standard'), schoolId }); if (!s) throw new Fail(404, 'Standard not found.'); }
  const f = await AuditFinding.create({ schoolId, no: await V.nextNo(schoolId, 'FND'), title, detail: txt(b.detail, 1200), severity: ['low', 'medium', 'high'].includes(b.severity) ? b.severity : 'medium', standardId: b.standardId ? toId(b.standardId, 'The standard') : null, raisedById: oid(req.user.userId), raisedByName: nameOf(req), ownerId: owner.id, ownerName: owner.name, dueOn: b.dueOn || '', status: 'Open', trail: [trail(req, 'raised')] });
  await tell(schoolId, [{ id: owner.id, role: owner.role === 'admin' ? 'admin' : 'teacher' }], 'An audit finding is yours to act on', title, '/admin?tab=quality', `finding-${f._id}`);
  await V.note(req, 'finding.add', 'AuditFinding', f._id, { severity: f.severity }); res.status(201).json({ finding: fView(f, V.day()) });
});
exports.planFinding = wrap('planFinding', async (req, res) => {
  const f = await AuditFinding.findOne({ _id: toId(req.params.id, 'The finding'), schoolId: sid(req) }); if (!f) throw new Fail(404, 'Finding not found.'); if (f.status === 'Closed') throw new Fail(409, 'This finding is closed.');
  const isOwner = String(f.ownerId) === String(req.user.userId); const lead = req.user.role === 'admin' || (await V.can(req.user, 'quality.lead')).allowed; if (!isOwner && !lead) throw new Fail(403, 'Only the person responsible or a quality lead can write the plan.');
  const plan = txt(req.body?.plan, 800); if (plan.length < 15) throw new Fail(422, 'Write what will be done.'); const dueOn = req.body?.dueOn || f.dueOn; if (dueOn && !V.isDay(dueOn)) throw new Fail(422, 'Give the date as YYYY-MM-DD.');
  await AuditFinding.updateOne({ _id: f._id, status: f.status }, { $set: { plan, dueOn: dueOn || '', status: 'Planned', trail: [...f.trail, trail(req, 'planned')] } }); res.json({ ok: true });
});
// Whoever was responsible cannot close their own finding.
exports.closeFinding = wrap('closeFinding', async (req, res) => {
  const f = await AuditFinding.findOne({ _id: toId(req.params.id, 'The finding'), schoolId: sid(req) }); if (!f) throw new Fail(404, 'Finding not found.'); if (f.status === 'Closed') throw new Fail(409, 'This finding is already closed.'); if (f.status !== 'Planned') throw new Fail(409, 'Write the plan before closing it.');
  const note = txt(req.body?.note, 500); const evidence = txt(req.body?.evidence, 300); if (note.length < 10) throw new Fail(422, 'Write what was done and checked.'); if (evidence.length < 3) throw new Fail(422, 'Say where the proof is kept.');
  const sole = await S.separate(ctxOf(req), f.ownerId, 'Closing a finding');
  const r = await AuditFinding.updateOne({ _id: f._id, status: 'Planned' }, { $set: { status: 'Closed', closure: { note, evidence, byName: nameOf(req), byId: oid(req.user.userId), at: new Date(), soleAdmin: sole }, trail: [...f.trail, trail(req, 'closed', note)] } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this finding.');
  await V.note(req, 'finding.close', 'AuditFinding', f._id, { soleAdmin: sole }); res.json({ ok: true, soleAdmin: sole });
});

/* ───────────────────────── board ───────────────────────── */
const memberOf = async (req) => BoardMember.findOne({ schoolId: sid(req), userId: oid(req.user.userId), active: true });
// Only members. A school-wide administrator is not a member just because of the job.
exports.boardOnly = async (req, res, next) => { try { const m = await memberOf(req); if (!m) return bad(res, 403, 'The board papers are only for board members.'); req.board = m; return next(); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const lead = (req) => ['chair', 'secretary'].includes(req.board?.role);
exports.boardMe = wrap('boardMe', async (req, res) => { const m = await memberOf(req); res.json({ member: m ? { role: m.role, userName: m.userName } : null }); });
exports.members = wrap('members', async (req, res) => res.json({ members: await BoardMember.find({ schoolId: sid(req) }).sort({ active: -1, createdAt: 1 }).limit(100) }));
exports.addMember = wrap('addMember', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const u = await V.person(schoolId, b.userId); if (!u || !['admin', 'teacher'].includes(u.role)) throw new Fail(404, 'Board members must be staff accounts in this school.');
  const role = ['chair', 'secretary', 'member', 'observer'].includes(b.role) ? b.role : 'member';
  if (role === 'chair') { const c = await BoardMember.findOne({ schoolId, role: 'chair', active: true }); if (c) throw new Fail(409, 'There is already a chair. Remove them first.'); }
  try { const m = await BoardMember.create({ schoolId, userId: u.id, userName: u.name, userRole: u.role, role, active: true, from: V.day(), activeKey: `${schoolId}:${u.id}` }); await V.note(req, 'board.add', 'BoardMember', m._id, { role }); res.status(201).json({ member: m }); }
  catch (e) { if (e.code === 11000) throw new Fail(409, 'This person is already a member.'); throw e; }
});
exports.removeMember = wrap('removeMember', async (req, res) => {
  const m = await BoardMember.findOne({ _id: toId(req.params.id, 'The member'), schoolId: sid(req) }); if (!m || !m.active) throw new Fail(404, 'Member not found.');
  await BoardMember.updateOne({ _id: m._id }, { $set: { active: false, activeKey: null, to: V.day() } }); await V.note(req, 'board.remove', 'BoardMember', m._id, {}); res.json({ ok: true });
});
const mView = (m, board) => ({ ...m.toObject(), agenda: (m.agenda || []).filter((a) => !a.restricted || ['chair', 'secretary'].includes(board.role)) });
exports.meetings = wrap('meetings', async (req, res) => res.json({ meetings: (await BoardMeeting.find({ schoolId: sid(req) }).sort({ date: -1 }).limit(100)).map((m) => ({ id: m._id, title: m.title, date: m.date, status: m.status, minutes: m.minutes?.status || 'None' })) }));
exports.meeting = wrap('meeting', async (req, res) => { const m = await BoardMeeting.findOne({ _id: toId(req.params.id, 'The meeting'), schoolId: sid(req) }); if (!m) throw new Fail(404, 'Meeting not found.'); res.json({ meeting: mView(m, req.board) }); });
const needLead = (req) => { if (!lead(req)) throw new Fail(403, 'Only the chair or the secretary can do this.'); };
const agendaOf = (list) => (Array.isArray(list) ? list : []).slice(0, 40).map((a, i) => ({ id: a.id || `a${i + 1}-${crypto.randomBytes(3).toString('hex')}`, title: txt(a?.title, 140), text: txt(a?.text, 2000), restricted: !!a?.restricted })).filter((a) => a.title);
exports.addMeeting = wrap('addMeeting', async (req, res) => {
  needLead(req); const b = req.body || {}; const title = txt(b.title, 140); if (title.length < 3) throw new Fail(422, 'Give the meeting a title.'); if (!V.isDay(b.date)) throw new Fail(422, 'Give the date as YYYY-MM-DD.');
  const m = await BoardMeeting.create({ schoolId: sid(req), title, date: b.date, agenda: agendaOf(b.agenda), createdByName: nameOf(req) }); await V.note(req, 'meeting.add', 'BoardMeeting', m._id, {}); res.status(201).json({ meeting: mView(m, req.board) });
});
exports.editMeeting = wrap('editMeeting', async (req, res) => {
  needLead(req); const m = await BoardMeeting.findOne({ _id: toId(req.params.id, 'The meeting'), schoolId: sid(req) }); if (!m) throw new Fail(404, 'Meeting not found.'); if (m.status !== 'Planned') throw new Fail(409, 'The agenda of a meeting that took place is fixed.');
  const b = req.body || {}; const set = {}; if (b.title !== undefined) set.title = txt(b.title, 140); if (b.date !== undefined) { if (!V.isDay(b.date)) throw new Fail(422, 'Give the date as YYYY-MM-DD.'); set.date = b.date; } if (b.agenda !== undefined) set.agenda = agendaOf(b.agenda);
  if (b.status === 'Cancelled') set.status = 'Cancelled'; if (b.status === 'Held') set.status = 'Held';
  await BoardMeeting.updateOne({ _id: m._id, status: 'Planned' }, { $set: set }); res.json({ meeting: mView(await BoardMeeting.findOne({ _id: m._id }), req.board) });
});
exports.resolve = wrap('resolve', async (req, res) => {
  needLead(req); const m = await BoardMeeting.findOne({ _id: toId(req.params.id, 'The meeting'), schoolId: sid(req) }); if (!m) throw new Fail(404, 'Meeting not found.'); if (m.status !== 'Held') throw new Fail(409, 'Record resolutions after the meeting is marked as held.');
  const text = txt(req.body?.text, 600); if (text.length < 5) throw new Fail(422, 'Write the resolution.'); const outcome = ['passed', 'not_passed', 'deferred'].includes(req.body?.outcome) ? req.body.outcome : 'passed';
  await BoardMeeting.updateOne({ _id: m._id }, { $set: { resolutions: [...m.resolutions, { id: `r${m.resolutions.length + 1}`, text, outcome, at: new Date(), byName: nameOf(req) }] } }); res.json({ ok: true });
});
// Minutes: drafted by one person, approved by two other members (the chair among them unless the chair drafted). Editing a draft cancels earlier approvals.
exports.draftMinutes = wrap('draftMinutes', async (req, res) => {
  needLead(req); const m = await BoardMeeting.findOne({ _id: toId(req.params.id, 'The meeting'), schoolId: sid(req) }); if (!m) throw new Fail(404, 'Meeting not found.'); if (m.status !== 'Held') throw new Fail(409, 'Minutes are written after the meeting is held.'); if (m.minutes?.status === 'Approved') throw new Fail(409, 'Approved minutes cannot be changed.');
  const text = txt(req.body?.text, 20000); if (text.length < 20) throw new Fail(422, 'Write the minutes.'); const rev = (m.minutes?.rev || 0) + 1;
  const r = await BoardMeeting.updateOne({ _id: m._id, 'minutes.rev': m.minutes?.rev || 0 }, { $set: { minutes: { status: 'Draft', text, rev, draftedByName: nameOf(req), draftedById: String(req.user.userId), approvals: [] } } }); if (!r.matchedCount) throw new Fail(409, 'Someone else just edited the minutes. Reload them.');
  res.json({ ok: true });
});
exports.approveMinutes = wrap('approveMinutes', async (req, res) => {
  if (req.board.role === 'observer') throw new Fail(403, 'Observers cannot approve minutes.');
  const m = await BoardMeeting.findOne({ _id: toId(req.params.id, 'The meeting'), schoolId: sid(req) }); if (!m) throw new Fail(404, 'Meeting not found.'); const mi = m.minutes || {}; if (mi.status !== 'Draft') throw new Fail(409, mi.status === 'Approved' ? 'These minutes are already approved.' : 'There are no minutes to approve.');
  const me = String(req.user.userId); if (mi.draftedById === me) throw new Fail(403, 'You wrote these minutes, so someone else must approve them.', { reason: 'maker_checker' }); if ((mi.approvals || []).some((a) => a.byId === me)) throw new Fail(409, 'You have already approved these minutes.');
  const approvals = [...(mi.approvals || []), { byName: nameOf(req), byId: me, role: req.board.role, at: new Date() }]; let status = 'Draft';
  if (approvals.length >= 2) { const drafter = await BoardMember.findOne({ schoolId: sid(req), userId: oid(mi.draftedById) }); const chairNeeded = !(drafter && drafter.role === 'chair'); if (!chairNeeded || approvals.some((a) => a.role === 'chair')) status = 'Approved'; }
  const r = await BoardMeeting.updateOne({ _id: m._id, 'minutes.rev': mi.rev }, { $set: { minutes: { ...mi, status, approvals } } }); if (!r.matchedCount) throw new Fail(409, 'The minutes changed while you were reading. Reload them.');
  await V.note(req, 'minutes.approve', 'BoardMeeting', m._id, { status }); res.json({ ok: true, status, approvals: approvals.length });
});

/* ───────────────────────── community service ───────────────────────── */
const sView = (l) => ({ id: l._id, studentId: l.studentId, studentName: l.studentName, activity: l.activity, orgName: l.orgName, hours: l.hours, date: l.date, supervisorName: l.supervisorName, status: l.status, verifiedHours: l.verifiedHours, verifiedAt: l.verifiedAt, verifierStatement: l.verifierStatement, rejectedNote: l.rejectedNote, createdByName: l.createdByName, createdByRole: l.createdByRole, createdAt: l.createdAt });
async function logService(req, student, b) {
  const schoolId = sid(req); const activity = txt(b.activity, 200); if (activity.length < 4) throw new Fail(422, 'Say what the service was.');
  const hours = Number(b.hours); if (!(hours >= 0.5 && hours <= 12) || (hours * 2) % 1 !== 0) throw new Fail(422, 'Give hours between 0.5 and 12, in halves.');
  if (!V.isDay(b.date) || b.date > V.day()) throw new Fail(422, 'Give the date the service took place (not in the future).'); const sup = txt(b.supervisorName, 100); if (sup.length < 3) throw new Fail(422, 'Give the name of the person who supervised.');
  const sameDay = (await ServiceLog.find({ schoolId, studentId: student._id, date: b.date, status: { $in: ['Pending', 'Verified'] } }).select('hours')).reduce((s, l) => s + l.hours, 0);
  if (sameDay + hours > 12) throw new Fail(409, 'That is more than 12 hours of service on one day.');
  const l = V.link('sv'); const doc = await ServiceLog.create({ schoolId, studentId: student._id, studentName: student.name, activity, orgName: txt(b.orgName, 120), hours, date: b.date, supervisorName: sup, linkHash: l.hash, linkPrefix: l.prefix, status: 'Pending', createdById: oid(req.user.userId), createdByName: nameOf(req), createdByRole: req.user.role });
  await V.note(req, 'service.add', 'ServiceLog', doc._id, { hours }); return { log: sView(doc), link: { token: l.token, path: `/service/${l.token}`, shownOnce: true } };
}
exports.logs = wrap('logs', async (req, res) => {
  const q = { schoolId: sid(req) }; if (req.query.status) q.status = String(req.query.status); if (req.query.studentId) q.studentId = toId(req.query.studentId, 'The student');
  res.json({ logs: (await ServiceLog.find(q).sort({ createdAt: -1 }).limit(500)).map(sView) });
});
exports.addLog = wrap('addLog', async (req, res) => {
  const st = await Student.findOne({ _id: toId(req.body?.studentId, 'The student'), schoolId: sid(req) }).select('name isActive'); if (!st) throw new Fail(404, 'Student not found.');
  res.status(201).json(await logService(req, st, req.body || {}));
});
exports.rejectLog = wrap('rejectLog', async (req, res) => {
  const l = await ServiceLog.findOne({ _id: toId(req.params.id, 'The entry'), schoolId: sid(req) }); if (!l) throw new Fail(404, 'Not found.'); const note = txt(req.body?.note, 300); if (note.length < 5) throw new Fail(422, 'Say why.');
  const r = await ServiceLog.updateOne({ _id: l._id, status: { $in: ['Pending', 'Verified'] } }, { $set: { status: 'Rejected', rejectedNote: note, linkHash: '', linkPrefix: '' } }); if (!r.matchedCount) throw new Fail(409, 'This entry is already rejected or declined.');
  await V.note(req, 'service.reject', 'ServiceLog', l._id, { was: l.status }); res.json({ ok: true });
});
exports.summary = wrap('summary', async (req, res) => {
  const schoolId = sid(req); const ls = await ServiceLog.find({ schoolId, status: 'Verified' }).limit(50000); const by = new Map();
  for (const l of ls) { const t = by.get(String(l.studentId)) || { studentId: l.studentId, studentName: l.studentName, hours: 0, entries: 0 }; t.hours += l.verifiedHours; t.entries++; by.set(String(l.studentId), t); }
  const pending = await ServiceLog.countDocuments({ schoolId, status: 'Pending' });
  res.json({ pending, students: [...by.values()].map((t) => ({ ...t, hours: money(t.hours) })).sort((a, b) => b.hours - a.hours), totalHours: money(ls.reduce((s, l) => s + l.verifiedHours, 0)) });
});
exports.myLogs = wrap('myLogs', async (req, res) => { const ls = await ServiceLog.find({ schoolId: sid(req), studentId: oid(req.user.userId) }).sort({ createdAt: -1 }).limit(200); res.json({ logs: ls.map(sView), verifiedHours: money(ls.filter((l) => l.status === 'Verified').reduce((s, l) => s + l.verifiedHours, 0)) }); });
exports.addMyLog = wrap('addMyLog', async (req, res) => { const st = await Student.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('name'); if (!st) throw new Fail(404, 'Student not found.'); res.status(201).json(await logService(req, st, req.body || {})); });
exports.newLogLink = wrap('newLogLink', async (req, res) => {
  const q = { _id: toId(req.params.id, 'The entry'), schoolId: sid(req), status: 'Pending' }; if (req.user.role === 'student') q.studentId = oid(req.user.userId); else if (!(req.user.role === 'admin' || (await V.can(req.user, 'quality.lead')).allowed)) throw new Fail(403, 'You cannot use this.');
  const l = await ServiceLog.findOne(q); if (!l) throw new Fail(404, 'No waiting entry found.'); const k = V.link('sv'); await ServiceLog.updateOne({ _id: l._id }, { $set: { linkHash: k.hash, linkPrefix: k.prefix } }); res.json({ link: { token: k.token, path: `/service/${k.token}`, shownOnce: true } });
});
const findLog = async (token) => { const p = V.parse(token); if (!p) return null; const rows = await ServiceLog.find({ linkPrefix: p.prefix, status: 'Pending' }).limit(5); return rows.find((r) => V.same(r.linkHash, p.hash)) || null; };
exports.pubLog = wrap('pubLog', async (req, res) => {
  const l = await findLog(req.params.token); if (!l) return bad(res, 404, 'This link is not valid any more.'); const school = await School.findOne({ _id: l.schoolId }).select('name');
  res.json({ school: school?.name || '', student: String(l.studentName || '').split(' ')[0], activity: l.activity, orgName: l.orgName, hours: l.hours, date: l.date, supervisorName: l.supervisorName });
});
exports.pubConfirm = wrap('pubConfirm', async (req, res) => {
  const l = await findLog(req.params.token); if (!l) return bad(res, 404, 'This link is not valid any more.');
  const decision = String(req.body?.decision || ''); if (!['confirm', 'decline'].includes(decision)) throw new Fail(422, 'Choose confirm or decline.'); const statement = txt(req.body?.statement, 300); if (statement.length < 5) throw new Fail(422, 'Write a line to say what you saw.');
  let hours = l.hours; if (decision === 'confirm' && req.body?.hours !== undefined) { hours = Number(req.body.hours); if (!(hours >= 0.5 && hours <= l.hours) || (hours * 2) % 1 !== 0) throw new Fail(422, `Give hours between 0.5 and ${l.hours}, in halves.`); }
  const r = await ServiceLog.updateOne({ _id: l._id, status: 'Pending' }, { $set: { status: decision === 'confirm' ? 'Verified' : 'Declined', verifiedHours: decision === 'confirm' ? hours : 0, verifiedAt: new Date(), verifierStatement: statement, linkHash: '', linkPrefix: '' } }); if (!r.matchedCount) return bad(res, 409, 'This was already answered.');
  await V.note(null, `service.${decision}`, 'ServiceLog', l._id, {}, l.schoolId); res.json({ ok: true, note: 'Thank you. The link no longer works.' });
});

/* ───────────────────────── annual report ───────────────────────── */
async function figures(schoolId, year) {
  const from = new Date(Date.UTC(year, 0, 1)); const to = new Date(Date.UTC(year + 1, 0, 1)); const min = await V.minCell(schoolId); const m = [];
  const add = (key, label, value, unit, source) => m.push({ key, label, value, unit, source });
  add('students', 'Students enrolled', await Student.countDocuments({ schoolId, isActive: { $ne: false } }), 'students', 'Student records, counted now');
  add('staff', 'Teaching staff', await Teacher.countDocuments({ schoolId }), 'teachers', 'Teacher records, counted now');
  add('classes', 'Classes', await Class.countDocuments({ schoolId }), 'classes', 'Class records, counted now');
  const total = await Attendance.countDocuments({ schoolId, date: { $gte: from, $lt: to } });
  if (total) { const here = await Attendance.countDocuments({ schoolId, date: { $gte: from, $lt: to }, status: { $in: ['Present', 'Late'] } }); add('attendance', 'Attendance', Math.round((here / total) * 1000) / 10, '%', `${total.toLocaleString('en-US')} attendance marks in ${year}`); }
  const pays = await FeePayment.find({ schoolId, status: 'Confirmed', createdAt: { $gte: from, $lt: to } }).select('amount').limit(200000); if (pays.length) add('fees', 'Fees collected', money(pays.reduce((s, p) => s + p.amount, 0)), 'PKR', `${pays.length.toLocaleString('en-US')} confirmed payments in ${year}`);
  const alumni = await AlumniProfile.countDocuments({ schoolId, state: 'Active' }); add('alumni', 'Graduates in touch', alumni >= min ? alumni : null, 'people', alumni >= min ? 'Graduates who joined with their own link' : `Hidden: fewer than ${min}`);
  const gifts = await DonorGift.find({ schoolId, receivedOn: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).select('amount').limit(100000); if (gifts.length) add('giving', 'Gifts received (net of reversals)', money(gifts.reduce((s, g) => s + g.amount, 0)), 'PKR', 'Gift records');
  const sv = await ServiceLog.find({ schoolId, status: 'Verified', date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).select('verifiedHours').limit(50000); if (sv.length) add('service', 'Community service hours confirmed by supervisors', money(sv.reduce((s, l) => s + l.verifiedHours, 0)), 'hours', 'Service hours that a supervisor confirmed');
  const ss = await AccStandard.find({ schoolId, retired: false }).select('_id').limit(1000); if (ss.length) { const today = V.day(); const ev = await AccEvidence.find({ schoolId, status: 'Accepted' }).select('standardId validUntil').limit(20000); const met = new Set(ev.filter((e) => !e.validUntil || e.validUntil >= today).map((e) => String(e.standardId))); add('standards', 'Accreditation standards with accepted, current evidence', Math.round((ss.filter((s) => met.has(String(s._id))).length / ss.length) * 100), '%', `${ss.length} standards`); }
  const closed = await AuditFinding.countDocuments({ schoolId, status: 'Closed' }); const openF = await AuditFinding.countDocuments({ schoolId, status: { $ne: 'Closed' } }); if (closed + openF) add('findings', 'Audit findings closed', closed, `of ${closed + openF}`, 'Audit finding records');
  return m;
}
const hashOf = (r) => crypto.createHash('sha256').update(JSON.stringify({ title: r.title, year: r.year, metrics: r.metrics, stories: (r.stories || []).filter((s) => s.approved).map((s) => ({ title: s.title, text: s.text })) })).digest('hex');
const rView = (r) => ({ id: r._id, title: r.title, year: r.year, status: r.status, metrics: r.metrics, stories: r.stories, hash: r.hash, code: r.status === 'Published' ? r.code : '', askedByName: r.askedByName, approvedByName: r.approvedByName, approvedAt: r.approvedAt, publishedAt: r.publishedAt, soleAdmin: r.soleAdmin });
exports.reports = wrap('reports', async (req, res) => res.json({ reports: (await AnnualReport.find({ schoolId: sid(req) }).sort({ year: -1 }).limit(50)).map((r) => ({ id: r._id, title: r.title, year: r.year, status: r.status, approvedAt: r.approvedAt, hash: r.hash })) }));
exports.report = wrap('report', async (req, res) => { const r = await AnnualReport.findOne({ _id: toId(req.params.id, 'The report'), schoolId: sid(req) }); if (!r) throw new Fail(404, 'Report not found.'); res.json({ report: rView(r) }); });
exports.addReport = wrap('addReport', async (req, res) => {
  const schoolId = sid(req); const year = Number(req.body?.year); if (!Number.isInteger(year) || year < 2000 || year > new Date().getUTCFullYear() + 1) throw new Fail(422, 'Give a valid year.');
  const title = txt(req.body?.title, 140) || `Annual report ${year}`; const r = await AnnualReport.create({ schoolId, title, year, status: 'Draft', metrics: await figures(schoolId, year), askedById: oid(req.user.userId), askedByName: nameOf(req), createdByName: nameOf(req) });
  await V.note(req, 'report.add', 'AnnualReport', r._id, { year }); res.status(201).json({ report: rView(r) });
});
const draftOnly = async (req) => { const r = await AnnualReport.findOne({ _id: toId(req.params.id, 'The report'), schoolId: sid(req) }); if (!r) throw new Fail(404, 'Report not found.'); if (r.status !== 'Draft') throw new Fail(409, 'An approved report cannot be changed. Start a new one for corrections.'); return r; };
exports.refresh = wrap('refresh', async (req, res) => { const r = await draftOnly(req); await AnnualReport.updateOne({ _id: r._id, status: 'Draft' }, { $set: { metrics: await figures(sid(req), r.year) } }); res.json({ report: rView(await AnnualReport.findOne({ _id: r._id })) }); });
// A story only goes in if the people in it agreed. The consent line says who and how; naming a child needs the parent's agreement.
exports.addStory = wrap('addStory', async (req, res) => {
  const r = await draftOnly(req); const b = req.body || {}; const title = txt(b.title, 140); const text = txt(b.text, 3000); if (title.length < 3 || text.length < 30) throw new Fail(422, 'Give the story a title and write it out.');
  if (!b.consentConfirmed) throw new Fail(422, 'Confirm that everyone named or shown in the story agreed to it being published.'); const how = txt(b.consentNote, 200); if (how.length < 10) throw new Fail(422, 'Write who agreed and how (for a child, the parent).');
  if (r.stories.length >= 30) throw new Fail(409, 'That is enough stories for one report.');
  const story = { id: `s-${crypto.randomBytes(3).toString('hex')}`, title, text, consent: { confirmed: true, note: how, byName: nameOf(req) }, approved: false };
  await AnnualReport.updateOne({ _id: r._id, status: 'Draft' }, { $set: { stories: [...r.stories, story] } }); res.status(201).json({ story });
});
exports.removeStory = wrap('removeStory', async (req, res) => { const r = await draftOnly(req); await AnnualReport.updateOne({ _id: r._id, status: 'Draft' }, { $set: { stories: r.stories.filter((s) => s.id !== req.params.storyId) } }); res.json({ ok: true }); });
exports.approveReport = wrap('approveReport', async (req, res) => {
  const r = await draftOnly(req); if (!r.metrics.length) throw new Fail(422, 'Refresh the figures first.');
  const sole = await S.separate(ctxOf(req), r.askedById, 'An annual report'); const stories = r.stories.map((s) => ({ ...s, approved: true, approvedByName: nameOf(req) }));
  const frozen = { ...r.toObject(), stories }; const hash = hashOf(frozen);
  const k = await AnnualReport.updateOne({ _id: r._id, status: 'Draft' }, { $set: { status: 'Approved', stories, hash, code: crypto.randomBytes(6).toString('hex'), approvedById: oid(req.user.userId), approvedByName: nameOf(req), approvedAt: new Date(), soleAdmin: sole } }); if (!k.matchedCount) throw new Fail(409, 'Someone else already approved this.');
  await V.note(req, 'report.approve', 'AnnualReport', r._id, { hash, soleAdmin: sole }); res.json({ ok: true, hash, soleAdmin: sole });
});
exports.publishReport = wrap('publishReport', async (req, res) => {
  const r = await AnnualReport.findOne({ _id: toId(req.params.id, 'The report'), schoolId: sid(req) }); if (!r) throw new Fail(404, 'Report not found.'); if (r.status !== 'Approved') throw new Fail(409, r.status === 'Published' ? 'Already published.' : 'Approve the report first.');
  if (hashOf(r.toObject()) !== r.hash) throw new Fail(409, 'The report no longer matches what was approved.');
  const k = await AnnualReport.updateOne({ _id: r._id, status: 'Approved' }, { $set: { status: 'Published', publishedAt: new Date() } }); if (!k.matchedCount) throw new Fail(409, 'Someone else changed this report.');
  await V.note(req, 'report.publish', 'AnnualReport', r._id, {}); res.json({ ok: true, code: r.code });
});
exports.reportPdf = wrap('reportPdf', async (req, res) => {
  const r = await AnnualReport.findOne({ _id: toId(req.params.id, 'The report'), schoolId: sid(req) }); if (!r) throw new Fail(404, 'Report not found.'); if (r.status === 'Draft') throw new Fail(409, 'The PDF is made from an approved report.');
  const school = await School.findOne({ _id: sid(req) }).select('name'); const buf = await require('../utils/advancement/pdf').render(r, { school: school?.name || '' });
  res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', `attachment; filename="annual-report-${r.year}.pdf"`); res.send(buf);
});
exports.pubReport = wrap('pubReport', async (req, res) => {
  const r = await AnnualReport.findOne({ code: String(req.params.code || '').slice(0, 30) }); if (!r || r.status !== 'Published') return bad(res, 404, 'This report is not published.');
  const school = await School.findOne({ _id: r.schoolId }).select('name'); res.json({ school: school?.name || '', report: { title: r.title, year: r.year, metrics: r.metrics.filter((x) => x.value !== null), stories: r.stories.filter((s) => s.approved).map((s) => ({ title: s.title, text: s.text })), hash: r.hash, approvedAt: r.approvedAt } });
});

/* ───────────────────────── overview and sweep ───────────────────────── */
exports.overview = wrap('overview', async (req, res) => {
  const schoolId = sid(req); const today = V.day();
  const [cycles, findings, waiting, logs, reports] = await Promise.all([QaCycle.find({ schoolId, retired: false }).select('nextDueOn'), AuditFinding.find({ schoolId, status: { $ne: 'Closed' } }).select('dueOn'), AccEvidence.countDocuments({ schoolId, status: 'Submitted' }), ServiceLog.countDocuments({ schoolId, status: 'Pending' }), AnnualReport.countDocuments({ schoolId, status: 'Draft' })]);
  res.json({ cyclesOverdue: cycles.filter((c) => c.nextDueOn < today).length, findingsOpen: findings.length, findingsOverdue: findings.filter((f) => f.dueOn && f.dueOn < today).length, evidenceWaiting: waiting, serviceWaiting: logs, reportDrafts: reports });
});
exports.sweepSchool = async (schoolId) => {
  const out = { expired: 0, cyclesReminded: 0, findingsOverdue: 0 }; const today = V.day();
  for (const e of await AccEvidence.find({ schoolId, status: 'Accepted', validUntil: { $lt: today, $ne: '' } }).limit(2000)) { const r = await AccEvidence.updateOne({ _id: e._id, status: 'Accepted' }, { $set: { status: 'Expired', trail: [...(e.trail || []), { at: new Date(), byName: 'system', action: 'expired', note: '' }] } }); if (r.matchedCount) out.expired++; }
  const admins = await S.N.admins(schoolId);
  for (const c of await QaCycle.find({ schoolId, retired: false, nextDueOn: { $lte: V.addDays(today, 14) } }).limit(500)) {
    if (c.remindedOn === c.nextDueOn) continue; const to = c.ownerId ? [{ id: c.ownerId, role: 'teacher' }, ...admins] : admins;
    await tell(schoolId, to, c.nextDueOn < today ? 'A scheduled review is overdue' : 'A scheduled review is coming up', `${c.title}, due ${c.nextDueOn}`, '/admin?tab=quality', `qa-${c._id}-${c.nextDueOn}`); await QaCycle.updateOne({ _id: c._id }, { $set: { remindedOn: c.nextDueOn } }); out.cyclesReminded++;
  }
  for (const f of await AuditFinding.find({ schoolId, status: { $ne: 'Closed' }, dueOn: { $lt: today, $ne: '' } }).limit(500)) { await tell(schoolId, [{ id: f.ownerId, role: 'teacher' }, ...admins], 'An audit finding is overdue', `${f.no}: ${f.title}`, '/admin?tab=quality', `fnd-late-${f._id}-${f.dueOn}`); out.findingsOverdue++; }
  const stale = V.addDays(today, -90); await ServiceLog.updateMany({ schoolId, status: 'Pending', createdAt: { $lt: new Date(`${stale}T00:00:00Z`) } }, { $set: { status: 'Declined', linkHash: '', linkPrefix: '', verifierStatement: 'No answer from the supervisor in 90 days.' } });
  return out;
};

// the staff of this school, for choosing an owner or a board member
exports.people = wrap('people', async (req, res) => {
  const schoolId = sid(req); const User = require('../models/User'); const Teacher = require('../models/Teacher');
  const [a, t] = await Promise.all([User.find({ schoolId, role: 'admin', isActive: true }).select('name').limit(200), Teacher.find({ schoolId, isActive: true }).select('name').limit(500)]);
  res.json({ people: [...a.map((x) => ({ id: x._id, name: x.name, role: 'admin' })), ...t.map((x) => ({ id: x._id, name: x.name, role: 'teacher' }))].sort((m, n) => String(m.name).localeCompare(String(n.name))) });
});

// what the signed-in person may open here
exports.me = wrap('me', async (req, res) => {
  const adminAll = req.user.role === 'admin' ? !!(await V.wide(req.user)) : false; const has = async (k) => adminAll || (req.user.role === 'teacher' && !!(await V.can(req.user, k)).allowed);
  const [alumni, giving, quality, board] = await Promise.all([has('alumni.lead'), has('giving.officer'), has('quality.lead'), memberOf(req)]);
  res.json({ alumni, giving, quality, wide: adminAll, board: board ? { role: board.role, userName: board.userName } : null });
});
