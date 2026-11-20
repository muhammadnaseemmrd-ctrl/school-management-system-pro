// Family helpdesk (PRD E20: Ticket). Deadlines count only working hours, stop while the school waits for the family, and breaches are raised once.
const C = require('../utils/comms/service');
const { T, both, waitWords } = require('../utils/comms/i18n');
const N = require('../utils/notify');
const G = require('../utils/guardianRights');
const AppSetting = require('../models/AppSetting');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const User = require('../models/User');
const CmTicket = require('../models/CmTicket');
const CmCanned = require('../models/CmCanned');

const { oid, sid, bad, wrap, clean, pg, K } = C;
const URDU = /[؀-ۿ]/;
const CATS = ['fees', 'academics', 'attendance', 'transport', 'documents', 'admission', 'health', 'complaint', 'safety', 'other'];
const RIGHT = { fees: 'viewFees', academics: 'viewMarks', attendance: 'viewAttendance' };
const OPEN = ['Open', 'In progress', 'Waiting on family'];
const LINK = { parent: '/parent#/messages', admin: '/admin#/familyDesk' };
const PRI_RANK = { normal: 0, high: 1, urgent: 2 };

async function nextNumber(schoolId) {
  const y = new Date().getUTCFullYear(); const key = `comms:seq:${schoolId}:${y}`;
  await AppSetting.updateOne({ key }, { $inc: { value: 1 } }, { upsert: true });
  const row = await AppSetting.findOne({ key }); return `HD-${y}-${String(row.value).padStart(5, '0')}`;
}
// Where a ticket stands against its deadlines, in working time
function slaOf(t, settings, tz, now = new Date()) {
  const first = t.firstResponseDueAt && new Date(t.firstResponseDueAt); const fin = t.resolveDueAt && new Date(t.resolveDueAt);
  if (['Resolved', 'Closed'].includes(t.status)) {
    const met = (!first || (t.firstResponseAt && new Date(t.firstResponseAt) <= first)) && (!fin || !t.resolvedAt || new Date(t.resolvedAt) <= fin);
    return { state: met ? 'met' : 'missed', firstDueAt: first, resolveDueAt: fin };
  }
  if (t.status === 'Waiting on family') return { state: 'paused', firstDueAt: first, resolveDueAt: fin };
  const late = (!t.firstResponseAt && first && now > first) || (fin && now > fin);
  if (late) return { state: 'breached', firstDueAt: first, resolveDueAt: fin, over: late };
  const target = !t.firstResponseAt ? first : fin; const left = target ? K.businessMinutesBetween(now, target, settings, tz) : null;
  return { state: left != null && left <= 60 ? 'due-soon' : 'ok', firstDueAt: first, resolveDueAt: fin, minutesLeft: left };
}
const evView = (e, parent) => ({ _id: e._id, at: e.at, kind: e.kind, byRole: e.byRole, byName: e.byName, en: e.en, ur: e.ur, data: e.data });
const view = (t, settings, tz, forParent, lang = 'en') => {
  const sla = slaOf(t, settings, tz);
  return { _id: t._id, number: t.number, category: t.category, priority: t.priority, status: t.status, subject: t.subject, body: t.body, parentId: forParent ? undefined : t.parentId, parentName: t.parentName, studentId: t.studentId, studentName: t.studentName, assigneeName: forParent ? '' : t.assigneeName, assigneeId: forParent ? undefined : t.assigneeId, restricted: forParent ? undefined : t.restricted, createdAt: t.createdAt, lastAt: t.lastAt, lastFrom: t.lastFrom, firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt, rating: t.rating, unread: forParent ? t.lastFrom === 'staff' && (!t.parentReadAt || t.parentReadAt < t.lastAt) : undefined, sla: forParent ? { state: sla.state === 'breached' ? 'ok' : sla.state, firstDueAt: sla.firstDueAt, resolveDueAt: sla.resolveDueAt } : sla };
};
const ev = (req, kind, text, extra = {}) => ({ at: new Date(), byRole: req.user.role, byId: oid(req.user.userId), byName: req.actorName || '', kind, ...extra, ...(text ? { [URDU.test(text) ? 'ur' : 'en']: text } : {}) });
async function load(req, id) {
  const t = await CmTicket.findOne({ _id: oid(id), schoolId: sid(req) }); if (!t) return { code: 404 };
  if (req.user.role === 'parent' && String(t.parentId) !== String(req.user.userId)) return { code: 404 };
  if (req.user.role === 'teacher') return { code: 403 };
  return { t };
}
const adminsTo = async (schoolId, t) => (t.assigneeId ? [{ role: 'admin', id: t.assigneeId }] : await N.admins(schoolId));

exports.create = wrap('ticketCreate', async (req, res) => {
  const b = req.body || {}; const s = sid(req); const parentId = oid(req.user.userId);
  const cat = String(b.category || ''); if (!CATS.includes(cat)) return bad(res, 400, 'Choose what this is about.');
  const subject = clean(b.subject, 120); const text = clean(b.text, 3000); if (subject.length < 3) return bad(res, 400, 'Give the request a short title.'); if (!text) return bad(res, 400, 'Tell us what you need.');
  let st = null;
  if (b.studentId) {
    st = await Student.findOne({ _id: oid(b.studentId), schoolId: s }).select('name'); if (!st) return bad(res, 404, 'Child not found.');
    const sc = await C.parentScope(s, parentId, st._id, RIGHT[cat] || 'viewInfo'); if (!sc.ok) return bad(res, 403, 'You cannot raise this kind of request about this child.');
  } else if (['fees', 'academics', 'attendance'].includes(cat)) return bad(res, 400, 'Choose which child this is about.');
  const today = await CmTicket.countDocuments({ schoolId: s, parentId, createdAt: { $gte: new Date(Date.now() - 86400000) } }); if (today >= 10) return bad(res, 429, 'You have sent many requests today. Please wait for replies to the earlier ones.');
  let priority = b.priority === 'high' ? 'high' : 'normal'; if (cat === 'safety') priority = 'urgent'; else if (cat === 'health' && priority === 'normal') priority = 'high';
  const settings = await C.getSettings(s); const tz = await K.tzOf(s); const now = new Date(); const sl = settings.sla[priority]; const par = await Parent.findOne({ _id: parentId, schoolId: s }).select('name');
  const wrote = URDU.test(text) ? 'ur' : 'en'; const other = wrote === 'ur' ? 'en' : 'ur'; const tr = clean(b.translation, 3000);
  let t; for (let i = 0; i < 3 && !t; i += 1) {
    try {
      t = await CmTicket.create({ schoolId: s, number: await nextNumber(s), category: cat, priority, subject, body: text, wrote, parentId, parentName: par ? par.name : '', studentId: st ? st._id : null, studentName: st ? st.name : '', restricted: cat === 'safety', firstResponseDueAt: K.addBusinessMinutes(now, sl.first, settings, tz), resolveDueAt: K.addBusinessMinutes(now, sl.resolve, settings, tz), lastFrom: 'parent', parentReadAt: now,
        events: [{ at: now, byRole: 'parent', byId: parentId, byName: par ? par.name : '', kind: 'comment', [wrote]: text, ...(tr ? { [other]: tr } : {}) }] });
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  if (!t) return bad(res, 409, 'Please try again.');
  const wait = (l) => waitWords(sl.first, K.mins(settings.hours.to) - K.mins(settings.hours.from), l);
  await C.deliver({ schoolId: s, to: [{ role: 'parent', id: parentId }], title: both('ticket.created', { number: t.number }), body: { en: T('ticket.created.body', { subject, when: wait('en') }, 'en'), ur: T('ticket.created.body', { subject, when: wait('ur') }, 'ur') }, link: LINK, type: 'general', kind: 'ticket', refId: t._id });
  await C.deliver({ schoolId: s, to: await N.admins(s), title: both('ticket.staff.new', { number: t.number, subject }), body: { en: `${t.parentName}${t.studentName ? ` · ${t.studentName}` : ''}`, ur: `${t.parentName}${t.studentName ? ` · ${t.studentName}` : ''}` }, link: LINK, type: 'general', urgent: priority === 'urgent', kind: 'ticket', refId: t._id });
  res.status(201).json({ ticket: view(t, settings, tz, true) });
});
exports.list = wrap('ticketList', async (req, res) => {
  const { p, l } = pg(req.query); const s = sid(req); const role = req.user.role; const q = { schoolId: s }; const settings = await C.getSettings(s); const tz = await K.tzOf(s);
  if (role === 'teacher') return bad(res, 403, 'Not allowed.');
  if (role === 'parent') q.parentId = oid(req.user.userId);
  const st = String(req.query.status || 'open');
  if (st === 'open') q.status = { $in: OPEN }; else if (st === 'done') q.status = { $in: ['Resolved', 'Closed'] }; else if (['Open', 'In progress', 'Waiting on family', 'Resolved', 'Closed'].includes(st)) q.status = st;
  if (role === 'admin') {
    if (CATS.includes(req.query.category)) q.category = req.query.category; if (['normal', 'high', 'urgent'].includes(req.query.priority)) q.priority = req.query.priority;
    if (req.query.assignee === 'me') q.assigneeId = oid(req.user.userId); else if (req.query.assignee === 'none') q.assigneeId = null;
    if (req.query.breach === '1') q.breach = { $in: ['first', 'resolve'] };
    const term = clean(req.query.q, 60); if (term) { const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; q.$or = [{ number: rx }, { subject: rx }, { parentName: rx }, { studentName: rx }]; }
  }
  const rows = await CmTicket.find(q).select('-events').sort({ lastAt: -1 }).skip((p - 1) * l).limit(l); const total = await CmTicket.countDocuments(q);
  res.json({ tickets: rows.map((t) => view(t, settings, tz, role === 'parent')), total });
});
exports.get = wrap('ticketGet', async (req, res) => {
  const a = await load(req, req.params.id); if (a.code) return bad(res, a.code, a.code === 404 ? 'Request not found.' : 'Not allowed.'); const t = a.t; const s = sid(req);
  const settings = await C.getSettings(s); const tz = await K.tzOf(s); const parent = req.user.role === 'parent';
  if (parent) { t.parentReadAt = new Date(); await t.save(); }
  const pref = await C.prefOf(s, parent ? 'parent' : 'admin', req.user.userId); const lang = pref.lang === 'ur' ? 'ur' : 'en';
  res.json({ ticket: view(t, settings, tz, parent), lang, events: (t.events || []).filter((e) => !parent || ['comment', 'status', 'rating'].includes(e.kind)).map((e) => evView(e, parent)), canReply: t.status !== 'Closed', canReopen: parent && ['Resolved', 'Closed'].includes(t.status) && (t.closedAt || t.resolvedAt) && Date.now() - new Date(t.closedAt || t.resolvedAt) < settings.reopenDays * 86400000 });
});
exports.comment = wrap('ticketComment', async (req, res) => {
  const a = await load(req, req.params.id); if (a.code) return bad(res, a.code, a.code === 404 ? 'Request not found.' : 'Not allowed.'); const t = a.t; const s = sid(req); const b = req.body || {};
  const text = clean(b.text, 3000); if (!text) return bad(res, 400, 'Write something first.'); const role = req.user.role; const now = new Date();
  const settings = await C.getSettings(s); const tz = await K.tzOf(s); const tr = clean(b.translation, 3000); const wrote = URDU.test(text) ? 'ur' : 'en'; const other = wrote === 'ur' ? 'en' : 'ur';
  const e = { at: now, byRole: role, byId: oid(req.user.userId), byName: req.actorName || '', kind: b.internal && role === 'admin' ? 'note' : 'comment', [wrote]: text, ...(tr ? { [other]: tr } : {}) };
  if (role === 'parent') {
    if (t.status === 'Closed') { if (!(t.closedAt && Date.now() - new Date(t.closedAt) < settings.reopenDays * 86400000)) return bad(res, 409, 'This request is closed. Please start a new one.'); }
    if (t.status === 'Resolved' || t.status === 'Closed') { if (t.resolvedAt && Date.now() - new Date(t.resolvedAt) > settings.reopenDays * 86400000) return bad(res, 409, 'This request is closed. Please start a new one.'); t.reopened += 1; t.status = 'In progress'; t.resolvedAt = null; t.closedAt = null; const sl = settings.sla[t.priority]; t.resolveDueAt = K.addBusinessMinutes(now, sl.resolve, settings, tz); t.breach = ''; t.breachedAt = null; t.events.push({ at: now, byRole: 'parent', byId: oid(req.user.userId), byName: req.actorName || '', kind: 'status', en: 'Reopened by the family', ur: 'خاندان نے دوبارہ کھولا', data: { to: 'In progress' } }); }
    else if (t.status === 'Waiting on family') await resume(t, now, settings, tz, 'In progress');
    t.lastFrom = 'parent'; t.parentReadAt = now; t.events.push(e); t.lastAt = now; await t.save();
    await C.deliver({ schoolId: s, to: await adminsTo(s, t), title: both('ticket.staff.reply', { number: t.number }), body: { en: clean(text, 100), ur: clean(text, 100) }, link: LINK, type: 'general', kind: 'ticket', refId: t._id });
    return res.status(201).json({ ticket: view(t, settings, tz, true) });
  }
  if (t.status === 'Closed') return bad(res, 409, 'This request is closed. Reopen it first.');
  e.byName = req.actorName || 'School'; t.events.push(e); t.lastAt = now;
  if (e.kind === 'comment') {
    if (!t.firstResponseAt) t.firstResponseAt = now; t.lastFrom = 'staff'; t.parentReadAt = null; if (t.status === 'Open') { t.status = 'In progress'; t.events.push({ at: now, byRole: 'admin', byId: oid(req.user.userId), byName: req.actorName || '', kind: 'status', en: 'In progress', data: { to: 'In progress' } }); }
    if (!t.assigneeId) { t.assigneeId = oid(req.user.userId); t.assigneeName = req.actorName || ''; }
  }
  await t.save();
  if (e.kind === 'comment') await C.deliver({ schoolId: s, to: [{ role: 'parent', id: t.parentId }], title: both('ticket.reply', { number: t.number }), body: { en: clean(text, 100), ur: clean(text, 100) }, link: LINK, type: 'general', kind: 'ticket', refId: t._id });
  res.status(201).json({ ticket: view(t, settings, tz, false) });
});
// When the school was waiting on the family, the time it waited does not count against the school
async function resume(t, now, settings, tz, to) {
  if (t.pausedAt) { const gap = K.businessMinutesBetween(t.pausedAt, now, settings, tz); if (t.firstResponseDueAt && !t.firstResponseAt) t.firstResponseDueAt = K.addBusinessMinutes(t.firstResponseDueAt, gap, settings, tz); if (t.resolveDueAt) t.resolveDueAt = K.addBusinessMinutes(t.resolveDueAt, gap, settings, tz); t.pausedAt = null; }
  t.status = to; t.events.push({ at: now, byRole: 'system', kind: 'status', en: 'Back with the school', ur: 'اب اسکول کے پاس', data: { to } });
}
const FLOW = { Open: ['In progress', 'Waiting on family', 'Resolved'], 'In progress': ['Waiting on family', 'Resolved'], 'Waiting on family': ['In progress', 'Resolved'], Resolved: ['Closed', 'In progress'], Closed: ['In progress'] };
exports.setStatus = wrap('ticketStatus', async (req, res) => {
  const a = await load(req, req.params.id); if (a.code) return bad(res, a.code, a.code === 404 ? 'Request not found.' : 'Not allowed.'); const t = a.t; const s = sid(req); const to = String(req.body?.status || ''); const text = clean(req.body?.text, 1000);
  const settings = await C.getSettings(s); const tz = await K.tzOf(s); const now = new Date();
  if (req.user.role === 'parent') { if (!(t.status === 'Resolved' && to === 'Closed')) return bad(res, 403, 'You can close a request once it is resolved.'); }
  else if (!(FLOW[t.status] || []).includes(to)) return bad(res, 422, `A request that is ${t.status} cannot move to ${to}.`);
  if (['Waiting on family', 'Resolved'].includes(to) && req.user.role === 'admin' && text.length < 3) return bad(res, 400, to === 'Resolved' ? 'Tell the family what was done.' : 'Tell the family what you need from them.');
  const from = t.status;
  if (to === 'Waiting on family') { t.pausedAt = now; t.status = to; }
  else if (from === 'Waiting on family') await resume(t, now, settings, tz, to);
  else t.status = to;
  if (to === 'Resolved') { t.resolvedAt = now; if (!t.firstResponseAt) t.firstResponseAt = now; }
  if (to === 'Closed') t.closedAt = now;
  if (from === 'Resolved' && to === 'In progress') { t.resolvedAt = null; t.reopened += 1; }
  const word = (l) => T(`status.${to}`, {}, l);
  t.events.push({ at: now, byRole: req.user.role, byId: oid(req.user.userId), byName: req.actorName || '', kind: 'status', en: text && !URDU.test(text) ? text : word('en'), ur: text && URDU.test(text) ? text : word('ur'), data: { from, to } });
  if (req.user.role === 'admin') { t.lastFrom = 'staff'; t.parentReadAt = null; if (!t.assigneeId) { t.assigneeId = oid(req.user.userId); t.assigneeName = req.actorName || ''; } }
  t.lastAt = now; await t.save();
  if (req.user.role === 'admin' && to !== 'In progress') await C.deliver({ schoolId: s, to: [{ role: 'parent', id: t.parentId }], title: to === 'Waiting on family' ? both('ticket.waiting', { number: t.number }) : { en: T('ticket.status', { number: t.number, status: word('en') }, 'en'), ur: T('ticket.status', { number: t.number, status: word('ur') }, 'ur') }, body: { en: text, ur: text }, link: LINK, type: 'general', kind: 'ticket', refId: t._id });
  res.json({ ticket: view(t, settings, tz, req.user.role === 'parent') });
});
exports.assign = wrap('ticketAssign', async (req, res) => {
  const a = await load(req, req.params.id); if (a.code) return bad(res, a.code, 'Request not found.'); const t = a.t; const adm = await User.findOne({ _id: oid(req.body?.assigneeId), schoolId: sid(req), role: 'admin', isActive: { $ne: false } }).select('name');
  if (!adm) return bad(res, 404, 'Choose an administrator.'); t.assigneeId = adm._id; t.assigneeName = adm.name; t.events.push(ev(req, 'assign', '', { en: `Assigned to ${adm.name}`, data: { to: adm._id } })); await t.save();
  if (String(adm._id) !== String(req.user.userId)) await C.deliver({ schoolId: sid(req), to: [{ role: 'admin', id: adm._id }], title: both('ticket.staff.assigned', { number: t.number }), body: { en: t.subject, ur: t.subject }, link: LINK, type: 'general', kind: 'ticket', refId: t._id });
  res.json({ ticket: view(t, await C.getSettings(sid(req)), await K.tzOf(sid(req)), false) });
});
exports.admins = wrap('ticketAdmins', async (req, res) => res.json({ admins: (await User.find({ schoolId: sid(req), role: 'admin', isActive: { $ne: false } }).select('name').sort({ name: 1 }).limit(50)).map((u) => ({ _id: u._id, name: u.name })) }));
exports.setPriority = wrap('ticketPriority', async (req, res) => {
  const a = await load(req, req.params.id); if (a.code) return bad(res, a.code, 'Request not found.'); const t = a.t; const p = String(req.body?.priority || ''); const why = clean(req.body?.reason, 200);
  if (!PRI_RANK.hasOwnProperty(p)) return bad(res, 400, 'Choose normal, high or urgent.'); if (['Resolved', 'Closed'].includes(t.status)) return bad(res, 422, 'This request is finished.'); if (why.length < 3) return bad(res, 400, 'Say why the priority changes.');
  const settings = await C.getSettings(sid(req)); const tz = await K.tzOf(sid(req)); const from = t.priority; t.priority = p; const sl = settings.sla[p]; const base = t.createdAt || new Date();
  if (!t.firstResponseAt) t.firstResponseDueAt = K.addBusinessMinutes(base, sl.first, settings, tz); t.resolveDueAt = K.addBusinessMinutes(base, sl.resolve, settings, tz); t.breach = ''; t.breachedAt = null;
  t.events.push(ev(req, 'priority', '', { en: `Priority ${from} → ${p}: ${why}`, data: { from, to: p } })); await t.save(); await audit(req, { action: 'comms.ticket.priority', entityType: 'CmTicket', entityId: t._id, schoolId: sid(req), detail: { from, to: p, why } });
  res.json({ ticket: view(t, settings, tz, false) });
});
exports.rate = wrap('ticketRate', async (req, res) => {
  const a = await load(req, req.params.id); if (a.code) return bad(res, a.code, 'Request not found.'); const t = a.t; const n = Math.round(Number(req.body?.rating));
  if (!['Resolved', 'Closed'].includes(t.status)) return bad(res, 422, 'You can rate a request once it is resolved.'); if (t.rating) return bad(res, 409, 'Already rated.'); if (!(n >= 1 && n <= 5)) return bad(res, 400, 'Choose 1 to 5.');
  t.rating = n; t.ratingNote = clean(req.body?.note, 300); t.events.push(ev(req, 'rating', '', { en: `Rated ${n} of 5`, data: { rating: n } })); await t.save(); res.json({ ok: true });
});

/* ───────── ready-made replies ───────── */
exports.canned = wrap('canned', async (req, res) => res.json({ replies: await CmCanned.find({ schoolId: sid(req), active: true }).sort({ title: 1 }).limit(100) }));
exports.cannedSave = wrap('cannedSave', async (req, res) => {
  const b = req.body || {}; const title = clean(b.title, 80); const en = clean(b.en, 1500); const ur = clean(b.ur, 1500); if (title.length < 2 || (!en && !ur)) return bad(res, 400, 'A ready-made reply needs a title and some text.');
  const doc = { title, category: CATS.includes(b.category) ? b.category : '', en, ur };
  if (req.params.id) { const r = await CmCanned.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!r) return bad(res, 404, 'Not found.'); Object.assign(r, doc); await r.save(); return res.json({ reply: r }); }
  res.status(201).json({ reply: await CmCanned.create({ schoolId: sid(req), ...doc }) });
});
exports.cannedDelete = wrap('cannedDelete', async (req, res) => { const r = await CmCanned.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!r) return bad(res, 404, 'Not found.'); r.active = false; await r.save(); res.json({ ok: true }); });

/* ───────── report ───────── */
const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
exports.report = wrap('helpReport', async (req, res) => {
  const s = sid(req); const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30)); const since = new Date(Date.now() - days * 86400000); const settings = await C.getSettings(s); const tz = await K.tzOf(s);
  const rows = await CmTicket.find({ schoolId: s, createdAt: { $gte: since } }).select('-events').limit(3000);
  const by = (f) => rows.reduce((m, r) => { m[f(r)] = (m[f(r)] || 0) + 1; return m; }, {});
  const firsts = rows.filter((r) => r.firstResponseAt).map((r) => K.businessMinutesBetween(r.createdAt, r.firstResponseAt, settings, tz)); const fins = rows.filter((r) => r.resolvedAt).map((r) => K.businessMinutesBetween(r.createdAt, r.resolvedAt, settings, tz));
  const judged = rows.filter((r) => ['Resolved', 'Closed'].includes(r.status)); const met = judged.filter((r) => slaOf(r, settings, tz).state === 'met').length; const rated = rows.filter((r) => r.rating);
  const open = await CmTicket.find({ schoolId: s, status: { $in: OPEN } }).select('createdAt').sort({ createdAt: 1 }).limit(1);
  res.json({ days, total: rows.length, byStatus: by((r) => r.status), byCategory: by((r) => r.category), byPriority: by((r) => r.priority), medianFirstReplyMinutes: median(firsts), medianResolveMinutes: median(fins), judged: judged.length, metPct: judged.length ? Math.round((met / judged.length) * 100) : null, breached: rows.filter((r) => r.breach).length, reopened: rows.filter((r) => r.reopened).length, ratingAvg: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10 : null, rated: rated.length, oldestOpen: open[0] ? open[0].createdAt : null });
});
exports.slaOf = slaOf;
