// Nursery rooms, who is in them, check-in and check-out, and the staff-to-child ratio (PRD E15: CAP-0270, CAP-0272).
//   403 refused (a refused pickup never says why) · 404 not yours · 409 already done · 422 not possible in this state
const E = require('../utils/early/service');
const S9 = require('../utils/safety');
const G = require('../utils/guardianRights');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const GuardianLink = require('../models/GuardianLink');
const PickupAuthorization = require('../models/PickupAuthorization');
const PickupEvent = require('../models/PickupEvent');
const EyRoom = require('../models/EyRoom');
const EyPlacement = require('../models/EyPlacement');
const EyDay = require('../models/EyDay');
const EyPresence = require('../models/EyPresence');
const EyProfile = require('../models/EyProfile');
const EyCare = require('../models/EyCare');
const EyPost = require('../models/EyPost');
const EyPickupChange = require('../models/EyPickupChange');
const EyRatioEvent = require('../models/EyRatioEvent');

const { oid, sid, who, bad, wrap, clean } = E;
const REFUSE = 'Do not release the child. Ask the person to wait and call the principal.';   // the same words for every refusal, whatever the cause
const hhmm = (d) => `${String(new Date(d).getUTCHours()).padStart(2, '0')}:${String(new Date(d).getUTCMinutes()).padStart(2, '0')}`;
const key = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const SEV = { mild: 1, moderate: 2, severe: 3 };

/* ───────── settings ───────── */
exports.getSettings = wrap('settings', async (req, res) => res.json({ settings: await E.getSettings(sid(req)), bands: E.BANDS }));
exports.putSettings = wrap('putSettings', async (req, res) => {
  const b = req.body || {}; const cur = await E.getSettings(sid(req)); const next = { ...cur, ratios: { ...cur.ratios } };
  if (b.ratios !== undefined) for (const band of Object.keys(E.BANDS)) if (b.ratios[band] !== undefined) { const n = Number(b.ratios[band]); if (!Number.isInteger(n) || n < 1 || n > 30) return bad(res, 400, `The number of children per adult for ${E.BANDS[band]} must be a whole number from 1 to 30.`); next.ratios[band] = n; }
  const nums = { napAlertMinutes: [30, 600], photoMaxKb: [100, 1500] };
  for (const [k, [lo, hi]] of Object.entries(nums)) if (b[k] !== undefined) { const n = Number(b[k]); if (!Number.isInteger(n) || n < lo || n > hi) return bad(res, 400, `${k} must be a whole number from ${lo} to ${hi}.`); next[k] = n; }
  for (const k of ['notifyOnCheckIn', 'notifyOnCheckOut', 'wellnessLookAtArrival', 'diaryNeedsReview']) if (b[k] !== undefined) next[k] = !!b[k];
  if (b.absenceAskAfter !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.absenceAskAfter))) return bad(res, 400, 'Give the time as HH:MM.'); next.absenceAskAfter = b.absenceAskAfter; }
  if (next.diaryNeedsReview === false) return bad(res, 400, 'A diary must be looked at by a second person before families see it. This cannot be turned off.');
  await E.putSettings(sid(req), next); await audit(req, { action: 'early.settings', entityType: 'AppSetting', entityId: 'early', schoolId: sid(req), detail: { before: cur, after: next } });
  res.json({ settings: next });
});

/* ───────── rooms ───────── */
async function staffNames(ids) { const t = await Teacher.find({ _id: { $in: ids.filter(Boolean) } }).select('name'); return new Map(t.map((x) => [String(x._id), x.name])); }
async function roomView(req, r, st, day) {
  const [placed, ratio, names] = await Promise.all([EyPlacement.countDocuments({ schoolId: sid(req), roomId: r._id, to: null }), E.ratioOf(req.user.schoolId, r, st), staffNames([r.leadId, ...(r.staffIds || [])])]);
  return { _id: r._id, name: r.name, ageBand: r.ageBand, bandLabel: E.BANDS[r.ageBand], capacity: r.capacity, ratio: r.ratio || 0, perAdult: E.allowedChildren(r, st), active: r.active, notes: r.notes, lead: r.leadId ? { _id: r.leadId, name: names.get(String(r.leadId)) || '' } : null, staff: (r.staffIds || []).map((i) => ({ _id: i, name: names.get(String(i)) || '' })), placed, status: ratio };
}
exports.listRooms = wrap('rooms', async (req, res) => {
  const scope = await E.scopeOf(req); const st = await E.getSettings(sid(req)); const day = await E.today(req.user.schoolId);
  const q = { schoolId: sid(req) }; if (req.query.all !== '1') q.active = true; if (!scope.admin) q._id = { $in: [...scope.rooms].map(E.oid) };
  const rooms = await EyRoom.find(q).sort({ name: 1 }).limit(100);
  res.json({ day, rooms: await Promise.all(rooms.map((r) => roomView(req, r, st, day))), admin: scope.admin });
});
async function checkStaff(req, ids) { const list = [...new Set((ids || []).map(String))].map(E.oid).filter(Boolean); if (!list.length) return []; const n = await Teacher.countDocuments({ schoolId: sid(req), _id: { $in: list } }); return n === list.length ? list : null; }
async function saveRoom(req, res, room) {
  const b = req.body || {}; const isNew = !room;
  const name = b.name !== undefined || isNew ? clean(b.name, 60) : room.name; if (!name) return bad(res, 400, 'Give the room a name.');
  const band = b.ageBand !== undefined ? b.ageBand : room?.ageBand || 'preschool'; if (!E.BANDS[band]) return bad(res, 400, 'Choose an age group from the list.');
  const cap = b.capacity !== undefined ? Number(b.capacity) : room?.capacity ?? 12; if (!Number.isInteger(cap) || cap < 1 || cap > 60) return bad(res, 400, 'Capacity must be a whole number from 1 to 60.');
  const ratio = b.ratio !== undefined ? Number(b.ratio) : room?.ratio || 0; if (!Number.isInteger(ratio) || ratio < 0 || ratio > 30) return bad(res, 400, 'Children per adult must be 0 (use the school value) or a whole number up to 30.');
  let staff = b.staffIds !== undefined ? await checkStaff(req, b.staffIds) : (room?.staffIds || []); if (staff === null) return bad(res, 400, 'One of the carers is not on your staff list.');
  let lead = b.leadId !== undefined ? E.oid(b.leadId) : room?.leadId || null; if (b.leadId !== undefined && b.leadId && !lead) return bad(res, 400, 'Choose the room lead from your teachers.');
  if (lead) { if (!(await Teacher.countDocuments({ _id: lead, schoolId: sid(req) }))) return bad(res, 400, 'The room lead is not on your staff list.'); if (!staff.map(String).includes(String(lead))) staff = [...staff, lead]; }
  const dup = await EyRoom.findOne({ schoolId: sid(req), nameKey: key(name), ...(room ? { _id: { $ne: room._id } } : {}) }); if (dup) return bad(res, 409, 'There is already a room with that name.');
  const vals = { name, nameKey: key(name), ageBand: band, capacity: cap, ratio, staffIds: staff, leadId: lead || undefined, notes: b.notes !== undefined ? clean(b.notes, 300) : room?.notes || '' };
  let r;
  if (room) { Object.assign(room, vals); if (!lead) room.leadId = undefined; r = await room.save(); } else r = await EyRoom.create({ schoolId: sid(req), ...vals });
  await audit(req, { action: isNew ? 'early.room.create' : 'early.room.update', entityType: 'EyRoom', entityId: r._id, schoolId: sid(req), detail: vals });
  res.status(isNew ? 201 : 200).json({ room: await roomView(req, r, await E.getSettings(sid(req))) });
}
exports.createRoom = wrap('createRoom', (req, res) => saveRoom(req, res, null));
exports.updateRoom = wrap('updateRoom', async (req, res) => { const room = E.oid(req.params.id) ? await EyRoom.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!room) return bad(res, 404, 'That room is not in your school.'); return saveRoom(req, res, room); });
exports.archiveRoom = wrap('archiveRoom', async (req, res) => {
  const room = E.oid(req.params.id) ? await EyRoom.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!room) return bad(res, 404, 'That room is not in your school.');
  if (await EyPlacement.countDocuments({ schoolId: sid(req), roomId: room._id, to: null })) return bad(res, 409, 'Move the children to another room first.');
  room.active = false; await room.save(); await audit(req, { action: 'early.room.archive', entityType: 'EyRoom', entityId: room._id, schoolId: sid(req) }); res.json({ ok: true });
});

/* ───────── children in rooms ───────── */
exports.searchChildren = wrap('search', async (req, res) => {
  const q = clean(req.query.q, 60); const filter = { schoolId: sid(req), isActive: { $ne: false } };
  if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const rows = await Student.find(filter).select('name studentId dateOfBirth classId').sort({ name: 1 }).limit(30);
  const placed = new Map((await EyPlacement.find({ schoolId: sid(req), childId: { $in: rows.map((r) => r._id) }, to: null })).map((p) => [String(p.childId), p]));
  const rooms = new Map((await EyRoom.find({ schoolId: sid(req) }).select('name')).map((r) => [String(r._id), r.name]));
  res.json({ children: rows.map((s) => ({ _id: s._id, name: s.name, studentId: s.studentId, age: E.ageLabel(E.ageMonths(s.dateOfBirth)), room: placed.has(String(s._id)) ? rooms.get(String(placed.get(String(s._id)).roomId)) : '' })) });
});
async function place(req, child, room, note) {
  const cur = await E.placementOf(sid(req), child._id);
  if (cur) { if (String(cur.roomId) === String(room._id)) return 'same'; cur.to = new Date(); await cur.save(); }
  await EyPlacement.create({ schoolId: sid(req), childId: child._id, roomId: room._id, byName: req.actorName || '', note: clean(note, 200) });
  await EyProfile.updateOne({ schoolId: sid(req), childId: child._id }, { $setOnInsert: { schoolId: sid(req), childId: child._id } }, { upsert: true });
  return cur ? 'moved' : 'placed';
}
exports.addChildren = wrap('addChildren', async (req, res) => {
  const room = E.oid(req.params.id) ? await EyRoom.findOne({ _id: req.params.id, schoolId: sid(req), active: true }) : null; if (!room) return bad(res, 404, 'That room is not in your school.');
  const ids = [...new Set((req.body?.childIds || []).map(String))].filter((x) => E.oid(x)); if (!ids.length || ids.length > 60) return bad(res, 400, 'Choose between 1 and 60 children.');
  const kids = await Student.find({ schoolId: sid(req), _id: { $in: ids.map(E.oid) } }).select('name'); if (kids.length !== ids.length) return bad(res, 404, 'One of those children is not in your school.');
  const out = { placed: 0, moved: 0, same: 0 }; for (const c of kids) out[await place(req, c, room, req.body?.note)] += 1;
  await audit(req, { action: 'early.place', entityType: 'EyRoom', entityId: room._id, schoolId: sid(req), detail: { ...out, count: ids.length } }); res.json(out);
});
exports.removeChild = wrap('removeChild', async (req, res) => {
  const pl = await E.placementOf(sid(req), req.params.id); if (!pl) return bad(res, 404, 'That child is not placed in a nursery room.');
  if (await EyDay.findOne({ schoolId: sid(req), childId: pl.childId, day: await E.today(req.user.schoolId), status: 'In' })) return bad(res, 422, 'The child is here today. Check them out first.');
  pl.to = new Date(); pl.note = clean(req.body?.note, 200); await pl.save(); await audit(req, { action: 'early.unplace', entityType: 'Student', entityId: pl.childId, schoolId: sid(req) }); res.json({ ok: true });
});

/* ───────── the room today ───────── */
async function rosterOf(req, room, day) {
  const placements = await EyPlacement.find({ schoolId: sid(req), roomId: room._id, to: null }); const ids = placements.map((p) => p.childId);
  const [kids, days, profiles] = await Promise.all([Student.find({ _id: { $in: ids } }).select('name dateOfBirth studentId photo'), EyDay.find({ schoolId: sid(req), roomId: room._id, day }), EyProfile.find({ schoolId: sid(req), childId: { $in: ids } }).select('childId allergies medicalAlert consent supports')]);
  const dm = new Map(days.map((d) => [String(d.childId), d])); const pm = new Map(profiles.map((p) => [String(p.childId), p]));
  return kids.sort((a, b) => a.name.localeCompare(b.name)).map((k) => {
    const d = dm.get(String(k._id)); const p = pm.get(String(k._id)); const worst = (p?.allergies || []).reduce((m, a) => Math.max(m, SEV[a.severity] || 0), 0);
    return { _id: k._id, name: k.name, studentId: k.studentId, age: E.ageLabel(E.ageMonths(k.dateOfBirth)), status: d?.status || 'Expected', inAt: d?.inAt, outAt: d?.outAt, inFlag: d?.inFlag || '', collector: d?.status === 'Out' ? d.outTo?.name : '', allergy: worst ? Object.keys(SEV).find((s) => SEV[s] === worst) : '', alert: !!p?.medicalAlert, photos: !!p?.consent?.photos, hasSupports: (p?.supports || []).length > 0 };
  });
}
exports.getRoom = wrap('getRoom', async (req, res) => {
  const r = await E.roomFor(req, req.params.id); if (r.error) return bad(res, ...r.error); const day = E.isDay(req.query.day) ? req.query.day : await E.today(req.user.schoolId); const st = await E.getSettings(sid(req));
  const [children, carers] = await Promise.all([rosterOf(req, r.room, day), EyPresence.find({ schoolId: sid(req), roomId: r.room._id, outAt: null })]);
  res.json({ room: await roomView(req, r.room, st, day), day, children, present: carers.map((c) => ({ staffId: c.staffId, name: c.staffName, since: c.inAt })), counts: { expected: children.length, in: children.filter((c) => c.status === 'In').length, out: children.filter((c) => c.status === 'Out').length, absent: children.filter((c) => c.status === 'Absent').length } });
});

/* ───────── carers in the room ───────── */
async function presence(req, res, going) {
  const r = await E.roomFor(req, req.params.id); if (r.error) return bad(res, ...r.error);
  let staffId = req.user.role === 'teacher' ? E.oid(req.user.userId) : E.oid(req.body?.staffId); if (!staffId) return bad(res, 400, 'Choose which carer.');
  if (!(r.room.staffIds || []).map(String).includes(String(staffId))) return bad(res, 422, 'That carer is not on this room\'s team.');
  const t = await Teacher.findOne({ _id: staffId, schoolId: sid(req) }).select('name'); const day = await E.today(req.user.schoolId); const touched = [r.room];
  if (going === 'in') {
    const live = await EyPresence.find({ schoolId: sid(req), staffId, outAt: null });
    if (live.some((p) => String(p.roomId) === String(r.room._id))) return bad(res, 409, 'Already in this room.');
    for (const p of live) { p.outAt = new Date(); await p.save(); const other = await EyRoom.findOne({ _id: p.roomId, schoolId: sid(req) }); if (other) touched.push(other); }
    await EyPresence.create({ schoolId: sid(req), roomId: r.room._id, staffId, staffName: t?.name || '', day });
  } else {
    const p = await EyPresence.findOne({ schoolId: sid(req), roomId: r.room._id, staffId, outAt: null }); if (!p) return bad(res, 409, 'Not in this room.');
    p.outAt = new Date(); await p.save();
  }
  const status = []; for (const rm of touched) status.push(await E.settleRatio(req.user.schoolId, rm)); res.json({ ok: true, ratio: status[0], others: status.slice(1) });
}
exports.presenceIn = wrap('presenceIn', (req, res) => presence(req, res, 'in')); exports.presenceOut = wrap('presenceOut', (req, res) => presence(req, res, 'out'));

exports.ratios = wrap('ratios', async (req, res) => {
  const scope = await E.scopeOf(req); const st = await E.getSettings(sid(req)); const q = { schoolId: sid(req), active: true }; if (!scope.admin) q._id = { $in: [...scope.rooms].map(E.oid) };
  const rooms = await EyRoom.find(q).sort({ name: 1 }); const rows = []; for (const r of rooms) rows.push(await E.ratioOf(req.user.schoolId, r, st));
  const open = scope.admin ? await EyRatioEvent.find({ schoolId: sid(req), endedAt: null }).sort({ startedAt: -1 }).limit(20) : [];
  res.json({ rooms: rows, open: open.map((e) => ({ _id: e._id, roomName: e.roomName, kind: e.kind, startedAt: e.startedAt, children: e.children, staff: e.staff, allowedChildren: e.allowedChildren })), allOk: rows.every((r) => r.ok) });
});
exports.ratioEvents = wrap('ratioEvents', async (req, res) => {
  const { p, l } = E.pg(req.query); const q = { schoolId: sid(req) }; if (E.isDay(req.query.from)) q.day = { $gte: req.query.from }; if (E.isDay(req.query.to)) q.day = { ...(q.day || {}), $lte: req.query.to };
  const [rows, total] = await Promise.all([EyRatioEvent.find(q).sort({ startedAt: -1 }).skip((p - 1) * l).limit(l), EyRatioEvent.countDocuments(q)]);
  res.json({ events: rows, total });
});
exports.ackRatio = wrap('ackRatio', async (req, res) => {
  const ev = E.oid(req.params.id) ? await EyRatioEvent.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!ev) return bad(res, 404, 'That record is not in your school.');
  const note = clean(req.body?.note, 300); if (note.length < 3) return bad(res, 400, 'Write what was done.'); ev.ackById = E.oid(req.user.userId); ev.ackByName = req.actorName || ''; ev.ackAt = new Date(); ev.note = note; await ev.save(); res.json({ ok: true });
});

/* ───────── arrival and departure ───────── */
// Who could collect this child right now. A restricted person is simply absent from the list, with no reason.
async function collectorsOf(req, childId) {
  const sidv = sid(req); const links = await GuardianLink.find({ schoolId: sidv, studentId: E.oid(childId) }); const out = []; const seen = new Set();
  const parents = await Parent.find({ schoolId: sidv, children: E.oid(childId), isActive: { $ne: false } }).select('name');
  for (const p of parents) { const d = await G.pickupDecision(sidv, childId, { parentId: p._id }); if (d.decision === 'Authorised') { out.push({ kind: 'parent', parentId: p._id, name: p.name, relationship: d.relationship || 'Guardian' }); seen.add(`p:${p._id}`); } }
  for (const l of links.filter((x) => !x.parentId && x.personName)) { if (seen.has(`n:${key(l.personName)}`)) continue; const d = await G.pickupDecision(sidv, childId, { personName: l.personName }); if (d.decision === 'Authorised') { out.push({ kind: 'named', name: l.personName, relationship: l.relationship || 'Authorised person', phone: l.phone || '' }); seen.add(`n:${key(l.personName)}`); } }
  return out;
}
exports.collectors = wrap('collectors', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error);
  const day = await E.today(req.user.schoolId); const auths = await PickupAuthorization.find({ schoolId: sid(req), studentId: c.child._id, day, status: 'Active' }).select('personName relationship');
  res.json({ collectors: await collectorsOf(req, c.child._id), oneDay: auths.map((a) => ({ name: a.personName, relationship: a.relationship })) });
});

exports.checkIn = wrap('checkIn', async (req, res) => {
  const c = await E.childIn(req, req.body?.childId); if (c.error) return bad(res, ...c.error);
  const day = await E.today(req.user.schoolId); const st = await E.getSettings(sid(req)); const b = req.body || {}; const sg = b.signedBy || {};
  let by = { name: clean(sg.name, 80), relationship: clean(sg.relationship, 40), basis: '', idChecked: false };
  if (sg.parentId) {
    const p = await Parent.findOne({ _id: E.oid(sg.parentId), schoolId: sid(req), children: c.child._id }).select('name'); const rights = p ? await G.resolve(sid(req), p._id, c.child._id) : null;
    if (!p || !rights.linked) return bad(res, 422, 'That guardian is not linked to this child.');
    by = { ...by, name: p.name, relationship: by.relationship || 'Guardian', parentId: p._id, basis: 'guardian' };
  } else if (by.name.length >= 2) by.basis = 'named'; else return bad(res, 400, 'Record who brought the child.');
  const known = by.basis === 'guardian' || (await collectorsOf(req, c.child._id)).some((x) => key(x.name) === key(by.name));
  if (!known) by.basis = 'unlisted';
  const cur = await EyDay.findOne({ schoolId: sid(req), childId: c.child._id, day });
  if (cur && cur.status === 'In') return bad(res, 409, 'The child is already checked in.');
  const concern = clean(b.concern, 300); const note = clean(b.note, 300); const flag = [by.basis === 'unlisted' ? 'unlisted-dropoff' : '', concern ? 'wellness' : ''].filter(Boolean).join(',');
  const row = cur || new EyDay({ schoolId: sid(req), childId: c.child._id, roomId: c.placement.roomId, day });
  row.roomId = c.placement.roomId; row.status = 'In'; row.inAt = new Date(); row.inBy = by; row.inStaffName = req.actorName || ''; row.inNote = note; row.inFlag = flag; row.outAt = undefined; row.outTo = undefined; row.history = [...(row.history || []), { at: new Date(), action: cur ? 'check-in again' : 'check-in', byName: req.actorName || '', note }];
  await row.save();
  if (concern) await EyCare.create({ schoolId: sid(req), childId: c.child._id, roomId: c.placement.roomId, day, at: new Date(), careType: 'health', text: `On arrival: ${concern}`, data: { onArrival: true }, authorId: E.oid(req.user.userId), authorName: req.actorName || '', key: `arrive:${row._id}:${Date.now()}` });
  if (st.notifyOnCheckIn || by.basis === 'unlisted') { const to = await N.parentsOf(req.user.schoolId, [c.child._id], 'viewAttendance'); await N.notify({ schoolId: req.user.schoolId, recipients: to, title: by.basis === 'unlisted' ? `${c.child.name} was brought in by someone not on the list` : `${c.child.name} arrived`, body: `${hhmm(row.inAt)}, brought by ${by.name || 'a guardian'}.`, link: '#/earlyYears', type: 'attendance', key: `ey-in:${c.child._id}:${day}` }); }
  await E.settleRatio(req.user.schoolId, c.room); await audit(req, { action: 'early.checkin', entityType: 'Student', entityId: c.child._id, schoolId: sid(req), detail: { by: by.name, basis: by.basis, flag } });
  res.json({ day: row, reminder: st.wellnessLookAtArrival ? 'Look at the child: any sign they are unwell? Ask about sleep, food and medicine since home.' : '', ratio: await E.ratioOf(req.user.schoolId, c.room, st) });
});

exports.checkOut = wrap('checkOut', async (req, res) => {
  const c = await E.childIn(req, req.body?.childId); if (c.error) return bad(res, ...c.error);
  const day = await E.today(req.user.schoolId); const st = await E.getSettings(sid(req)); const col = req.body?.collector || {};
  const row = await EyDay.findOne({ schoolId: sid(req), childId: c.child._id, day }); if (!row || row.status !== 'In') return bad(res, 422, 'The child is not checked in today.');
  const base = { schoolId: sid(req), studentId: c.child._id, classId: c.child.classId, day, at: new Date(), collectorName: clean(col.personName, 80), collectorParentId: E.oid(col.parentId) || undefined, gate: c.room.name, requestedById: E.oid(req.user.userId), requestedByRole: req.user.role, requestedByName: req.actorName || '' };
  const dec = await S9.collectorDecision(sid(req), c.child._id, { parentId: E.oid(col.parentId), personName: col.personName, code: col.code }, day);
  if (dec.decision !== 'Authorised') {
    row.refusals = (row.refusals || 0) + 1; row.history = [...(row.history || []), { at: new Date(), action: 'pickup refused', byName: req.actorName || '', note: '' }]; await row.save();
    await PickupEvent.create({ ...base, basis: 'none', outcome: 'Refused', refusedCode: dec.code || 'refused', reviewState: dec.code === 'restricted' ? 'NeedsReview' : '' });
    await audit(req, { action: 'early.pickup.refused', entityType: 'Student', entityId: c.child._id, schoolId: sid(req), detail: { code: dec.code } });
    if (dec.code === 'restricted') await N.notify({ schoolId: req.user.schoolId, recipients: await N.admins(req.user.schoolId), title: 'A restricted person asked to collect a child', body: `${c.child.name}, ${c.room.name}. The child was not released.`, link: '#/earlyYears', type: 'safety', key: `ey-restricted:${c.child._id}:${day}` });
    return bad(res, 403, REFUSE);                       // nothing here says why
  }
  const unnamedParent = !E.oid(col.parentId); if (unnamedParent && req.body?.idChecked !== true) return bad(res, 422, 'Look at this person\'s ID, then confirm you have.');
  const who2 = E.oid(col.parentId) ? await Parent.findOne({ _id: E.oid(col.parentId), schoolId: sid(req) }).select('name') : null;
  row.status = 'Out'; row.outAt = new Date(); row.outStaffName = req.actorName || ''; row.outNote = clean(req.body?.note, 300);
  row.outTo = { name: who2?.name || clean(col.personName, 80), relationship: dec.relationship || '', parentId: E.oid(col.parentId) || undefined, basis: dec.basis, idChecked: !!req.body?.idChecked };
  row.history = [...(row.history || []), { at: new Date(), action: 'check-out', byName: req.actorName || '', note: row.outNote }]; await row.save();
  await PickupEvent.create({ ...base, collectorName: row.outTo.name, relationship: row.outTo.relationship, basis: ['guardian', 'authorisation'].includes(dec.basis) ? dec.basis : 'guardian', authorizationId: dec.authorizationId, outcome: 'Released', releasedById: E.oid(req.user.userId), releasedByName: req.actorName || '' });
  if (st.notifyOnCheckOut || dec.basis !== 'guardian') await N.notify({ schoolId: req.user.schoolId, recipients: await N.parentsOf(req.user.schoolId, [c.child._id], 'viewAttendance'), title: `${c.child.name} was collected`, body: `${hhmm(row.outAt)} by ${row.outTo.name}${row.outTo.relationship ? ` (${row.outTo.relationship})` : ''}.`, link: '#/earlyYears', type: 'attendance', key: `ey-out:${c.child._id}:${day}` });
  await E.settleRatio(req.user.schoolId, c.room); await audit(req, { action: 'early.checkout', entityType: 'Student', entityId: c.child._id, schoolId: sid(req), detail: { to: row.outTo.name, basis: row.outTo.basis } });
  res.json({ day: row });
});

exports.markAbsent = wrap('absent', async (req, res) => {
  const ids = [...new Set((req.body?.childIds || (req.body?.childId ? [req.body.childId] : [])).map(String))].slice(0, 60); if (!ids.length) return bad(res, 400, 'Choose at least one child.');
  const day = await E.today(req.user.schoolId); const reason = clean(req.body?.reason, 200); let n = 0; const skipped = [];
  for (const id of ids) {
    const c = await E.childIn(req, id); if (c.error) { skipped.push({ childId: id, why: c.error[1] }); continue; }
    const cur = await EyDay.findOne({ schoolId: sid(req), childId: c.child._id, day }); if (cur && cur.status !== 'Absent') { skipped.push({ childId: id, why: 'Already here today.' }); continue; }
    if (cur) { cur.absentReason = reason; await cur.save(); } else await EyDay.create({ schoolId: sid(req), childId: c.child._id, roomId: c.placement.roomId, day, status: 'Absent', absentReason: reason, absentById: E.oid(req.user.userId), history: [{ at: new Date(), action: 'absent', byName: req.actorName || '', note: reason }] });
    n += 1;
  }
  res.json({ marked: n, skipped });
});

/* ───────── the school's overview ───────── */
exports.overview = wrap('overview', async (req, res) => {
  const scope = await E.scopeOf(req); const day = await E.today(req.user.schoolId); const st = await E.getSettings(sid(req));
  const roomQ = { schoolId: sid(req), active: true }; if (!scope.admin) roomQ._id = { $in: [...scope.rooms].map(E.oid) }; const rooms = await EyRoom.find(roomQ); const rids = rooms.map((r) => r._id);
  const ratios = []; for (const r of rooms) ratios.push(await E.ratioOf(req.user.schoolId, r, st));
  const [placed, inNow, absent, waiting, entries, unconfirmed, changes] = await Promise.all([
    EyPlacement.countDocuments({ schoolId: sid(req), roomId: { $in: rids }, to: null }), EyDay.countDocuments({ schoolId: sid(req), roomId: { $in: rids }, day, status: 'In' }), EyDay.countDocuments({ schoolId: sid(req), roomId: { $in: rids }, day, status: 'Absent' }),
    EyPost.countDocuments({ schoolId: sid(req), roomId: { $in: rids }, state: 'Review' }), EyCare.countDocuments({ schoolId: sid(req), roomId: { $in: rids }, day, state: 'Active' }),
    scope.admin ? EyProfile.countDocuments({ schoolId: sid(req), 'pending.state': 'Waiting' }) : 0, scope.admin ? EyPickupChange.countDocuments({ schoolId: sid(req), state: { $in: ['Requested', 'Verified'] } }) : 0]);
  res.json({ day, rooms: rooms.length, children: placed, in: inNow, absent, expected: Math.max(0, placed - inNow - absent), ratioProblems: ratios.filter((r) => !r.ok).length, diariesWaiting: waiting, entriesToday: entries, profileChangesWaiting: unconfirmed, pickupChangesWaiting: changes });
});

exports._internals = { collectorsOf, rosterOf, roomView };
