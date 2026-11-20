// Student support cases, concerns and break-glass access (PRD E21: SupportCase, SupportAction, referral workflow, anonymous reporting, safeguarding controls).
//   A confidential case (safeguarding, bullying) is visible only to its circle and the safeguarding leads. Anyone else needs a two-person break-glass window for that one case.
//   Concerns from students, parents and staff land in one triage list; an anonymous concern stores no person, only a hash of the receipt code the reporter keeps.
const crypto = require('crypto');
const S = require('../utils/care/service');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const AppSetting = require('../models/AppSetting');
const Student = require('../models/Student');
const CareCase = require('../models/CareCase');
const CareNote = require('../models/CareNote');
const CareReport = require('../models/CareReport');
const CareAccess = require('../models/CareAccess');
const CareAccessLog = require('../models/CareAccessLog');

const { oid, sid, bad, wrap, clean, pg } = S;
const CATS = ['learning', 'behaviour', 'wellbeing', 'attendance', 'health', 'family', 'bullying', 'safeguarding', 'other'];
const LEVELS = ['watch', 'support', 'intensive'];
const rx = (q) => String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const person = (req) => ({ id: oid(req.user.userId), name: req.actorName || '' });
const ev = (req, kind, text) => ({ at: new Date(), kind, byId: oid(req.user.userId), byName: req.actorName || '', text: clean(text, 600) });

/* ───────── me, settings, overview ───────── */
exports.me = wrap('me', async (req, res) => {
  const c = await S.ctx(req);
  res.json({ role: c.role, work: !!c.work, dsl: !!c.dsl, health: !!c.health, counsel: !!c.counsel, privacy: !!c.privacy, staff: !!c.staff, teaches: [...c.classIds], via: c.via });
});
exports.getSettings = wrap('getSettings', async (req, res) => res.json({ settings: await S.getSettings(sid(req)), defaults: S.DEFAULTS }));
exports.putSettings = wrap('putSettings', async (req, res) => {
  const b = req.body || {}; const patch = {}; const num = (k, lo, hi) => { if (b[k] != null) { const v = Number(b[k]); if (!Number.isInteger(v) || v < lo || v > hi) throw Object.assign(new Error(`${k} must be a whole number from ${lo} to ${hi}.`), { code: 422 }); patch[k] = v; } };
  try {
    num('escalateHours', 1, 168); num('reportTriageHours', 1, 168); num('privacyDays', 7, 90); num('anonLimitPerDay', 1, 20); num('trainingMonths', 3, 36); num('breakGlassMinutes', 5, 60); num('accommodationReviewDays', 30, 365);
    if (b.reviewDays) { patch.reviewDays = {}; for (const l of LEVELS) if (b.reviewDays[l] != null) { const v = Number(b.reviewDays[l]); if (!Number.isInteger(v) || v < 1 || v > 120) throw Object.assign(new Error('Review days must be from 1 to 120.'), { code: 422 }); patch.reviewDays[l] = v; } }
  } catch (e) { if (e.code === 422) return bad(res, 422, e.message); throw e; }
  const settings = await S.saveSettings(sid(req), patch); await audit(req, { action: 'care.settings', entityType: 'CareSettings', schoolId: sid(req), detail: patch }); res.json({ settings });
});
exports.myStaffList = wrap('staffList', async (req, res) => res.json({ staff: await S.staffList(sid(req)) }));

exports.students = wrap('students', async (req, res) => {
  const c = await S.ctx(req); const q = clean(req.query.q, 60); if (q.length < 2) return res.json({ students: [] });
  const f = { schoolId: sid(req), isActive: { $ne: false }, name: { $regex: rx(q), $options: 'i' } };
  let rows = await Student.find(f).select('name classId studentId rollNumber').sort({ name: 1 }).limit(60);
  rows = rows.filter((s) => S.canTouch(c, s)).slice(0, 30);
  const names = new Map(); for (const s of rows) if (s.classId && !names.has(String(s.classId))) names.set(String(s.classId), await S.className(s.classId));
  res.json({ students: rows.map((s) => ({ _id: s._id, name: s.name, studentId: s.studentId, rollNumber: s.rollNumber, classId: s.classId, className: names.get(String(s.classId)) || '' })) });
});

async function visibleFilter(req) {
  const c = await S.ctx(req); const me = oid(req.user.userId); const or = [{ 'circle.id': me }, { leadId: me }, { openedById: me }];
  if (c.work) or.push({ confidential: false }); if (c.dsl) or.push({ confidential: true });
  return { schoolId: sid(req), $or: or };
}
exports.overview = wrap('overview', async (req, res) => {
  const c = await S.ctx(req); const s = sid(req); const day = await S.today(s); const vis = await visibleFilter(req); const out = { today: day, caps: { work: !!c.work, dsl: !!c.dsl, health: !!c.health, counsel: !!c.counsel, privacy: !!c.privacy } };
  const open = await CareCase.find({ ...vis, status: { $ne: 'Closed' } }).select('status level category reviewOn leadId actions confidential');
  out.cases = { open: open.length, intensive: open.filter((k) => k.level === 'intensive').length, unassigned: open.filter((k) => !k.leadId).length, reviewDue: open.filter((k) => k.reviewOn && k.reviewOn <= day).length, openActions: open.reduce((n, k) => n + (k.actions || []).filter((a) => a.status === 'Open').length, 0), confidential: open.filter((k) => k.confidential).length };
  const rf = c.dsl ? { schoolId: s } : c.work ? { schoolId: s, category: { $nin: ['bullying', 'safety'] } } : null;
  out.reports = rf ? { new: await CareReport.countDocuments({ ...rf, status: 'New' }) } : null;
  if (c.dsl) out.access = { pending: await CareAccess.countDocuments({ schoolId: s, status: 'Pending' }) };
  res.json(out);
});

/* ───────── cases ───────── */
exports.listCases = wrap('listCases', async (req, res) => {
  const { p, l } = pg(req.query); const f = await visibleFilter(req); const q = req.query; const and = [];
  if (q.status === 'open') f.status = { $ne: 'Closed' }; else if (['Open', 'Active', 'Review', 'Closed'].includes(q.status)) f.status = q.status;
  if (CATS.includes(q.category)) f.category = q.category; if (LEVELS.includes(q.level)) f.level = q.level;
  if (oid(q.studentId)) f.studentId = oid(q.studentId);
  if (q.mine === '1') f.$and = [{ $or: [{ leadId: oid(req.user.userId) }, { 'circle.id': oid(req.user.userId) }] }];
  if (clean(q.q, 60).length >= 2) f.studentName = { $regex: rx(clean(q.q, 60)), $options: 'i' };
  const [rows, total] = await Promise.all([CareCase.find(f).select('number studentId studentName classId category level status confidential title leadId leadName reviewOn lastAt createdAt actions closeRequest').sort({ lastAt: -1 }).skip((p - 1) * l).limit(l), CareCase.countDocuments(f)]);
  res.json({ cases: rows.map(S.summary), total, page: p });
});

async function loadCase(req, res, id, { write = false } = {}) {
  const k = await CareCase.findOne({ _id: oid(id), schoolId: sid(req) });
  if (!k) { bad(res, 404, 'Case not found.'); return null; }
  const a = await S.caseAccess(req, k);
  if (!a.ok) { if (a.needsBreakGlass) bad(res, 403, 'This case is confidential. Ask a safeguarding lead, or request emergency access.', { code: 'break-glass', caseId: k._id, number: k.number }); else bad(res, 404, 'Case not found.'); return null; }
  if (write && a.via === 'break-glass') { bad(res, 403, 'Emergency access lets you read this case, not change it.'); return null; }
  const c = await S.ctx(req);
  if (write && !(c.work || c.dsl || S.inCircle(c, k))) { bad(res, 403, 'You are not part of this case.'); return null; }
  return { k, a, c };
}
exports.openCase = wrap('openCase', async (req, res) => {
  const c = await S.ctx(req); if (!(c.work || c.dsl)) return bad(res, 403, 'You cannot open support cases. Raise a concern instead.');
  const b = req.body || {}; const st = await S.studentOf(req, b.studentId); if (!st) return bad(res, 404, 'Student not found.');
  if (!CATS.includes(b.category)) return bad(res, 422, 'Choose a category.'); const level = LEVELS.includes(b.level) ? b.level : 'support';
  if (S.isConfidential(b.category) && !c.dsl) return bad(res, 403, 'Only a safeguarding lead can open a safeguarding or bullying case.');
  const title = clean(b.title, 140); if (title.length < 4) return bad(res, 422, 'Give the case a short title.');
  const s = sid(req); const set = await S.getSettings(s); const day = await S.today(s);
  const circle = []; const seen = new Set();
  for (const pid of Array.isArray(b.circle) ? b.circle.slice(0, 12) : []) { const x = await S.person(s, pid); if (x && !seen.has(String(x.id))) { seen.add(String(x.id)); circle.push(x); } }
  let lead = null; if (b.leadId) { lead = await S.person(s, b.leadId); if (!lead) return bad(res, 422, 'That lead is not on staff.'); if (!seen.has(String(lead.id))) circle.push(lead); }
  if (S.isConfidential(b.category) || b.confidential === true) for (const x of circle) if (!(await S.trainingOk(s, x, day))) return bad(res, 422, `${x.name} needs current safeguarding training before joining a confidential case.`);
  const k = await CareCase.create({
    schoolId: s, number: await S.nextNumber(s, 'CC'), studentId: st._id, studentName: st.name, classId: st.classId || null, category: b.category, level,
    confidential: S.isConfidential(b.category) || b.confidential === true, title, summary: clean(b.summary, 2000), leadId: lead ? lead.id : null, leadModel: lead ? lead.model : 'Teacher', leadName: lead ? lead.name : '',
    circle, openedById: oid(req.user.userId), openedByName: req.actorName || '', openedByRole: req.user.role, fromReportId: oid(b.fromReportId),
    reviewOn: S.addDays(day, set.reviewDays[level]), events: [ev(req, 'opened', `Case opened (${b.category}, ${level}).`)],
  });
  await audit(req, { action: 'care.case.open', entityType: 'CareCase', entityId: k._id, schoolId: s, detail: { number: k.number, category: k.category, confidential: k.confidential } });
  const tell = lead && String(lead.id) !== req.user.userId ? [{ id: lead.id, role: lead.model === 'User' ? 'admin' : 'teacher' }] : [];
  if (tell.length) await N.notify({ schoolId: s, recipients: tell, title: 'You lead a new support case', body: k.confidential ? `${k.number} — confidential. Open it in Student care.` : `${k.number}: ${k.title}`, type: 'care', link: '#/care', key: `care-case:${k._id}` });
  if (k.confidential) { const others = (await S.holders(s, 'care.safeguarding.lead', req.user.userId)).filter((h) => !tell.some((t) => String(t.id) === String(h.id))); if (others.length) await N.notify({ schoolId: s, recipients: others, title: 'A confidential case was opened', body: `${k.number}. Details are in Student care.`, type: 'care', link: '#/care', key: `care-conf:${k._id}` }); }
  res.status(201).json({ case: S.summary(k), _id: k._id });
});
exports.getCase = wrap('getCase', async (req, res) => {
  const r = await loadCase(req, res, req.params.id); if (!r) return; const { k, a, c } = r;
  if (k.confidential || a.via === 'break-glass') await S.logRead(req, 'case', k._id, k.studentId, a.via);
  const notes = (await CareNote.find({ schoolId: sid(req), caseId: k._id }).sort({ createdAt: -1 }).limit(200)).filter((n) => n.visibility === 'circle' || String(n.authorId) === c.userId);
  const st = await Student.findById(k.studentId).select('name classId studentId'); const guard = { canWrite: a.via !== 'break-glass' && (c.work || c.dsl || S.inCircle(c, k)), via: a.via };
  const o = k.toObject(); res.json({ case: o, notes, student: st ? { _id: st._id, name: st.name, studentId: st.studentId, className: await S.className(st.classId) } : null, access: guard, canApproveClose: c.dsl && String(o.closeRequest && o.closeRequest.by || '') !== c.userId });
});
exports.updateCase = wrap('updateCase', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k } = r; const b = req.body || {}; const s = sid(req); const set = {}; const notes = [];
  if (k.status === 'Closed') return bad(res, 409, 'This case is closed. Reopen it to change it.');
  if (b.title != null) { const t = clean(b.title, 140); if (t.length < 4) return bad(res, 422, 'Give the case a short title.'); set.title = t; }
  if (b.summary != null) set.summary = clean(b.summary, 2000);
  if (b.level != null) { if (!LEVELS.includes(b.level)) return bad(res, 422, 'Unknown level.'); if (b.level !== k.level) { set.level = b.level; notes.push(`Level changed to ${b.level}.`); } }
  if (b.reviewOn != null) { if (!S.isDay(b.reviewOn)) return bad(res, 422, 'Review date must look like 2026-03-31.'); set.reviewOn = b.reviewOn; }
  if (b.leadId !== undefined) {
    if (!b.leadId) { set.leadId = null; set.leadName = ''; notes.push('Lead removed.'); } else {
      const lead = await S.person(s, b.leadId); if (!lead) return bad(res, 422, 'That lead is not on staff.');
      if (k.confidential && !(await S.trainingOk(s, lead, await S.today(s)))) return bad(res, 422, `${lead.name} needs current safeguarding training before leading a confidential case.`);
      set.leadId = lead.id; set.leadModel = lead.model; set.leadName = lead.name; notes.push(`Lead is now ${lead.name}.`);
      if (!(k.circle || []).some((p) => String(p.id) === String(lead.id))) await CareCase.updateOne({ _id: k._id, schoolId: s }, { $push: { circle: lead } });
      if (String(lead.id) !== req.user.userId) await N.notify({ schoolId: s, recipients: [{ id: lead.id, role: lead.model === 'User' ? 'admin' : 'teacher' }], title: 'You lead a support case', body: k.confidential ? `${k.number} — confidential.` : `${k.number}: ${k.title}`, type: 'care', link: '#/care', key: `care-case:${k._id}` });
    }
  }
  if (!Object.keys(set).length) return bad(res, 422, 'Nothing to change.');
  await CareCase.updateOne({ _id: k._id, schoolId: s }, { $set: { ...set, lastAt: new Date() }, ...(notes.length ? { $push: { events: { $each: notes.map((t) => ev(req, 'update', t)) } } } : {}) });
  await audit(req, { action: 'care.case.update', entityType: 'CareCase', entityId: k._id, schoolId: s, detail: { number: k.number, fields: Object.keys(set) } });
  res.json({ ok: true });
});
exports.setStatus = wrap('setStatus', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k } = r; const to = String((req.body || {}).status || '');
  if (!['Active', 'Review'].includes(to)) return bad(res, 422, 'Use Active or Review. Closing goes through the close steps.');
  if (k.status === 'Closed') return bad(res, 409, 'This case is closed.'); if (to === 'Active' && !k.leadId) return bad(res, 422, 'Name a lead before the case becomes active.');
  const set = await S.getSettings(sid(req)); const day = await S.today(sid(req));
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $set: { status: to, lastAt: new Date(), ...(to === 'Active' ? { reviewOn: S.addDays(day, set.reviewDays[k.level]) } : {}) }, $push: { events: ev(req, 'status', `Status: ${to}.`) } });
  res.json({ ok: true, status: to });
});
exports.addNote = wrap('addNote', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k, c } = r; const b = req.body || {};
  const body = clean(b.body, 4000); if (body.length < 3) return bad(res, 422, 'Write the note first.');
  const kind = ['note', 'counselling', 'meeting', 'contact'].includes(b.kind) ? b.kind : 'note'; const vis = b.visibility === 'author' ? 'author' : 'circle';
  if (vis === 'author' && !c.counsel) return bad(res, 403, 'Only a counsellor can keep a private session note.');
  const n = await CareNote.create({ schoolId: sid(req), caseId: k._id, studentId: k.studentId, kind, visibility: vis, authorId: oid(req.user.userId), authorName: req.actorName || '', body });
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $set: { lastAt: new Date() }, $push: { events: ev(req, kind, vis === 'author' ? 'Private session note added.' : `${kind[0].toUpperCase()}${kind.slice(1)} note added.`) } });
  res.status(201).json({ note: n });
});
exports.addAction = wrap('addAction', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k } = r; const b = req.body || {}; const text = clean(b.text, 300); if (text.length < 3) return bad(res, 422, 'Describe the action.');
  if (k.status === 'Closed') return bad(res, 409, 'This case is closed.');
  let owner = null; if (b.ownerId) { owner = await S.person(sid(req), b.ownerId); if (!owner) return bad(res, 422, 'That owner is not on staff.'); }
  if (b.dueAt && !S.isDay(b.dueAt)) return bad(res, 422, 'Due date must look like 2026-03-31.');
  const a = { text, ownerId: owner ? owner.id : null, ownerName: owner ? owner.name : '', dueAt: b.dueAt ? new Date(`${b.dueAt}T00:00:00Z`) : null, status: 'Open' };
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $push: { actions: a, events: ev(req, 'action', `Action added: ${text.slice(0, 80)}`) }, $set: { lastAt: new Date() } });
  if (owner && String(owner.id) !== req.user.userId) await N.notify({ schoolId: sid(req), recipients: [{ id: owner.id, role: owner.model === 'User' ? 'admin' : 'teacher' }], title: 'A support action is yours', body: k.confidential ? `${k.number} — confidential.` : `${k.number}: ${text.slice(0, 100)}`, type: 'care', link: '#/care', key: `care-act:${k._id}:${text.length}` });
  res.status(201).json({ ok: true });
});
exports.setAction = wrap('setAction', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k } = r; const b = req.body || {}; const to = String(b.status || '');
  if (!['Done', 'Dropped', 'Open'].includes(to)) return bad(res, 422, 'Use Done, Dropped or Open.');
  const i = (k.actions || []).findIndex((x) => String(x._id) === String(req.params.aid)); if (i < 0) return bad(res, 404, 'Action not found.'); const a = k.actions[i];
  const u = await CareCase.updateOne({ _id: k._id, schoolId: sid(req), 'actions._id': a._id }, { $set: { [`actions.${i}.status`]: to, [`actions.${i}.doneAt`]: to === 'Open' ? null : new Date(), [`actions.${i}.outcome`]: clean(b.outcome, 300), lastAt: new Date() }, $push: { events: ev(req, 'action', `Action ${to.toLowerCase()}: ${a.text.slice(0, 80)}`) } });
  res.json({ ok: u.matchedCount > 0 });
});
exports.addReferral = wrap('addReferral', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k } = r; const b = req.body || {}; const to = clean(b.to, 120); if (to.length < 3) return bad(res, 422, 'Say who the referral is to.');
  const ref = { to, reason: clean(b.reason, 500), reference: clean(b.reference, 80), status: 'Made', byName: req.actorName || '', byId: oid(req.user.userId) };
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $push: { referrals: ref, events: ev(req, 'referral', `Referred to ${to}.`) }, $set: { lastAt: new Date() } });
  await audit(req, { action: 'care.case.refer', entityType: 'CareCase', entityId: k._id, schoolId: sid(req), detail: { number: k.number, to } }); res.status(201).json({ ok: true });
});
exports.setReferral = wrap('setReferral', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k } = r; const to = String((req.body || {}).status || '');
  if (!['Made', 'Accepted', 'Closed', 'Declined'].includes(to)) return bad(res, 422, 'Unknown referral status.');
  const i = (k.referrals || []).findIndex((x) => String(x._id) === String(req.params.rid)); if (i < 0) return bad(res, 404, 'Referral not found.'); const f = k.referrals[i];
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req), 'referrals._id': f._id }, { $set: { [`referrals.${i}.status`]: to, lastAt: new Date() }, $push: { events: ev(req, 'referral', `Referral to ${f.to}: ${to}.`) } }); res.json({ ok: true });
});
exports.addCircle = wrap('addCircle', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k, c } = r;
  if (!(c.work || c.dsl || String(k.leadId || '') === c.userId)) return bad(res, 403, 'Only the lead or a coordinator can change who sees this case.');
  const x = await S.person(sid(req), (req.body || {}).personId); if (!x) return bad(res, 404, 'Staff member not found.');
  if ((k.circle || []).some((p) => String(p.id) === String(x.id))) return bad(res, 409, 'Already in this case.');
  if (k.confidential && !(await S.trainingOk(sid(req), x, await S.today(sid(req))))) return bad(res, 422, `${x.name} needs current safeguarding training before joining a confidential case.`);
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $push: { circle: x, events: ev(req, 'circle', `${x.name} added to the case.`) } });
  await audit(req, { action: 'care.case.circle.add', entityType: 'CareCase', entityId: k._id, schoolId: sid(req), detail: { number: k.number, person: x.name } });
  if (String(x.id) !== req.user.userId) await N.notify({ schoolId: sid(req), recipients: [{ id: x.id, role: x.model === 'User' ? 'admin' : 'teacher' }], title: 'You were added to a support case', body: k.confidential ? `${k.number} — confidential.` : `${k.number}: ${k.title}`, type: 'care', link: '#/care', key: `care-circle:${k._id}:${x.id}` });
  res.status(201).json({ ok: true });
});
exports.removeCircle = wrap('removeCircle', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k, c } = r;
  if (!(c.work || c.dsl || String(k.leadId || '') === c.userId)) return bad(res, 403, 'Only the lead or a coordinator can change who sees this case.');
  if (String(k.leadId || '') === String(req.params.pid)) return bad(res, 422, 'Change the lead before removing them.');
  const p = (k.circle || []).find((x) => String(x.id) === String(req.params.pid)); if (!p) return bad(res, 404, 'Not in this case.');
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $pull: { circle: { id: p.id } }, $push: { events: ev(req, 'circle', `${p.name} removed from the case.`) } }); res.json({ ok: true });
});

// Closing: an ordinary case closes with an outcome. A confidential case needs a second safeguarding lead (or is recorded as closed by the only lead).
exports.closeCase = wrap('closeCase', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k, c } = r; const s = sid(req);
  if (k.status === 'Closed') return bad(res, 409, 'Already closed.'); const outcome = clean((req.body || {}).outcome, 1000);
  if (outcome.length < (k.confidential ? 20 : 10)) return bad(res, 422, k.confidential ? 'Write the outcome in at least 20 characters.' : 'Write the outcome in at least 10 characters.');
  if (!(c.work || c.dsl || String(k.leadId || '') === c.userId)) return bad(res, 403, 'Only the lead or a coordinator can close a case.');
  if ((k.actions || []).some((a) => a.status === 'Open')) return bad(res, 422, 'Finish or drop the open actions first.');
  if (!k.confidential) { await finish(req, k, outcome, 'lead'); return res.json({ ok: true, closed: true }); }
  if (!c.dsl) return bad(res, 403, 'A safeguarding lead must close a confidential case.');
  const others = await S.otherApprovers(s, 'care.safeguarding.lead', req.user.userId);
  if (!others.length) { await finish(req, k, outcome, 'sole safeguarding lead (recorded)'); return res.json({ ok: true, closed: true, sole: true }); }
  await CareCase.updateOne({ _id: k._id, schoolId: s }, { $set: { closeRequest: { by: oid(req.user.userId), byName: req.actorName || '', outcome, at: new Date() } }, $push: { events: ev(req, 'close-request', 'Closure proposed; waiting for a second safeguarding lead.') } });
  await N.notify({ schoolId: s, recipients: (await S.holders(s, 'care.safeguarding.lead', req.user.userId)), title: 'A confidential case needs a second sign-off to close', body: k.number, type: 'care', link: '#/care', key: `care-close:${k._id}` });
  res.json({ ok: true, closed: false, needsApproval: true });
});
async function finish(req, k, outcome, approvedBy) {
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $set: { status: 'Closed', closedAt: new Date(), closedByName: req.actorName || '', outcome, closeApprovedBy: approvedBy, closeRequest: null, lastAt: new Date() }, $push: { events: ev(req, 'closed', `Closed. ${outcome.slice(0, 120)}`) } });
  await audit(req, { action: 'care.case.close', entityType: 'CareCase', entityId: k._id, schoolId: sid(req), detail: { number: k.number, approvedBy } });
}
exports.approveClose = wrap('approveClose', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k, c } = r;
  if (!c.dsl) return bad(res, 403, 'Only a safeguarding lead can sign off a closure.');
  if (!k.closeRequest || !k.closeRequest.at) return bad(res, 409, 'No closure is waiting.');
  if (String(k.closeRequest.by) === c.userId) return bad(res, 403, 'A different safeguarding lead must sign off.');
  const approve = (req.body || {}).approve !== false;
  if (!approve) { await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $set: { closeRequest: null, lastAt: new Date() }, $push: { events: ev(req, 'close-rejected', `Closure not approved. ${clean((req.body || {}).note, 200)}`) } }); return res.json({ ok: true, closed: false }); }
  await finish(req, k, k.closeRequest.outcome, `${req.actorName || 'second lead'} (second sign-off)`); res.json({ ok: true, closed: true });
});
exports.reopenCase = wrap('reopenCase', async (req, res) => {
  const r = await loadCase(req, res, req.params.id, { write: true }); if (!r) return; const { k, c } = r; if (k.status !== 'Closed') return bad(res, 409, 'The case is not closed.');
  if (!(c.work || c.dsl)) return bad(res, 403, 'Only a coordinator can reopen a case.'); const set = await S.getSettings(sid(req)); const day = await S.today(sid(req));
  await CareCase.updateOne({ _id: k._id, schoolId: sid(req) }, { $set: { status: 'Active', closedAt: null, outcome: '', closeApprovedBy: '', reviewOn: S.addDays(day, set.reviewDays[k.level]), lastAt: new Date() }, $push: { events: ev(req, 'reopened', clean((req.body || {}).reason, 200) || 'Reopened.') } });
  await audit(req, { action: 'care.case.reopen', entityType: 'CareCase', entityId: k._id, schoolId: sid(req), detail: { number: k.number } }); res.json({ ok: true });
});

/* ───────── break-glass ───────── */
exports.requestAccess = wrap('requestAccess', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.');
  const k = await CareCase.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!k || !k.confidential) return bad(res, 404, 'Case not found.');
  const a = await S.caseAccess(req, k); if (a.ok) return bad(res, 409, 'You can already open this case.');
  const b = req.body || {}; const reason = clean(b.reason, 500); if (reason.length < 15) return bad(res, 422, 'Say why you need to see this case (at least 15 characters).');
  const set = await S.getSettings(sid(req)); let minutes = Number(b.minutes) || set.breakGlassMinutes; if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) return bad(res, 422, 'Choose 5 to 60 minutes.');
  if (await CareAccess.findOne({ schoolId: sid(req), caseId: k._id, requestedById: oid(req.user.userId), status: 'Pending' })) return bad(res, 409, 'You already have a request waiting.');
  const others = await S.otherApprovers(sid(req), 'care.safeguarding.lead', req.user.userId); const now = new Date();
  const doc = await CareAccess.create({ schoolId: sid(req), caseId: k._id, caseNumber: k.number, requestedById: oid(req.user.userId), requestedByRole: req.user.role, requestedByName: req.actorName || '', reason, minutes, status: others.length ? 'Pending' : 'Approved',
    ...(others.length ? {} : { soleApprover: true, decidedAt: now, decidedByName: 'No second lead available (recorded)', validFrom: now, validTo: new Date(now.getTime() + minutes * 60000) }) });
  await audit(req, { action: 'care.access.request', entityType: 'CareCase', entityId: k._id, schoolId: sid(req), detail: { number: k.number, minutes, sole: !others.length } });
  await N.notify({ schoolId: sid(req), recipients: await S.holders(sid(req), 'care.safeguarding.lead', req.user.userId), title: others.length ? 'Emergency access to a confidential case was requested' : 'Emergency access to a confidential case was used', body: `${k.number} by ${req.actorName || 'staff'}.`, type: 'safety', link: '#/care', key: `care-bg:${doc._id}`, urgent: true });
  res.status(201).json({ access: doc, approved: !others.length });
});
exports.listAccess = wrap('listAccess', async (req, res) => {
  const c = await S.ctx(req); if (!c.dsl) return bad(res, 403, 'Safeguarding leads only.');
  const rows = await CareAccess.find({ schoolId: sid(req), ...(req.query.status ? { status: String(req.query.status) } : {}) }).sort({ createdAt: -1 }).limit(100); res.json({ access: rows });
});
exports.myAccess = wrap('myAccess', async (req, res) => res.json({ access: await CareAccess.find({ schoolId: sid(req), requestedById: oid(req.user.userId) }).sort({ createdAt: -1 }).limit(20) }));
exports.decideAccess = wrap('decideAccess', async (req, res) => {
  const c = await S.ctx(req); if (!c.dsl) return bad(res, 403, 'Safeguarding leads only.');
  const a = await CareAccess.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!a) return bad(res, 404, 'Request not found.');
  if (String(a.requestedById) === c.userId) return bad(res, 403, 'A different safeguarding lead must decide.'); const approve = (req.body || {}).approve !== false; const now = new Date();
  const u = await CareAccess.updateOne({ _id: a._id, schoolId: sid(req), status: 'Pending' }, { $set: approve ? { status: 'Approved', decidedById: oid(req.user.userId), decidedByName: req.actorName || '', decidedAt: now, validFrom: now, validTo: new Date(now.getTime() + a.minutes * 60000) } : { status: 'Denied', decidedById: oid(req.user.userId), decidedByName: req.actorName || '', decidedAt: now } });
  if (!u.modifiedCount) return bad(res, 409, 'This request was already decided.');
  await audit(req, { action: approve ? 'care.access.approve' : 'care.access.deny', entityType: 'CareCase', entityId: a.caseId, schoolId: sid(req), detail: { number: a.caseNumber, requester: a.requestedByName } });
  await N.notify({ schoolId: sid(req), recipients: [{ id: a.requestedById, role: a.requestedByRole }], title: approve ? 'Emergency access approved' : 'Emergency access was not approved', body: `${a.caseNumber}${approve ? ` — open for ${a.minutes} minutes.` : ''}`, type: 'safety', link: '#/care', key: `care-bg-d:${a._id}`, urgent: true });
  res.json({ ok: true, status: approve ? 'Approved' : 'Denied' });
});
exports.revokeAccess = wrap('revokeAccess', async (req, res) => {
  const c = await S.ctx(req); if (!c.dsl) return bad(res, 403, 'Safeguarding leads only.');
  const u = await CareAccess.updateOne({ _id: oid(req.params.id), schoolId: sid(req), status: 'Approved' }, { $set: { status: 'Revoked', validTo: new Date() } }); if (!u.matchedCount) return bad(res, 404, 'No open window to end.'); res.json({ ok: true });
});
exports.accessLog = wrap('accessLog', async (req, res) => {
  const c = await S.ctx(req); if (!c.dsl && !c.privacy) return bad(res, 403, 'Not allowed.'); const { p, l } = pg(req.query); const f = { schoolId: sid(req) };
  if (['case', 'health', 'notes', 'report'].includes(req.query.entity)) f.entity = req.query.entity; if (oid(req.query.studentId)) f.studentId = oid(req.query.studentId); if (req.query.entityId) f.entityId = String(req.query.entityId);
  const [rows, total] = await Promise.all([CareAccessLog.find(f).sort({ at: -1 }).skip((p - 1) * l).limit(l), CareAccessLog.countDocuments(f)]); res.json({ log: rows, total, page: p });
});

/* ───────── concerns and anonymous reports ───────── */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => { const b = crypto.randomBytes(8); let s = ''; for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length]; return `CR-${s.slice(0, 4)}-${s.slice(4)}`; };
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^CR/, '');
const hashCode = (code) => S.hmac(`care-receipt:${normCode(code)}`);
exports.submitReport = wrap('submitReport', async (req, res) => {
  const role = req.user.role; const b = req.body || {}; const s = sid(req); const set = await S.getSettings(s);
  const source = role === 'student' ? 'student' : role === 'parent' ? 'parent' : 'staff'; const anon = b.anonymous === true && source !== 'staff';
  const body = clean(b.body, 2000); if (body.length < 10) return bad(res, 422, 'Tell us a little more (at least 10 characters).');
  const category = ['bullying', 'safety', 'wellbeing', 'health', 'other'].includes(b.category) ? b.category : 'other';
  const day = await S.today(s); const limKey = `care:rl:${s}:${S.hmac(`${req.user.userId}:${day}`)}`;
  await AppSetting.updateOne({ key: limKey }, { $inc: { value: 1 } }, { upsert: true }); const used = (await AppSetting.findOne({ key: limKey })).value;
  if (used > (anon ? set.anonLimitPerDay : Math.max(set.anonLimitPerDay, 10))) return bad(res, 429, 'You have sent several concerns today. If someone is in danger, tell a member of staff now.');
  let about = null; if (b.aboutStudentId) { about = await Student.findOne({ _id: oid(b.aboutStudentId), schoolId: s }).select('name'); if (!about) return bad(res, 404, 'Student not found.'); }
  let code; let doc = null;
  for (let i = 0; i < 4 && !doc; i += 1) {
    code = newCode();
    try {
      doc = await CareReport.create({ schoolId: s, source: anon ? 'anonymous' : source, category, body, aboutStudentId: about ? about._id : null, aboutName: about ? about.name : '', receiptHash: hashCode(code), urgent: category === 'safety',
        ...(anon ? {} : { reporterId: oid(req.user.userId), reporterRole: role, reporterName: req.actorName || '' }) });
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  if (!doc) return bad(res, 500, 'Could not save. Please try again.');
  const dsl = await S.holders(s, 'care.safeguarding.lead');
  await N.notify({ schoolId: s, recipients: dsl, title: category === 'safety' ? 'URGENT: a safety concern was reported' : 'A new concern was reported', body: 'Open Student care to triage it.', type: category === 'safety' ? 'safety' : 'care', link: '#/care', key: `care-report:${doc._id}`, urgent: category === 'safety' });
  res.status(201).json({ ok: true, code, anonymous: anon, message: anon ? 'Sent without your name. Keep this code: it is the only way to see the reply.' : 'Sent. Keep this code to check on it.' });
});
exports.reportStatus = wrap('reportStatus', async (req, res) => {
  const code = String(req.query.code || ''); if (normCode(code).length < 8) return bad(res, 422, 'Enter the code you were given.');
  const d = await CareReport.findOne({ schoolId: sid(req), receiptHash: hashCode(code) }).select('status reply repliedAt createdAt category');
  if (!d) return bad(res, 404, 'No concern matches that code.');
  res.json({ status: d.status === 'Case' ? 'Being looked into' : d.status === 'Dismissed' ? 'Closed' : d.status === 'Triaged' ? 'Seen by staff' : 'Received', reply: d.reply || '', repliedAt: d.repliedAt || null, sentAt: d.createdAt, category: d.category });
});
exports.listReports = wrap('listReports', async (req, res) => {
  const c = await S.ctx(req); if (!c.dsl && !c.work) return bad(res, 403, 'Not allowed.'); const { p, l } = pg(req.query); const f = { schoolId: sid(req) };
  if (!c.dsl) f.category = { $nin: ['bullying', 'safety'] }; if (['New', 'Triaged', 'Case', 'Dismissed'].includes(req.query.status)) f.status = req.query.status; else if (req.query.status === 'open') f.status = { $in: ['New', 'Triaged'] };
  const [rows, total] = await Promise.all([CareReport.find(f).select('-receiptHash').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), CareReport.countDocuments(f)]);
  res.json({ reports: rows, total, page: p });
});
async function loadReport(req, res) {
  const c = await S.ctx(req); const d = await CareReport.findOne({ _id: oid(req.params.id), schoolId: sid(req) });
  if (!d || (!c.dsl && !(c.work && !['bullying', 'safety'].includes(d.category)))) { bad(res, 404, 'Concern not found.'); return null; } return { d, c };
}
exports.getReport = wrap('getReport', async (req, res) => { const r = await loadReport(req, res); if (!r) return; await S.logRead(req, 'report', r.d._id, r.d.aboutStudentId, r.c.dsl ? 'dsl' : 'work'); const o = r.d.toObject(); delete o.receiptHash; res.json({ report: o }); });
exports.replyReport = wrap('replyReport', async (req, res) => {
  const r = await loadReport(req, res); if (!r) return; const text = clean((req.body || {}).text, 600); if (text.length < 3) return bad(res, 422, 'Write a reply.');
  await CareReport.updateOne({ _id: r.d._id, schoolId: sid(req) }, { $set: { reply: text, repliedAt: new Date(), status: r.d.status === 'New' ? 'Triaged' : r.d.status, triagedByName: req.actorName || '', triagedAt: r.d.triagedAt || new Date() } });
  if (r.d.reporterId) await N.notify({ schoolId: sid(req), recipients: [{ id: r.d.reporterId, role: r.d.reporterRole }], title: 'The school replied to your concern', body: 'Open Student care to read it.', type: 'care', link: '#/care', key: `care-reply:${r.d._id}` });
  res.json({ ok: true });
});
exports.dismissReport = wrap('dismissReport', async (req, res) => {
  const r = await loadReport(req, res); if (!r) return; const why = clean((req.body || {}).reason, 300); if (why.length < 5) return bad(res, 422, 'Say why it is being closed without a case.');
  if (r.d.status === 'Case') return bad(res, 409, 'Already turned into a case.');
  await CareReport.updateOne({ _id: r.d._id, schoolId: sid(req) }, { $set: { status: 'Dismissed', triagedByName: req.actorName || '', triagedAt: new Date(), reply: r.d.reply || `Closed: ${why}`, repliedAt: r.d.repliedAt || new Date() } });
  await audit(req, { action: 'care.report.dismiss', entityType: 'CareReport', entityId: r.d._id, schoolId: sid(req), detail: { why } }); res.json({ ok: true });
});
exports.convertReport = wrap('convertReport', async (req, res) => {
  const r = await loadReport(req, res); if (!r) return; const { d, c } = r; const b = req.body || {}; const s = sid(req);
  if (d.status === 'Case') return bad(res, 409, 'Already turned into a case.'); const sidv = oid(b.studentId || d.aboutStudentId);
  const st = await S.studentOf(req, sidv); if (!st) return bad(res, 422, 'Choose the student this is about.');
  const category = CATS.includes(b.category) ? b.category : (d.category === 'safety' ? 'safeguarding' : CATS.includes(d.category) ? d.category : 'other');
  if (S.isConfidential(category) && !c.dsl) return bad(res, 403, 'Only a safeguarding lead can open this kind of case.');
  const level = LEVELS.includes(b.level) ? b.level : (d.urgent ? 'intensive' : 'support'); const set = await S.getSettings(s); const day = await S.today(s);
  let lead = null; if (b.leadId) { lead = await S.person(s, b.leadId); if (!lead) return bad(res, 422, 'That lead is not on staff.'); }
  const k = await CareCase.create({ schoolId: s, number: await S.nextNumber(s, 'CC'), studentId: st._id, studentName: st.name, classId: st.classId || null, category, level, confidential: S.isConfidential(category), title: clean(b.title, 140) || `Concern: ${d.body.slice(0, 60)}`, summary: d.body.slice(0, 2000),
    leadId: lead ? lead.id : null, leadModel: lead ? lead.model : 'Teacher', leadName: lead ? lead.name : '', circle: lead ? [lead] : [], openedById: oid(req.user.userId), openedByName: req.actorName || '', openedByRole: req.user.role, fromReportId: d._id,
    reviewOn: S.addDays(day, set.reviewDays[level]), events: [ev(req, 'opened', `Opened from a ${d.source} concern.`)] });
  await CareReport.updateOne({ _id: d._id, schoolId: s }, { $set: { status: 'Case', caseId: k._id, triagedByName: req.actorName || '', triagedAt: new Date(), reply: d.reply || 'Thank you. The school is looking into this.', repliedAt: d.repliedAt || new Date() } });
  await audit(req, { action: 'care.report.convert', entityType: 'CareReport', entityId: d._id, schoolId: s, detail: { case: k.number } });
  res.status(201).json({ case: S.summary(k), _id: k._id });
});
