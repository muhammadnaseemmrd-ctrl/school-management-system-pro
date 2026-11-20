// Parent-teacher meetings (PRD E20). An administrator plans the day; publishing makes the slots; a family books one slot per teacher and child.
//   A slot is taken with one conditional write, so two families can never hold the same time. A family cannot hold two meetings at once.
const C = require('../utils/comms/service');
const { T, both } = require('../utils/comms/i18n');
const G = require('../utils/guardianRights');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const CmPtm = require('../models/CmPtm');
const CmPtmSlot = require('../models/CmPtmSlot');

const { oid, sid, bad, wrap, clean, K } = C;
const LINK = { parent: '/parent#/messages', teacher: '/teacher#/familyDesk', admin: '/admin#/familyDesk' };
const DAYKEY = /^\d{4}-\d{2}-\d{2}$/;
const view = (p) => ({ _id: p._id, title: p.title, note: p.note, classIds: p.classIds, teacherIds: p.teacherIds, sessions: p.sessions, slotMinutes: p.slotMinutes, mode: p.mode, place: p.place, opensAt: p.opensAt, closesAt: p.closesAt, maxPerFamily: p.maxPerFamily, cancelHoursBefore: p.cancelHoursBefore, status: p.status, publishedAt: p.publishedAt });
const slotView = (s, forParent) => ({ _id: s._id, ptmId: s.ptmId, teacherId: s.teacherId, teacherName: s.teacherName, startsAt: s.startsAt, endsAt: s.endsAt, state: s.state, studentId: s.studentId, studentName: s.studentName, parentName: forParent ? undefined : s.parentName, parentNote: forParent ? undefined : s.parentNote, teacherNote: forParent ? undefined : s.teacherNote, summary: s.summary, cancelWhy: s.cancelWhy });

async function plan(req, b, settings, tz) {
  const title = clean(b.title, 100); if (title.length < 3) return { error: 'Give the meeting day a title.' };
  const sess = (Array.isArray(b.sessions) ? b.sessions : []).slice(0, 10).map((x) => ({ day: String(x.day || ''), from: String(x.from || ''), to: String(x.to || '') }));
  if (!sess.length) return { error: 'Add at least one session.' };
  const today = (await require('../utils/attendanceOps').clock(sid(req))).dateKey;
  for (const x of sess) { if (!DAYKEY.test(x.day) || x.day < today) return { error: 'Each session needs a date that has not passed.' }; if (!K.HM.test(x.from) || !K.HM.test(x.to) || K.mins(x.from) >= K.mins(x.to)) return { error: 'Each session needs a start time before its end time.' }; if (K.mins(x.to) - K.mins(x.from) > 480) return { error: 'A session can be at most 8 hours.' }; }
  const slotMinutes = Math.round(Number(b.slotMinutes || settings.ptm.slotMinutes)); if (!(slotMinutes >= 5 && slotMinutes <= 30)) return { error: 'A meeting slot is 5 to 30 minutes.' };
  const classIds = [...new Set((Array.isArray(b.classIds) ? b.classIds : []).map(String))].filter((x) => oid(x)); if (!classIds.length) return { error: 'Choose at least one class.' };
  const found = await Class.countDocuments({ _id: { $in: classIds.map(oid) }, schoolId: sid(req) }); if (found !== classIds.length) return { error: 'One of those classes is not in your school.' };
  const opensAt = new Date(b.opensAt); const closesAt = new Date(b.closesAt); if (isNaN(opensAt) || isNaN(closesAt) || closesAt <= opensAt) return { error: 'Booking needs an opening time and a later closing time.' };
  const last = sess.map((x) => K.localToDate(tz, x.day, K.mins(x.to))).sort((a, c) => c - a)[0]; if (closesAt > last) return { error: 'Booking must close before the last session ends.' };
  const mode = ['in-person', 'online', 'phone'].includes(b.mode) ? b.mode : 'in-person'; const place = clean(b.place, 200);
  if (mode === 'online' && place && !/^https:\/\//i.test(place)) return { error: 'An online meeting link must start with https://' };
  const teacherIds = [...new Set((Array.isArray(b.teacherIds) ? b.teacherIds : []).map(String))].filter((x) => oid(x));
  if (teacherIds.length) { const n = await Teacher.countDocuments({ _id: { $in: teacherIds.map(oid) }, schoolId: sid(req) }); if (n !== teacherIds.length) return { error: 'One of those teachers is not in your school.' }; }
  return { doc: { title, note: clean(b.note, 500), classIds: classIds.map(oid), teacherIds: teacherIds.map(oid), sessions: sess.sort((a, c) => (a.day + a.from).localeCompare(c.day + c.from)), slotMinutes, mode, place, opensAt, closesAt, maxPerFamily: Math.max(1, Math.min(20, Math.round(Number(b.maxPerFamily || settings.ptm.maxPerFamily)))), cancelHoursBefore: Math.max(0, Math.min(72, Math.round(Number(b.cancelHoursBefore != null ? b.cancelHoursBefore : settings.ptm.cancelHoursBefore)))) } };
}
exports.create = wrap('ptmCreate', async (req, res) => {
  const s = await C.getSettings(sid(req)); const tz = await K.tzOf(sid(req)); const r = await plan(req, req.body || {}, s, tz); if (r.error) return bad(res, 400, r.error);
  const p = await CmPtm.create({ schoolId: sid(req), ...r.doc, createdByName: req.actorName || '' }); await audit(req, { action: 'comms.ptm.create', entityType: 'CmPtm', entityId: p._id, schoolId: sid(req), detail: { title: p.title } }); res.status(201).json({ ptm: view(p) });
});
exports.update = wrap('ptmUpdate', async (req, res) => {
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p) return bad(res, 404, 'Meeting day not found.');
  const b = req.body || {};
  if (p.status === 'Draft') { const s = await C.getSettings(sid(req)); const tz = await K.tzOf(sid(req)); const r = await plan(req, { ...view(p), ...b }, s, tz); if (r.error) return bad(res, 400, r.error); Object.assign(p, r.doc); }
  else if (p.status === 'Open') { // after publishing only wording and the booking deadline can change; the slots are fixed
    if (b.title) p.title = clean(b.title, 100); if (b.note != null) p.note = clean(b.note, 500); if (b.place != null) { const pl = clean(b.place, 200); if (p.mode === 'online' && pl && !/^https:\/\//i.test(pl)) return bad(res, 400, 'An online meeting link must start with https://'); p.place = pl; }
    if (b.closesAt) { const c = new Date(b.closesAt); if (isNaN(c) || c <= p.opensAt) return bad(res, 400, 'Booking must close after it opens.'); p.closesAt = c; }
  } else return bad(res, 422, 'This meeting day is finished.');
  await p.save(); res.json({ ptm: view(p) });
});
exports.list = wrap('ptmList', async (req, res) => {
  const role = req.user.role; const q = { schoolId: sid(req) }; if (req.query.status && ['Draft', 'Open', 'Closed', 'Cancelled'].includes(req.query.status)) q.status = req.query.status;
  if (role !== 'admin') q.status = { $in: ['Open', 'Closed'] };
  const rows = await CmPtm.find(q).sort({ createdAt: -1 }).limit(50); const ids = rows.map((r) => r._id);
  const slots = ids.length ? await CmPtmSlot.find({ schoolId: sid(req), ptmId: { $in: ids } }).select('ptmId state teacherId parentId') : [];
  const mine = role === 'teacher' ? (x) => String(x.teacherId) === String(req.user.userId) : null;
  res.json({ meetings: rows.map((p) => { const ss = slots.filter((x) => String(x.ptmId) === String(p._id) && (!mine || mine(x))); return { ...view(p), slots: ss.length, booked: ss.filter((x) => ['Booked', 'Done', 'NoShow'].includes(x.state)).length, free: ss.filter((x) => x.state === 'Free').length }; }) });
});
exports.get = wrap('ptmGet', async (req, res) => {
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p) return bad(res, 404, 'Meeting day not found.');
  const slots = await CmPtmSlot.find({ schoolId: sid(req), ptmId: p._id }).select('teacherId teacherName state'); const per = new Map();
  for (const x of slots) { const k = String(x.teacherId); const r = per.get(k) || { teacherId: x.teacherId, teacherName: x.teacherName, free: 0, booked: 0, done: 0, noShow: 0, blocked: 0 }; if (x.state === 'Free') r.free += 1; else if (x.state === 'Booked') r.booked += 1; else if (x.state === 'Done') r.done += 1; else if (x.state === 'NoShow') r.noShow += 1; else r.blocked += 1; per.set(k, r); }
  res.json({ ptm: view(p), teachers: [...per.values()], slots: slots.length });
});
exports.publish = wrap('ptmPublish', async (req, res) => {
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p) return bad(res, 404, 'Meeting day not found.'); if (p.status !== 'Draft') return bad(res, 409, 'Already published.');
  const tz = await K.tzOf(sid(req)); let teachers;
  if (p.teacherIds.length) teachers = await Teacher.find({ _id: { $in: p.teacherIds }, schoolId: sid(req) }).select('name');
  else { const all = await Teacher.find({ schoolId: sid(req), isActive: { $ne: false } }).select('name classIds classTeacherOf subjectClassAssignments'); teachers = all.filter((t) => p.classIds.some((c) => C.teachesClass(t, c))); }
  if (!teachers.length) return bad(res, 422, 'No teacher teaches these classes.');
  const docs = []; for (const t of teachers) for (const x of p.sessions) for (let m = K.mins(x.from); m + p.slotMinutes <= K.mins(x.to); m += p.slotMinutes) docs.push({ schoolId: sid(req), ptmId: p._id, teacherId: t._id, teacherName: t.name, startsAt: K.localToDate(tz, x.day, m), endsAt: K.localToDate(tz, x.day, m + p.slotMinutes), state: 'Free' });
  if (docs.length > 5000) return bad(res, 422, 'That makes too many slots. Use fewer teachers or longer slots.');
  await CmPtmSlot.insertMany(docs, { ordered: false }); p.status = 'Open'; p.publishedAt = new Date(); if (!p.teacherIds.length) p.teacherIds = teachers.map((t) => t._id); await p.save();
  await audit(req, { action: 'comms.ptm.publish', entityType: 'CmPtm', entityId: p._id, schoolId: sid(req), detail: { slots: docs.length, teachers: teachers.length } });
  const kids = await Student.find({ schoolId: sid(req), classId: { $in: p.classIds }, isActive: { $ne: false } }).select('_id'); const parents = await G.contactableParents(sid(req), kids.map((k) => k._id), 'receiveMessages');
  const fmt = (l) => K.fmtWhen(tz, p.closesAt, l);
  await C.deliver({ schoolId: sid(req), to: parents.map((x) => ({ role: 'parent', id: x._id })), title: both('ptm.open'), body: { en: T('ptm.open.body', { title: p.title, closes: fmt('en') }, 'en'), ur: T('ptm.open.body', { title: p.title, closes: fmt('ur') }, 'ur') }, link: LINK, type: 'general', key: `ptm.open:${p._id}`, kind: 'ptm', refId: p._id });
  await C.deliver({ schoolId: sid(req), to: teachers.map((t) => ({ role: 'teacher', id: t._id })), title: { en: `Meeting day published: ${p.title}`, ur: `ملاقات کا دن شائع ہوا: ${p.title}` }, body: { en: 'Open Family messages to see your slots. You can block times you cannot do.', ur: 'اپنے اوقات دیکھنے کے لیے فیملی میسجز کھولیں۔ جو وقت ممکن نہ ہو اسے بلاک کریں۔' }, link: LINK, type: 'general', kind: 'ptm', refId: p._id });
  res.json({ ptm: view(p), slots: docs.length, notified: parents.length });
});
exports.close = wrap('ptmClose', async (req, res) => {
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p) return bad(res, 404, 'Meeting day not found.'); if (p.status !== 'Open') return bad(res, 422, 'Only an open meeting day can be closed.');
  p.status = 'Closed'; await p.save(); res.json({ ptm: view(p) });
});
exports.cancelDay = wrap('ptmCancel', async (req, res) => {
  const why = clean(req.body?.reason, 200); if (why.length < 3) return bad(res, 400, 'Say why the meeting day is cancelled.');
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p) return bad(res, 404, 'Meeting day not found.'); if (p.status === 'Cancelled') return bad(res, 409, 'Already cancelled.');
  const tz = await K.tzOf(sid(req)); const booked = await CmPtmSlot.find({ schoolId: sid(req), ptmId: p._id, state: 'Booked' });
  await CmPtmSlot.updateMany({ schoolId: sid(req), ptmId: p._id, state: { $in: ['Free', 'Booked'] } }, { $set: { state: 'Cancelled', cancelledBy: 'school', cancelWhy: why } }); p.status = 'Cancelled'; await p.save();
  for (const x of booked) await C.deliver({ schoolId: sid(req), to: [{ role: 'parent', id: x.parentId }], title: both('ptm.cancelled'), body: { en: T('ptm.cancelled.body', { teacher: x.teacherName, when: K.fmtWhen(tz, x.startsAt, 'en'), why }, 'en'), ur: T('ptm.cancelled.body', { teacher: x.teacherName, when: K.fmtWhen(tz, x.startsAt, 'ur'), why }, 'ur') }, link: LINK, type: 'general', kind: 'ptm', refId: x._id });
  await audit(req, { action: 'comms.ptm.cancel', entityType: 'CmPtm', entityId: p._id, schoolId: sid(req), detail: { why, families: booked.length } }); res.json({ ptm: view(p), told: booked.length });
});

/* ── staff: slots ── */
exports.slots = wrap('ptmSlots', async (req, res) => {
  const q = { schoolId: sid(req), ptmId: oid(req.params.id) }; if (req.user.role === 'teacher') q.teacherId = oid(req.user.userId); else if (req.query.teacherId && oid(req.query.teacherId)) q.teacherId = oid(req.query.teacherId);
  if (req.query.state) q.state = String(req.query.state);
  const rows = await CmPtmSlot.find(q).sort({ startsAt: 1, teacherName: 1 }).limit(1500); res.json({ slots: rows.map((x) => slotView(x, false)) });
});
async function slotFor(req, id) {
  const x = await CmPtmSlot.findOne({ _id: oid(id), schoolId: sid(req) }); if (!x) return { code: 404, msg: 'Slot not found.' };
  if (req.user.role === 'teacher' && String(x.teacherId) !== String(req.user.userId)) return { code: 404, msg: 'Slot not found.' };
  if (req.user.role === 'parent' && String(x.parentId || '') !== String(req.user.userId)) return { code: 404, msg: 'Slot not found.' };
  return { x };
}
exports.block = wrap('ptmBlock', async (req, res) => {
  const a = await slotFor(req, req.params.sid); if (a.code) return bad(res, a.code, a.msg); if (a.x.state === 'Booked') return bad(res, 409, 'A family has booked this time. Cancel it with a reason first.'); if (!['Free', 'Blocked'].includes(a.x.state)) return bad(res, 422, 'This time cannot be changed.');
  const p = await CmPtm.findById(a.x.ptmId); if (!p || p.status !== 'Open') return bad(res, 422, 'This meeting day is not open.');
  const to = req.path.endsWith('/unblock') ? 'Free' : 'Blocked'; const r = await CmPtmSlot.updateOne({ _id: a.x._id, state: { $in: ['Free', 'Blocked'] } }, { $set: { state: to } }); if (!r.matchedCount) return bad(res, 409, 'A family just booked this time.'); res.json({ slot: { _id: a.x._id, state: to } });
});
exports.cancel = wrap('ptmCancelSlot', async (req, res) => {
  const a = await slotFor(req, req.params.sid); if (a.code) return bad(res, a.code, a.msg); const x = a.x; const role = req.user.role; const tz = await K.tzOf(sid(req)); const p = await CmPtm.findById(x.ptmId);
  if (x.state !== 'Booked') return bad(res, 422, 'This time is not booked.'); const why = clean(req.body?.reason, 200);
  if (role === 'parent') {
    if (new Date(x.startsAt) <= new Date()) return bad(res, 409, 'This meeting has already started.');
    if (Date.now() > new Date(x.startsAt).getTime() - (p ? p.cancelHoursBefore : 4) * 3600000) return bad(res, 409, 'It is too close to the meeting to cancel here. Please message the teacher.');
    const r = await CmPtmSlot.updateOne({ _id: x._id, state: 'Booked', parentId: x.parentId }, { $set: { state: 'Free', studentId: null, studentName: '', parentId: null, parentName: '', parentNote: '', bookedAt: null, remindedAt: null } }); if (!r.matchedCount) return bad(res, 409, 'Already changed.');
    await C.deliver({ schoolId: sid(req), to: [{ role: 'teacher', id: x.teacherId }], title: { en: `A meeting was cancelled by the family (${x.studentName})`, ur: `خاندان نے ملاقات منسوخ کر دی (${x.studentName})` }, body: { en: K.fmtWhen(tz, x.startsAt, 'en'), ur: K.fmtWhen(tz, x.startsAt, 'ur') }, link: LINK, type: 'general', kind: 'ptm', refId: x._id });
    return res.json({ ok: true });
  }
  if (why.length < 3) return bad(res, 400, 'Say why the meeting is cancelled. The family is told.');
  await CmPtmSlot.updateOne({ _id: x._id, state: 'Booked' }, { $set: { state: 'Cancelled', cancelledBy: role, cancelWhy: why } });
  await C.deliver({ schoolId: sid(req), to: [{ role: 'parent', id: x.parentId }], title: both('ptm.cancelled'), body: { en: T('ptm.cancelled.body', { teacher: x.teacherName, when: K.fmtWhen(tz, x.startsAt, 'en'), why }, 'en'), ur: T('ptm.cancelled.body', { teacher: x.teacherName, when: K.fmtWhen(tz, x.startsAt, 'ur'), why }, 'ur') }, link: LINK, type: 'general', kind: 'ptm', refId: x._id });
  await audit(req, { action: 'comms.ptm.slot.cancel', entityType: 'CmPtmSlot', entityId: x._id, schoolId: sid(req), detail: { why } }); res.json({ ok: true });
});
const finish = (state) => wrap(`ptm_${state}`, async (req, res) => {
  const a = await slotFor(req, req.params.sid); if (a.code) return bad(res, a.code, a.msg); const x = a.x;
  if (!['Booked', 'Done', 'NoShow'].includes(x.state)) return bad(res, 422, 'This time was not booked.'); if (new Date(x.startsAt) > new Date()) return bad(res, 422, 'The meeting has not started yet.');
  const summary = clean(req.body?.summary, 600); const note = clean(req.body?.teacherNote, 1000); const was = x.summary;
  x.state = state; if (req.body?.teacherNote != null) x.teacherNote = note; if (state === 'Done' && req.body?.summary != null) x.summary = summary; await x.save();
  if (state === 'Done' && summary && summary !== was) await C.deliver({ schoolId: sid(req), to: [{ role: 'parent', id: x.parentId }], title: both('ptm.summary'), body: { en: summary, ur: summary }, link: LINK, type: 'general', kind: 'ptm', refId: x._id });
  res.json({ slot: slotView(x, false) });
});
exports.done = finish('Done'); exports.noshow = finish('NoShow');
async function familiesOf(req, p) {
  const kids = await Student.find({ schoolId: sid(req), classId: { $in: p.classIds }, isActive: { $ne: false } }).select('name classId'); const parents = await G.contactableParents(sid(req), kids.map((k) => k._id), 'receiveMessages');
  const booked = new Set((await CmPtmSlot.find({ schoolId: sid(req), ptmId: p._id, parentId: { $ne: null }, state: { $in: ['Booked', 'Done', 'NoShow'] } }).select('parentId')).map((x) => String(x.parentId)));
  return { kids, parents, booked, left: parents.filter((x) => !booked.has(String(x._id))) };
}
exports.unbooked = wrap('ptmUnbooked', async (req, res) => {
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p) return bad(res, 404, 'Meeting day not found.'); const f = await familiesOf(req, p);
  res.json({ families: f.left.slice(0, 500).map((x) => ({ _id: x._id, name: x.name, children: f.kids.filter((k) => (x.children || []).map(String).includes(String(k._id))).map((k) => k.name) })), total: f.left.length, bookedFamilies: f.booked.size });
});
exports.nudge = wrap('ptmNudge', async (req, res) => {
  const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p || p.status !== 'Open') return bad(res, 422, 'Only an open meeting day can be nudged.');
  const f = await familiesOf(req, p); const tz = await K.tzOf(sid(req)); const day = new Date().toISOString().slice(0, 10);
  await C.deliver({ schoolId: sid(req), to: f.left.map((x) => ({ role: 'parent', id: x._id })), title: both('ptm.nudge'), body: { en: T('ptm.open.body', { title: p.title, closes: K.fmtWhen(tz, p.closesAt, 'en') }, 'en'), ur: T('ptm.open.body', { title: p.title, closes: K.fmtWhen(tz, p.closesAt, 'ur') }, 'ur') }, link: LINK, type: 'general', key: `ptm.nudge:${p._id}:${day}`, kind: 'ptm', refId: p._id });
  res.json({ told: f.left.length });
});

/* ── family ── */
exports.familyList = wrap('ptmFamily', async (req, res) => {
  const me = oid(req.user.userId); const par = await Parent.findOne({ _id: me, schoolId: sid(req) }).select('children'); if (!par) return res.json({ meetings: [], mine: [] });
  const kids = await Student.find({ _id: { $in: par.children || [] }, schoolId: sid(req), isActive: { $ne: false } }).select('name classId'); const rights = await G.resolveForParent(sid(req), par, kids.map((k) => k._id)); const ok = kids.filter((k) => { const r = rights.get(String(k._id)); return r && r.linked && r.rights.receiveMessages; });
  const pt = ok.length ? (await CmPtm.find({ schoolId: sid(req), status: 'Open' }).sort({ closesAt: 1 }).limit(30)).filter((p) => ok.some((k) => p.classIds.map(String).includes(String(k.classId)))) : [];
  const mine = await CmPtmSlot.find({ schoolId: sid(req), parentId: me }).sort({ startsAt: 1 }).limit(100); const now = new Date();
  res.json({ meetings: pt.map((p) => ({ ...view(p), children: ok.filter((k) => p.classIds.map(String).includes(String(k.classId))).map((k) => ({ _id: k._id, name: k.name })), booking: now >= p.opensAt && now <= p.closesAt })), mine: mine.map((x) => slotView(x, true)) });
});
exports.familySlots = wrap('ptmFamilySlots', async (req, res) => {
  const me = oid(req.user.userId); const p = await CmPtm.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!p || p.status !== 'Open') return bad(res, 404, 'Meeting day not found.');
  const st = await Student.findOne({ _id: oid(req.query.studentId), schoolId: sid(req) }).select('name classId'); if (!st || !p.classIds.map(String).includes(String(st.classId))) return bad(res, 404, 'This meeting day is not for that child.');
  const sc = await C.parentScope(sid(req), me, st._id); if (!sc.ok) return bad(res, 403, 'You cannot book meetings about this child.');
  const ts = (await C.teachersOfClass(sid(req), st.classId)).filter((t) => p.teacherIds.map(String).includes(String(t._id)));
  const rows = await CmPtmSlot.find({ schoolId: sid(req), ptmId: p._id, teacherId: { $in: ts.map((t) => t._id) } }).sort({ startsAt: 1 }).limit(3000);
  const now = new Date(); const keep = rows.filter((x) => (x.state === 'Free' && new Date(x.startsAt) > now) || (String(x.parentId || '') === String(me) && String(x.studentId || '') === String(st._id) && x.state === 'Booked'));
  res.json({ student: { _id: st._id, name: st.name }, open: now >= p.opensAt && now <= p.closesAt, mode: p.mode, place: p.place, teachers: ts.map((t) => ({ _id: t._id, name: t.name, slots: keep.filter((x) => String(x.teacherId) === String(t._id)).map((x) => ({ _id: x._id, startsAt: x.startsAt, endsAt: x.endsAt, state: x.state === 'Free' ? 'Free' : 'Mine' })) })) });
});
exports.book = wrap('ptmBook', async (req, res) => {
  const me = oid(req.user.userId); const s = sid(req); const x = await CmPtmSlot.findOne({ _id: oid(req.params.sid), schoolId: s }); if (!x) return bad(res, 404, 'That time was not found.');
  const p = await CmPtm.findOne({ _id: x.ptmId, schoolId: s }); const now = new Date(); if (!p || p.status !== 'Open' || now < p.opensAt || now > p.closesAt) return bad(res, 422, 'Booking is not open for this meeting day.');
  if (new Date(x.startsAt) <= now) return bad(res, 422, 'That time has passed.');
  const st = await Student.findOne({ _id: oid(req.body?.studentId), schoolId: s }).select('name classId'); if (!st || !p.classIds.map(String).includes(String(st.classId))) return bad(res, 404, 'This meeting day is not for that child.');
  const sc = await C.parentScope(s, me, st._id); if (!sc.ok) return bad(res, 403, 'You cannot book meetings about this child.');
  const teacher = await Teacher.findOne({ _id: x.teacherId, schoolId: s }).select('classIds classTeacherOf subjectClassAssignments'); if (!teacher || !C.teachesClass(teacher, st.classId)) return bad(res, 403, 'That teacher does not teach this child.');
  const same = await CmPtmSlot.countDocuments({ schoolId: s, ptmId: p._id, teacherId: x.teacherId, parentId: me, studentId: st._id, state: { $in: ['Booked', 'Done'] } }); if (same) return bad(res, 409, `You already have a meeting with ${x.teacherName} about ${st.name}.`);
  const mineAll = await CmPtmSlot.find({ schoolId: s, ptmId: p._id, parentId: me, state: { $in: ['Booked', 'Done', 'NoShow'] } }).select('startsAt endsAt'); if (mineAll.length >= p.maxPerFamily) return bad(res, 409, `You can book up to ${p.maxPerFamily} meetings.`);
  if (mineAll.some((o) => o.startsAt < x.endsAt && o.endsAt > x.startsAt)) return bad(res, 409, 'You already have a meeting at that time.');
  const par = await Parent.findOne({ _id: me, schoolId: s }).select('name');
  const r = await CmPtmSlot.updateOne({ _id: x._id, schoolId: s, state: 'Free' }, { $set: { state: 'Booked', studentId: st._id, studentName: st.name, parentId: me, parentName: par ? par.name : '', bookedAt: now, parentNote: clean(req.body?.note, 300), remindedAt: null } });
  if (!r.matchedCount) return bad(res, 409, 'That time was just taken. Please choose another.');
  const tz = await K.tzOf(s);
  await C.deliver({ schoolId: s, to: [{ role: 'parent', id: me }], title: both('ptm.booked', { teacher: x.teacherName }), body: { en: `${K.fmtWhen(tz, x.startsAt, 'en')}${p.place ? ` · ${p.place}` : ''}`, ur: `${K.fmtWhen(tz, x.startsAt, 'ur')}${p.place ? ` · ${p.place}` : ''}` }, link: LINK, type: 'general', kind: 'ptm', refId: x._id });
  await C.deliver({ schoolId: s, to: [{ role: 'teacher', id: x.teacherId }], title: both('ptm.booked.staff', { student: st.name }), body: { en: K.fmtWhen(tz, x.startsAt, 'en'), ur: K.fmtWhen(tz, x.startsAt, 'ur') }, link: LINK, type: 'general', kind: 'ptm', refId: x._id });
  res.status(201).json({ slot: slotView(await CmPtmSlot.findById(x._id), true), place: p.place, mode: p.mode });
});
