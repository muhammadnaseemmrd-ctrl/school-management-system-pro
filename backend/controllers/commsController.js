// Family messages, preferences, settings and the shared overview (PRD E20: MessageThread, DeliveryAttempt).
//   A thread is one parent and one teacher (or the office) about one child. The parent must be linked to the child with the contact right,
//   a restricted parent cannot write or be written to, quiet hours hold pushes (never the in-app copy), and everyone reads the language they chose.
const C = require('../utils/comms/service');
const { T, both, waitWords } = require('../utils/comms/i18n');
const N = require('../utils/notify');
const G = require('../utils/guardianRights');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Teacher = require('../models/Teacher');
const User = require('../models/User');
const Class = require('../models/Class');
const CmPref = require('../models/CmPref');
const CmThread = require('../models/CmThread');
const CmMessage = require('../models/CmMessage');
const CmDelivery = require('../models/CmDelivery');
const CmTicket = require('../models/CmTicket');
const CmPtmSlot = require('../models/CmPtmSlot');

const { oid, sid, bad, wrap, clean, pg, K } = C;
const URDU = /[؀-ۿ]/;
const who = (req) => ({ id: oid(req.user.userId), name: req.actorName || '', role: req.user.role });
const preview = (t) => clean(t, 90).replace(/\s+/g, ' ');
const roleKey = (role) => (role === 'admin' ? 'admin' : role === 'teacher' ? 'teacher' : 'parent');
const LINK = { parent: '/parent#/messages', teacher: '/teacher#/familyDesk', admin: '/admin#/familyDesk' };

/* ───────── settings and preferences ───────── */
exports.getSettings = wrap('settings', async (req, res) => res.json({ settings: await C.getSettings(sid(req)), defaults: C.DEFAULTS }));
exports.putSettings = wrap('putSettings', async (req, res) => {
  const b = req.body || {}; const patch = {};
  if (b.quiet) {
    if (!K.HM.test(b.quiet.from || '') || !K.HM.test(b.quiet.to || '')) return bad(res, 400, 'Quiet hours need a start and an end time, like 21:00 and 07:00.');
    patch.quiet = { on: b.quiet.on !== false, from: b.quiet.from, to: b.quiet.to };
  }
  if (b.urgentBypass != null) patch.urgentBypass = !!b.urgentBypass;
  if (b.workDays) { const d = [...new Set((Array.isArray(b.workDays) ? b.workDays : []).map(Number).filter((n) => n >= 0 && n <= 6))]; if (!d.length) return bad(res, 400, 'Pick at least one working day.'); patch.workDays = d.sort(); }
  if (b.hours) { if (!K.HM.test(b.hours.from || '') || !K.HM.test(b.hours.to || '') || K.mins(b.hours.from) >= K.mins(b.hours.to)) return bad(res, 400, 'Working hours need an opening time before the closing time.'); patch.hours = { from: b.hours.from, to: b.hours.to }; }
  if (b.sla) {
    patch.sla = {};
    for (const p of ['normal', 'high', 'urgent']) if (b.sla[p]) {
      const f = Math.round(Number(b.sla[p].first)); const r = Math.round(Number(b.sla[p].resolve));
      if (!(f >= 15 && f <= 10080) || !(r >= f && r <= 43200)) return bad(res, 400, `The ${p} times need a first reply of at least 15 minutes and a resolution no shorter than the first reply.`);
      patch.sla[p] = { first: f, resolve: r };
    }
  }
  for (const [k, lo, hi] of [['threadReplyMinutes', 30, 10080], ['autoCloseDays', 1, 60], ['reopenDays', 1, 90]]) if (b[k] != null) { const n = Math.round(Number(b[k])); if (!(n >= lo && n <= hi)) return bad(res, 400, `${k} must be between ${lo} and ${hi}.`); patch[k] = n; }
  if (b.ptm) { patch.ptm = {}; const n = b.ptm; if (n.slotMinutes != null) { const v = Math.round(Number(n.slotMinutes)); if (!(v >= 5 && v <= 30)) return bad(res, 400, 'A meeting slot is 5 to 30 minutes.'); patch.ptm.slotMinutes = v; } if (n.cancelHoursBefore != null) patch.ptm.cancelHoursBefore = Math.max(0, Math.min(72, Math.round(Number(n.cancelHoursBefore)))); if (n.maxPerFamily != null) patch.ptm.maxPerFamily = Math.max(1, Math.min(20, Math.round(Number(n.maxPerFamily)))); }
  const s = await C.saveSettings(sid(req), patch); await audit(req, { action: 'comms.settings', entityType: 'AppSetting', entityId: sid(req), schoolId: sid(req), detail: { keys: Object.keys(patch) } }); res.json({ settings: s });
});
exports.getPrefs = wrap('prefs', async (req, res) => {
  const p = await C.prefOf(sid(req), roleKey(req.user.role), req.user.userId); const s = await C.getSettings(sid(req));
  res.json({ prefs: { lang: p.lang, quietOn: !!p.quietOn, quietFrom: p.quietFrom || '21:00', quietTo: p.quietTo || '07:00', push: p.push !== false }, school: { quiet: s.quiet, hours: s.hours, workDays: s.workDays } });
});
exports.putPrefs = wrap('putPrefs', async (req, res) => {
  const b = req.body || {}; const set = {};
  if (b.lang != null) { if (!['en', 'ur'].includes(b.lang)) return bad(res, 400, 'Choose English or Urdu.'); set.lang = b.lang; }
  if (b.quietOn != null) set.quietOn = !!b.quietOn;
  for (const k of ['quietFrom', 'quietTo']) if (b[k] != null) { if (!K.HM.test(b[k])) return bad(res, 400, 'Times look like 21:00.'); set[k] = b[k]; }
  if (b.push != null) set.push = !!b.push;
  await CmPref.updateOne({ schoolId: sid(req), role: roleKey(req.user.role), userId: oid(req.user.userId) }, { $set: set, $setOnInsert: { schoolId: sid(req), role: roleKey(req.user.role), userId: oid(req.user.userId) } }, { upsert: true });
  res.json({ ok: true });
});

/* ───────── who can I write to ───────── */
async function childrenOfParent(req) {
  const p = await Parent.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('children name');
  if (!p) return { p: null, kids: [] };
  const kids = await Student.find({ _id: { $in: p.children || [] }, schoolId: sid(req), isActive: { $ne: false } }).select('name classId studentId');
  const rights = await G.resolveForParent(sid(req), p, kids.map((k) => k._id));
  const classes = new Map((await Class.find({ _id: { $in: kids.map((k) => k.classId).filter(Boolean) } }).select('standard division')).map((c) => [String(c._id), `${c.standard}-${c.division}`]));
  return { p, kids: kids.map((k) => { const r = rights.get(String(k._id)) || { rights: {}, linked: false }; return { _id: k._id, name: k.name, className: classes.get(String(k.classId)) || '', canMessage: !!(r.linked && r.rights.receiveMessages), canHelp: !!r.linked, rights: r.rights }; }) };
}
exports.myChildren = wrap('myChildren', async (req, res) => { const { kids } = await childrenOfParent(req); res.json({ children: kids.map(({ rights, ...k }) => k) }); });
exports.contacts = wrap('contacts', async (req, res) => {
  const st = await Student.findOne({ _id: oid(req.query.studentId), schoolId: sid(req) }).select('name classId'); if (!st) return bad(res, 404, 'Child not found.');
  const sc = await C.parentScope(sid(req), req.user.userId, st._id); if (!sc.ok) return bad(res, 403, 'You cannot message the school about this child.');
  const ts = await C.teachersOfClass(sid(req), st.classId);
  res.json({ student: { _id: st._id, name: st.name }, contacts: [{ kind: 'office', id: 'office', name: 'School office' }, ...ts.map((t) => ({ kind: 'teacher', id: t._id, name: t.name }))] });
});
// Staff: children they may write about, with the parents who may be contacted
exports.students = wrap('students', async (req, res) => {
  const q = clean(req.query.q, 60); const f = { schoolId: sid(req), isActive: { $ne: false } };
  if (q.length < 2) return res.json({ students: [] });
  f.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  let rows = await Student.find(f).select('name classId studentId').sort({ name: 1 }).limit(40);
  if (req.user.role === 'teacher') { const t = await Teacher.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('classIds classTeacherOf subjectClassAssignments'); rows = rows.filter((s) => t && C.teachesClass(t, s.classId)); }
  const out = [];
  for (const s of rows.slice(0, 20)) { const ps = await G.contactableParents(sid(req), [s._id], 'receiveMessages'); out.push({ _id: s._id, name: s.name, studentId: s.studentId, parents: ps.map((p) => ({ _id: p._id, name: p.name })) }); }
  res.json({ students: out });
});

/* ───────── threads ───────── */
const unreadFor = (t, role) => (role === 'parent' ? t.lastFrom !== 'parent' && (!t.parentReadAt || t.parentReadAt < t.lastAt) : t.lastFrom === 'parent' && (!t.staffReadAt || t.staffReadAt < t.lastAt));
const threadView = (t, role) => ({ _id: t._id, studentId: t.studentId, studentName: t.studentName, parentId: t.parentId, parentName: t.parentName, staffKind: t.staffKind, teacherId: t.teacherId, teacherName: t.staffKind === 'office' ? 'School office' : t.teacherName, subject: t.subject, status: t.status, lastAt: t.lastAt, lastPreview: t.lastPreview, lastFrom: t.lastFrom, messages: t.messages, unread: unreadFor(t, role), waitingOn: t.waitingOn, replyDueAt: t.replyDueAt, overdue: !!t.overdueAt && t.waitingOn === 'school' });
async function threadAccess(req, id) {
  const t = await CmThread.findOne({ _id: oid(id), schoolId: sid(req) }); if (!t) return { code: 404, msg: 'Conversation not found.' };
  const role = req.user.role; const me = String(req.user.userId);
  if (role === 'parent') { if (String(t.parentId) !== me) return { code: 404, msg: 'Conversation not found.' }; }
  else if (role === 'teacher') { if (t.staffKind !== 'teacher' || String(t.teacherId) !== me) return { code: 404, msg: 'Conversation not found.' }; }
  else if (role !== 'admin') return { code: 403, msg: 'Not allowed.' };
  return { t };
}
exports.listThreads = wrap('threads', async (req, res) => {
  const { p, l } = pg(req.query); const role = req.user.role; const q = { schoolId: sid(req) }; const box = String(req.query.box || 'all');
  if (role === 'parent') q.parentId = oid(req.user.userId);
  else if (role === 'teacher') { q.staffKind = 'teacher'; q.teacherId = oid(req.user.userId); }
  else if (req.query.scope === 'teachers') q.staffKind = 'teacher'; else if (req.query.scope !== 'all') q.staffKind = 'office';
  if (box === 'closed') q.status = 'closed'; else q.status = 'open';
  if (box === 'waiting') q.waitingOn = 'school';
  if (req.query.studentId && oid(req.query.studentId)) q.studentId = oid(req.query.studentId);
  const term = clean(req.query.q, 60); if (term) { const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; q.$or = [{ studentName: rx }, { parentName: rx }, { subject: rx }]; }
  let rows = await CmThread.find(q).sort({ lastAt: -1 }).skip((p - 1) * l).limit(l); const total = await CmThread.countDocuments(q);
  if (role === 'admin' && req.query.scope === 'teachers') await audit(req, { action: 'comms.thread.browse', entityType: 'CmThread', schoolId: sid(req), detail: { scope: 'teachers' } });
  let list = rows.map((t) => threadView(t, role)); if (box === 'unread') list = list.filter((t) => t.unread);
  res.json({ threads: list, total });
});
exports.startThread = wrap('startThread', async (req, res) => {
  const b = req.body || {}; const role = req.user.role; const text = clean(b.text, 2000); const sub = clean(b.subject, 120);
  if (text.length < 1) return bad(res, 400, 'Write a message first.');
  const st = await Student.findOne({ _id: oid(b.studentId), schoolId: sid(req) }).select('name classId'); if (!st) return bad(res, 404, 'Child not found.');
  let parentId; let kind; let teacher = null;
  if (role === 'parent') {
    parentId = oid(req.user.userId); const sc = await C.parentScope(sid(req), parentId, st._id); if (!sc.ok) return bad(res, 403, 'You cannot message the school about this child.');
    if (b.to === 'office' || !b.to) kind = 'office'; else { kind = 'teacher'; teacher = await Teacher.findOne({ _id: oid(b.to), schoolId: sid(req), isActive: { $ne: false } }).select('name classIds classTeacherOf subjectClassAssignments'); if (!teacher || !C.teachesClass(teacher, st.classId)) return bad(res, 403, 'That teacher does not teach this child.'); }
  } else {
    parentId = oid(b.parentId); if (!parentId) return bad(res, 400, 'Choose who to write to.');
    if (!(await C.canStaffReach(req.user, st))) return bad(res, 403, 'You can write only about children in your classes.');
    const ok = (await G.contactableParents(sid(req), [st._id], 'receiveMessages')).some((x) => String(x._id) === String(parentId));
    if (!ok) return bad(res, 403, 'This family cannot be contacted about this child.');
    if (role === 'teacher') { kind = 'teacher'; teacher = await Teacher.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('name'); } else kind = 'office';
  }
  const par = await Parent.findOne({ _id: parentId, schoolId: sid(req) }).select('name'); if (!par) return bad(res, 404, 'Parent not found.');
  const tkey = `${st._id}:${parentId}:${kind === 'office' ? 'office' : teacher._id}`;
  let t = await CmThread.findOne({ schoolId: sid(req), tkey }); const existed = !!t;
  if (!t) { try { t = await CmThread.create({ schoolId: sid(req), tkey, studentId: st._id, studentName: st.name, parentId, parentName: par.name, staffKind: kind, teacherId: teacher ? teacher._id : null, teacherName: teacher ? teacher.name : '', subject: sub || preview(text), lastAt: new Date() }); } catch (e) { if (e.code === 11000) t = await CmThread.findOne({ schoolId: sid(req), tkey }); else throw e; } }
  req.params = { ...req.params, id: String(t._id) }; req.body = { ...b, text };
  const r = await send(req, t); if (r.error) return bad(res, r.error[0], r.error[1]);
  res.status(existed ? 200 : 201).json({ thread: threadView(await CmThread.findById(t._id), role), message: r.msg, existing: existed });
});
exports.getThread = wrap('getThread', async (req, res) => {
  const a = await threadAccess(req, req.params.id); if (a.code) return bad(res, a.code, a.msg); const t = a.t;
  if (req.user.role === 'admin' && t.staffKind === 'teacher') await audit(req, { action: 'comms.thread.view', entityType: 'CmThread', entityId: t._id, schoolId: sid(req), detail: { teacher: t.teacherName } });
  const me = await C.prefOf(sid(req), roleKey(req.user.role), req.user.userId); const lang = me.lang === 'ur' ? 'ur' : 'en'; const other = lang === 'ur' ? 'en' : 'ur';
  const msgs = await CmMessage.find({ schoolId: sid(req), threadId: t._id }).sort({ createdAt: 1 }).limit(500);
  const scope = req.user.role === 'parent' ? await C.parentScope(sid(req), req.user.userId, t.studentId) : { ok: true };
  res.json({ thread: threadView(t, req.user.role), canWrite: scope.ok && true, lang, messages: msgs.map((m) => ({ _id: m._id, fromRole: m.fromRole, fromName: m.fromName, mine: String(m.fromId) === String(req.user.userId), at: m.createdAt, urgent: m.urgent, removed: !!m.removedAt, removedWhy: m.removedAt ? m.removedWhy : '', text: m.removedAt ? '' : (m[lang] || m[other] || ''), textLang: m[lang] ? lang : (m[other] ? other : lang), alt: m.removedAt ? '' : (m[lang] && m[other] ? m[other] : ''), wrote: m.wrote })) });
});
async function send(req, t) {
  const b = req.body || {}; const role = req.user.role; const now = new Date(); const text = clean(b.text, 2000); const tr = clean(b.translation, 2000);
  if (!text) return { error: [400, 'Write a message first.'] };
  if (role === 'parent') { const sc = await C.parentScope(sid(req), req.user.userId, t.studentId); if (!sc.ok) return { error: [403, 'This conversation is closed by the school.'] }; }
  else if (role === 'teacher') { const st = await Student.findOne({ _id: t.studentId, schoolId: sid(req) }).select('classId'); if (!st || !(await C.canStaffReach(req.user, st))) return { error: [403, 'You can write only about children in your classes.'] }; }
  const ok = (await G.contactableParents(sid(req), [t.studentId], 'receiveMessages')).some((x) => String(x._id) === String(t.parentId));
  if (role !== 'parent' && !ok) return { error: [403, 'This family cannot be contacted about this child.'] };
  const key = clean(b.clientKey, 60) || undefined;
  if (key) { const dup = await CmMessage.findOne({ schoolId: sid(req), threadId: t._id, clientKey: key }); if (dup) return { msg: { _id: dup._id, repeated: true } }; }
  const recent = await CmMessage.countDocuments({ schoolId: sid(req), fromId: oid(req.user.userId), createdAt: { $gte: new Date(Date.now() - 3600000) } });
  if (recent >= 30) return { error: [429, 'You have sent many messages in the last hour. Please wait a little.'] };
  let urgent = false;
  if (b.urgent) { if (role !== 'admin') return { error: [403, 'Only the school office can mark a message urgent.'] }; if (clean(b.urgentReason, 200).length < 3) return { error: [400, 'Say why this message is urgent.'] }; urgent = true; }
  const wrote = URDU.test(text) ? 'ur' : 'en'; const other = wrote === 'ur' ? 'en' : 'ur'; const fromRole = role;
  const m = await CmMessage.create({ schoolId: sid(req), threadId: t._id, fromRole, fromId: oid(req.user.userId), fromName: req.actorName || '', [wrote]: text, [other]: tr, wrote, urgent, urgentReason: urgent ? clean(b.urgentReason, 200) : '', clientKey: key });
  const settings = await C.getSettings(sid(req)); const tz = await K.tzOf(sid(req));
  t.lastAt = now; t.lastPreview = preview(text); t.lastFrom = role === 'parent' ? 'parent' : 'staff'; t.messages += 1; t.status = 'open';
  if (role === 'parent') { t.waitingOn = 'school'; t.replyDueAt = K.addBusinessMinutes(now, settings.threadReplyMinutes, settings, tz); t.overdueAt = null; t.parentReadAt = now; t.staffReadAt = null; }
  else { t.waitingOn = 'family'; t.replyDueAt = null; t.overdueAt = null; t.staffReadAt = now; t.parentReadAt = null; }
  await t.save();
  const to = role === 'parent' ? (t.staffKind === 'teacher' ? [{ role: 'teacher', id: t.teacherId }] : await N.admins(sid(req))) : [{ role: 'parent', id: t.parentId }];
  const from = req.actorName || (role === 'parent' ? t.parentName : 'The school');
  await C.deliver({ schoolId: sid(req), to, title: both(urgent ? 'msg.urgent' : 'msg.new', { from }), body: { en: preview(text), ur: preview(text) }, link: LINK, type: 'message', urgent, kind: 'message', refId: m._id, exclude: oid(req.user.userId) });
  if (urgent) await audit(req, { action: 'comms.message.urgent', entityType: 'CmMessage', entityId: m._id, schoolId: sid(req), detail: { reason: clean(b.urgentReason, 200), thread: t._id } });
  return { msg: { _id: m._id, at: m.createdAt, urgent } };
}
exports.sendMessage = wrap('sendMessage', async (req, res) => {
  const a = await threadAccess(req, req.params.id); if (a.code) return bad(res, a.code, a.msg);
  const r = await send(req, a.t); if (r.error) return bad(res, r.error[0], r.error[1]);
  res.status(r.msg.repeated ? 200 : 201).json({ message: r.msg, thread: threadView(await CmThread.findById(a.t._id), req.user.role) });
});
exports.readThread = wrap('read', async (req, res) => {
  const a = await threadAccess(req, req.params.id); if (a.code) return bad(res, a.code, a.msg);
  if (req.user.role === 'parent') a.t.parentReadAt = new Date(); else a.t.staffReadAt = new Date(); await a.t.save(); res.json({ ok: true });
});
exports.closeThread = wrap('close', async (req, res) => {
  const a = await threadAccess(req, req.params.id); if (a.code) return bad(res, a.code, a.msg);
  a.t.status = 'closed'; a.t.waitingOn = ''; a.t.replyDueAt = null; a.t.overdueAt = null; await a.t.save(); res.json({ thread: threadView(a.t, req.user.role) });
});
exports.reopenThread = wrap('reopen', async (req, res) => {
  const a = await threadAccess(req, req.params.id); if (a.code) return bad(res, a.code, a.msg);
  if (req.user.role === 'parent') { const sc = await C.parentScope(sid(req), req.user.userId, a.t.studentId); if (!sc.ok) return bad(res, 403, 'This conversation is closed by the school.'); }
  a.t.status = 'open'; await a.t.save(); res.json({ thread: threadView(a.t, req.user.role) });
});
exports.removeMessage = wrap('removeMessage', async (req, res) => {
  const why = clean(req.body?.reason, 200); if (why.length < 3) return bad(res, 400, 'Say why this message is being removed.');
  const m = await CmMessage.findOne({ _id: oid(req.params.mid), schoolId: sid(req), threadId: oid(req.params.id) }); if (!m) return bad(res, 404, 'Message not found.');
  if (m.removedAt) return bad(res, 409, 'Already removed.');
  m.removedAt = new Date(); m.removedBy = req.actorName || ''; m.removedWhy = why; await m.save();
  await audit(req, { action: 'comms.message.remove', entityType: 'CmMessage', entityId: m._id, schoolId: sid(req), detail: { reason: why, thread: req.params.id } }); res.json({ ok: true });
});
// Who was told, how, and what happened (admin)
exports.deliveries = wrap('deliveries', async (req, res) => {
  const msgs = await CmMessage.find({ schoolId: sid(req), threadId: oid(req.params.id) }).select('_id'); if (!msgs.length) return res.json({ deliveries: [] });
  const rows = await CmDelivery.find({ schoolId: sid(req), refId: { $in: msgs.map((m) => m._id) } }).sort({ createdAt: -1 }).limit(200);
  res.json({ deliveries: rows.map((r) => ({ _id: r._id, messageId: r.refId, recipientRole: r.recipientRole, channel: r.channel, state: r.state, reason: r.reason, lang: r.lang, deferUntil: r.deferUntil, attempts: r.attempts, sentAt: r.sentAt, bypassedQuiet: r.bypassedQuiet })) });
});

/* ───────── overview and housekeeping ───────── */
const sweeping = new Map();
exports.overview = wrap('overview', async (req, res) => {
  const role = req.user.role; const s = sid(req); const me = oid(req.user.userId); const now = new Date(); const out = {};
  if (role !== 'parent') { const last = sweeping.get(String(s)) || 0; if (Date.now() - last > 60000) { sweeping.set(String(s), Date.now()); require('../utils/comms/sweep').run(s).catch(() => {}); } }
  if (role === 'parent') {
    const ts = await CmThread.find({ schoolId: s, parentId: me, status: 'open' }).select('lastFrom lastAt parentReadAt'); out.unreadThreads = ts.filter((t) => unreadFor(t, 'parent')).length;
    out.ticketsOpen = await CmTicket.countDocuments({ schoolId: s, parentId: me, status: { $in: ['Open', 'In progress', 'Waiting on family'] } });
    out.ticketsWaitingOnMe = await CmTicket.countDocuments({ schoolId: s, parentId: me, status: 'Waiting on family' });
    out.meetings = await CmPtmSlot.countDocuments({ schoolId: s, parentId: me, state: 'Booked', startsAt: { $gte: now } });
  } else {
    const q = role === 'teacher' ? { schoolId: s, staffKind: 'teacher', teacherId: me, status: 'open' } : { schoolId: s, staffKind: 'office', status: 'open' };
    const ts = await CmThread.find(q).select('lastFrom lastAt staffReadAt waitingOn overdueAt'); out.unreadThreads = ts.filter((t) => unreadFor(t, 'staff')).length; out.overdueThreads = ts.filter((t) => t.waitingOn === 'school' && t.overdueAt).length;
    if (role === 'admin') {
      out.ticketsOpen = await CmTicket.countDocuments({ schoolId: s, status: { $in: ['Open', 'In progress'] } }); out.ticketsWaiting = await CmTicket.countDocuments({ schoolId: s, status: 'Waiting on family' });
      out.ticketsBreached = await CmTicket.countDocuments({ schoolId: s, status: { $in: ['Open', 'In progress'] }, breach: { $in: ['first', 'resolve'] } }); out.ticketsUnassigned = await CmTicket.countDocuments({ schoolId: s, status: { $in: ['Open', 'In progress'] }, assigneeId: null });
      out.held = await CmDelivery.countDocuments({ schoolId: s, channel: 'push', state: 'deferred' }); out.failed = await CmDelivery.countDocuments({ schoolId: s, channel: 'push', state: 'failed', attempts: { $lt: 3 } });
    }
    out.meetings = await CmPtmSlot.countDocuments({ schoolId: s, ...(role === 'teacher' ? { teacherId: me } : {}), state: 'Booked', startsAt: { $gte: now } });
  }
  res.json(out);
});
exports.runSweep = wrap('sweep', async (req, res) => res.json(await require('../utils/comms/sweep').run(sid(req))));
