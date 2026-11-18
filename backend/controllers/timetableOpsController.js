// Timetable planning (PRD E10): rooms, clashes, workload, published versions, cover and swaps.
const mongoose = require('../lib/pgdoc');
const Room = require('../models/Room'); const Timetable = require('../models/Timetable'); const TimetableConfig = require('../models/TimetableConfig'); const Version = require('../models/TimetableVersion');
const Swap = require('../models/TimetableSwap'); const Cover = require('../models/CoverAssignment'); const Teacher = require('../models/Teacher'); const Subject = require('../models/Subject');
const Class = require('../models/Class'); const Student = require('../models/Student');
const TT = require('../utils/timetableOps'); const H = require('../utils/hr'); const N = require('../utils/notify'); const { audit } = require('../utils/audit');
const hr = require('./hrOpsController'); const gen = require('./timetableController').helpers;

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => { console.error('timetable-ops:', e); res.status(500).json({ message: e.message }); };
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const KINDS = ['Classroom', 'Lab', 'Library', 'Hall', 'Sports', 'Computer', 'Other'];
const sid = (req) => req.user.schoolId; const me = (req) => req.user.userId;
const isAdmin = (req) => req.user.role === 'admin';
const dayOf = (date) => H.DAYNAMES[H.dow(date)];
const hhmm = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
const weekStart = (d) => { const w = H.dow(d); return H.addDays(d, w === 0 ? -6 : 1 - w); };
const nameMaps = async (schoolId) => {
  const [t, c, s] = await Promise.all([Teacher.find({ schoolId }).select('name'), Class.find({ schoolId }).select('standard division'), Subject.find({ schoolId }).select('name roomKind')]);
  return { t: new Map(t.map((x) => [String(x._id), x.name])), c: new Map(c.map((x) => [String(x._id), `${x.standard}-${x.division}`])), s: new Map(s.map((x) => [String(x._id), x.name])), subjects: s };
};
const cfgOf = async (schoolId) => (await TimetableConfig.findOne({ schoolId })) || { lectureDurationMinutes: 45, maxPeriodsPerDay: 7, maxPeriodsPerWeek: 32, maxConsecutive: 4, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] };

/* ───────── rooms ───────── */
const roomBody = (b) => {
  const name = str(b.name, 60); if (!name) return { error: 'Room name is required.' };
  const kind = KINDS.includes(b.kind) ? b.kind : 'Classroom'; const capacity = Number(b.capacity === undefined ? 40 : b.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) return { error: 'Capacity must be a whole number from 1 to 2000.' };
  const equipment = (Array.isArray(b.equipment) ? b.equipment : String(b.equipment || '').split(',')).map((x) => str(x, 40)).filter(Boolean).slice(0, 20);
  return { v: { name, nameKey: TT.roomKey(name), kind, capacity, equipment, notes: str(b.notes, 300), homeClassId: isId(b.homeClassId) ? b.homeClassId : undefined } };
};
exports.listRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ schoolId: sid(req) }).sort({ name: 1 }); const tts = await Timetable.find({ schoolId: sid(req), isActive: { $ne: false } });
    const use = new Map(); for (const t of tts) for (const s of t.slots || []) if (!s.isBreak && s.room) { const k = TT.roomKey(s.room); use.set(k, (use.get(k) || 0) + 1); }
    const nm = await nameMaps(sid(req));
    res.json({ rooms: rooms.map((r) => ({ ...JSON.parse(JSON.stringify(r)), periodsPerWeek: use.get(r.nameKey) || 0, homeClassName: r.homeClassId ? nm.c.get(String(r.homeClassId)) : '' })) });
  } catch (e) { fail(res, e); }
};
exports.createRoom = async (req, res) => {
  try {
    const r = roomBody(req.body || {}); if (r.error) return res.status(400).json({ message: r.error });
    if (r.v.homeClassId && !(await Class.exists({ _id: r.v.homeClassId, schoolId: sid(req) }))) return res.status(404).json({ message: 'Class not found.' });
    const doc = await Room.create({ ...r.v, schoolId: sid(req) });
    await audit(req, { action: 'timetable.room.create', entityType: 'Room', entityId: doc._id, schoolId: sid(req), detail: { name: doc.name } }); res.status(201).json({ room: doc });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'A room with that name already exists.' }); fail(res, e); }
};
exports.updateRoom = async (req, res) => {
  try {
    const room = isId(req.params.id) ? await Room.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!room) return res.status(404).json({ message: 'Room not found.' });
    const r = roomBody({ ...JSON.parse(JSON.stringify(room)), ...(req.body || {}) }); if (r.error) return res.status(400).json({ message: r.error });
    if (r.v.nameKey !== room.nameKey) {
      const used = (await Timetable.find({ schoolId: sid(req) })).some((t) => (t.slots || []).some((s) => TT.roomKey(s.room) === room.nameKey));
      if (used) return res.status(409).json({ message: `${room.name} is on the timetable. Move those lessons to another room before renaming it.` });
    }
    if ((req.body || {}).homeClassId === '' || (req.body || {}).homeClassId === null) r.v.homeClassId = undefined;
    Object.assign(room, r.v); if (!r.v.homeClassId) room.homeClassId = undefined; await room.save();
    await audit(req, { action: 'timetable.room.update', entityType: 'Room', entityId: room._id, schoolId: sid(req) }); res.json({ room });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'A room with that name already exists.' }); fail(res, e); }
};
exports.setRoomActive = async (req, res) => {
  try {
    const room = isId(req.params.id) ? await Room.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!room) return res.status(404).json({ message: 'Room not found.' });
    const active = req.body?.active !== false; room.active = active; await room.save();
    await audit(req, { action: active ? 'timetable.room.enable' : 'timetable.room.disable', entityType: 'Room', entityId: room._id, schoolId: sid(req) });
    const stillUsed = active ? 0 : (await Timetable.find({ schoolId: sid(req) })).reduce((n, t) => n + (t.slots || []).filter((s) => TT.roomKey(s.room) === room.nameKey).length, 0);
    res.json({ room, stillUsedPeriods: stillUsed });
  } catch (e) { fail(res, e); }
};
// rooms free at a given time, optionally big enough for a class or of a kind
exports.freeRooms = async (req, res) => {
  try {
    const { day, startTime, endTime, kind, classId } = req.query; if (!TT.DAYS.includes(day) || !hhmm(startTime) || !hhmm(endTime) || TT.toMin(endTime) <= TT.toMin(startTime)) return res.status(400).json({ message: 'Choose a day, start and end time.' });
    const q = { schoolId: sid(req), active: true }; if (KINDS.includes(kind)) q.kind = kind;
    const rooms = await Room.find(q).sort({ capacity: 1 }); const tts = await Timetable.find({ schoolId: sid(req), dayOfWeek: day });
    const busy = new Set(); for (const t of tts) { if (classId && String(t.classId) === String(classId)) continue; for (const s of t.slots || []) if (!s.isBreak && s.room && TT.overlaps(s.startTime, s.endTime, startTime, endTime)) busy.add(TT.roomKey(s.room)); }
    const size = isId(classId) ? await Student.countDocuments({ schoolId: sid(req), classId, isActive: { $ne: false } }) : 0;
    res.json({ classSize: size, rooms: rooms.filter((r) => !busy.has(r.nameKey)).map((r) => ({ _id: r._id, name: r.name, kind: r.kind, capacity: r.capacity, equipment: r.equipment, fits: r.capacity >= size })) });
  } catch (e) { fail(res, e); }
};
exports.roomSchedule = async (req, res) => {
  try {
    const room = isId(req.params.id) ? await Room.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!room) return res.status(404).json({ message: 'Room not found.' });
    const nm = await nameMaps(sid(req)); const out = [];
    for (const t of await Timetable.find({ schoolId: sid(req) })) for (const s of t.slots || []) if (!s.isBreak && TT.roomKey(s.room) === room.nameKey) out.push({ day: t.dayOfWeek, startTime: s.startTime, endTime: s.endTime, className: nm.c.get(String(t.classId)), subjectName: nm.s.get(String(s.subjectId)), teacherName: nm.t.get(String(s.teacherId)) });
    out.sort((a, b) => TT.DAYS.indexOf(a.day) - TT.DAYS.indexOf(b.day) || TT.toMin(a.startTime) - TT.toMin(b.startTime)); res.json({ room, lessons: out });
  } catch (e) { fail(res, e); }
};

/* ───────── conflicts and workload ───────── */
exports.conflicts = async (req, res) => {
  try {
    const nm = await nameMaps(sid(req)); const list = await TT.findConflicts(sid(req));
    const extra = []; const rooms = await Room.find({ schoolId: sid(req) }); const rk = new Map(rooms.map((r) => [r.nameKey, r]));
    const subj = new Map(nm.subjects.map((x) => [String(x._id), x])); const size = new Map();
    if (rooms.length) for (const t of await Timetable.find({ schoolId: sid(req), isActive: { $ne: false } })) {
      const k = String(t.classId); if (!size.has(k)) size.set(k, await Student.countDocuments({ schoolId: sid(req), classId: t.classId, isActive: { $ne: false } }));
      for (const s of t.slots || []) if (!s.isBreak && s.room) {
        const r = rk.get(TT.roomKey(s.room)); const where = `${nm.c.get(k)} ${t.dayOfWeek} ${s.startTime}-${s.endTime}`;
        if (!r) extra.push({ kind: 'unknownRoom', day: t.dayOfWeek, room: s.room, a: where }); else {
          if (!r.active) extra.push({ kind: 'inactiveRoom', day: t.dayOfWeek, room: r.name, a: where });
          if (size.get(k) > r.capacity) extra.push({ kind: 'capacity', day: t.dayOfWeek, room: r.name, a: `${where} (${size.get(k)} students, room holds ${r.capacity})` });
          const sub = subj.get(String(s.subjectId)); if (sub?.roomKind && sub.roomKind !== r.kind) extra.push({ kind: 'roomKind', day: t.dayOfWeek, room: r.name, a: `${where} (${sub.name} needs a ${sub.roomKind})` });
        }
      }
    }
    res.json({ conflicts: list.map((c) => ({ ...c, teacherName: c.teacherId ? nm.t.get(c.teacherId) : undefined })), warnings: extra });
  } catch (e) { fail(res, e); }
};
const workloadOf = async (schoolId, onlyTeacher) => {
  const cfg = await cfgOf(schoolId); const dur = cfg.lectureDurationMinutes || 45; const days = cfg.workingDays?.length ? cfg.workingDays : TT.DAYS.slice(0, 5);
  const grid = cfg.schoolStartTime ? gen.buildDaySlots(cfg).filter((s) => s.type === 'lecture').length : 0;
  const tq = { schoolId }; if (onlyTeacher) tq._id = onlyTeacher; const teachers = await Teacher.find(tq).select('name');
  const rows = new Map(teachers.map((t) => [String(t._id), { teacherId: String(t._id), name: t.name, week: 0, days: Object.fromEntries(days.map((d) => [d, 0])), runs: Object.fromEntries(days.map((d) => [d, []])) }]));
  for (const t of await Timetable.find({ schoolId, isActive: { $ne: false } })) for (const s of t.slots || []) {
    const r = !s.isBreak && s.teacherId && rows.get(String(s.teacherId)); if (!r || r.days[t.dayOfWeek] === undefined) continue;
    const p = TT.periodsOf(s, dur); r.week += p; r.days[t.dayOfWeek] += p; r.runs[t.dayOfWeek].push({ a: TT.toMin(s.startTime), b: TT.toMin(s.endTime), p });
  }
  const today = H.todayStr(); const ws = weekStart(today); const we = H.addDays(ws, 6);
  const covers = await Cover.find({ schoolId, status: 'Assigned', date: { $gte: ws, $lte: we } });
  const out = [...rows.values()].map((r) => {
    let maxRun = 0; for (const d of days) { const list = r.runs[d].sort((x, y) => x.a - y.a); let run = 0, end = null; for (const l of list) { run = end !== null && l.a - end <= 0 ? run + l.p : l.p; end = l.b; maxRun = Math.max(maxRun, run); } }
    const maxDay = Math.max(0, ...Object.values(r.days)); const exceptions = [];
    if (maxDay > cfg.maxPeriodsPerDay) exceptions.push(`${maxDay} periods in a day (limit ${cfg.maxPeriodsPerDay})`);
    if (r.week > cfg.maxPeriodsPerWeek) exceptions.push(`${r.week} periods a week (limit ${cfg.maxPeriodsPerWeek})`);
    if (maxRun > cfg.maxConsecutive) exceptions.push(`${maxRun} lessons in a row (limit ${cfg.maxConsecutive})`);
    const coverTaken = covers.filter((c) => String(c.coverTeacherId) === r.teacherId && c.source !== 'swap').length; const coverGiven = covers.filter((c) => String(c.absentTeacherId) === r.teacherId && c.source !== 'swap').length;
    return { teacherId: r.teacherId, name: r.name, weekPeriods: r.week, days: r.days, freePerDay: Object.fromEntries(days.map((d) => [d, Math.max(0, grid - r.days[d])])), maxInARow: maxRun, coverTakenThisWeek: coverTaken, coverGivenThisWeek: coverGiven, exceptions };
  });
  return { limits: { maxPeriodsPerDay: cfg.maxPeriodsPerDay, maxPeriodsPerWeek: cfg.maxPeriodsPerWeek, maxConsecutive: cfg.maxConsecutive }, lecturesPerDay: grid, days, teachers: out.sort((a, b) => b.exceptions.length - a.exceptions.length || b.weekPeriods - a.weekPeriods) };
};
exports.workload = async (req, res) => { try { res.json(await workloadOf(sid(req))); } catch (e) { fail(res, e); } };

/* ───────── published versions ───────── */
const snapshotOf = async (schoolId) => (await Timetable.find({ schoolId, isActive: { $ne: false } })).map((t) => ({ classId: String(t.classId), dayOfWeek: t.dayOfWeek, slots: (t.slots || []).map((s) => ({ s: s.startTime, e: s.endTime, sub: s.subjectId ? String(s.subjectId) : '', t: s.teacherId ? String(s.teacherId) : '', room: s.room || '', b: !!s.isBreak, bn: s.breakName || '' })) }));
const sig = (x) => `${x.s}|${x.e}|${x.sub}|${x.t}|${x.room}|${x.b ? 1 : 0}`;
const diffSnap = (prev, cur) => {
  const key = (x) => `${x.classId}|${x.dayOfWeek}`; const pm = new Map((prev || []).map((x) => [key(x), x])); const cm = new Map(cur.map((x) => [key(x), x])); const out = new Map();
  for (const k of new Set([...pm.keys(), ...cm.keys()])) {
    const a = new Map(((pm.get(k) || {}).slots || []).map((x) => [sig(x), x])); const b = new Map(((cm.get(k) || {}).slots || []).map((x) => [sig(x), x]));
    const added = [...b].filter(([g]) => !a.has(g)).map(([, x]) => x); const removed = [...a].filter(([g]) => !b.has(g)).map(([, x]) => x); if (!added.length && !removed.length) continue;
    const classId = k.split('|')[0]; const day = k.split('|')[1]; const o = out.get(classId) || { classId, added: [], removed: [] };
    o.added.push(...added.filter((x) => !x.b).map((x) => ({ day, ...x }))); o.removed.push(...removed.filter((x) => !x.b).map((x) => ({ day, ...x }))); out.set(classId, o);
  }
  return [...out.values()];
};
const describe = (x, nm) => `${x.day.slice(0, 3)} ${x.s}-${x.e} ${nm.s.get(x.sub) || 'Lesson'}${nm.t.get(x.t) ? ` – ${nm.t.get(x.t)}` : ''}${x.room ? ` (${x.room})` : ''}`;
exports.versionStatus = async (req, res) => {
  try {
    const latest = await Version.findOne({ schoolId: sid(req) }).sort({ number: -1 }); const cur = await snapshotOf(sid(req)); const d = diffSnap(latest ? latest.snapshot : [], cur);
    const conflicts = (await TT.findConflicts(sid(req))).length;
    res.json({ latest: latest ? { number: latest.number, publishedAt: latest.publishedAt, publishedByName: latest.publishedByName, note: latest.note } : null, unpublishedClasses: d.length, conflicts, canPublish: conflicts === 0 && (d.length > 0 || !latest) });
  } catch (e) { fail(res, e); }
};
exports.listVersions = async (req, res) => {
  try { const rows = await Version.find({ schoolId: sid(req) }).select('-snapshot -changes').sort({ number: -1 }).limit(100); res.json({ versions: rows }); } catch (e) { fail(res, e); }
};
exports.getVersion = async (req, res) => {
  try {
    const v = isId(req.params.id) ? await Version.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!v) return res.status(404).json({ message: 'Version not found.' });
    const nm = await nameMaps(sid(req)); const obj = JSON.parse(JSON.stringify(v)); delete obj.snapshot;
    obj.changes = (v.changes || []).map((c) => ({ ...c, label: nm.c.get(String(c.classId)) || c.label }));
    obj.classes = [...new Set((v.snapshot || []).map((x) => x.classId))].map((id) => ({ classId: id, label: nm.c.get(id) || '' })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    if (isId(req.query.classId)) obj.timetable = (v.snapshot || []).filter((x) => x.classId === req.query.classId).map((x) => ({ dayOfWeek: x.dayOfWeek, slots: x.slots.map((s) => ({ startTime: s.s, endTime: s.e, isBreak: s.b, breakName: s.bn, subjectName: nm.s.get(s.sub) || '', teacherName: nm.t.get(s.t) || '', room: s.room })) }));
    res.json({ version: obj });
  } catch (e) { fail(res, e); }
};
exports.publish = async (req, res) => {
  try {
    const schoolId = sid(req); const conflicts = await TT.findConflicts(schoolId);
    if (conflicts.length) return res.status(422).json({ message: `${conflicts.length} teacher or room double booking(s) must be fixed before publishing.`, conflicts });
    const effectiveFrom = str(req.body?.effectiveFrom, 10); if (effectiveFrom && (!H.isDate(effectiveFrom) || effectiveFrom < H.todayStr())) return res.status(400).json({ message: 'The start date must be today or later.' });
    const latest = await Version.findOne({ schoolId }).sort({ number: -1 }); const cur = await snapshotOf(schoolId); if (!cur.length) return res.status(422).json({ message: 'There is no timetable to publish.' });
    const changes = diffSnap(latest ? latest.snapshot : [], cur); if (latest && !changes.length) return res.status(409).json({ message: `Nothing has changed since version ${latest.number}.` });
    const nm = await nameMaps(schoolId); const number = (latest?.number || 0) + 1;
    const teacherIds = new Set(); const stored = changes.map((c) => { for (const x of [...c.added, ...c.removed]) if (x.t) teacherIds.add(x.t); return { classId: c.classId, label: nm.c.get(c.classId) || '', added: c.added.map((x) => describe(x, nm)).slice(0, 60), removed: c.removed.map((x) => describe(x, nm)).slice(0, 60) }; });
    const v = await Version.create({ schoolId, number, note: str(req.body?.note, 300), effectiveFrom, publishedByName: req.actorName || '', snapshot: cur, changes: stored, summary: { classes: new Set(cur.map((x) => x.classId)).size, periods: cur.reduce((n, x) => n + x.slots.filter((s) => !s.b).length, 0), changedClasses: changes.length, changedTeachers: teacherIds.size } });
    // tell the people whose schedule changed
    const changedClassIds = changes.map((c) => c.classId); const studs = changedClassIds.length ? await Student.find({ schoolId, classId: { $in: changedClassIds }, isActive: { $ne: false } }).select('_id') : [];
    const family = await N.studentAndParents(schoolId, studs.map((x) => x._id));
    const when = effectiveFrom ? ` from ${effectiveFrom}` : '';
    await N.notify({ schoolId, recipients: [...teacherIds].map((id) => ({ id, role: 'teacher' })), title: `Your timetable has changed${when}`, body: `Timetable version ${number}. Open your timetable to see the new periods.`, key: `tt-v${number}`, link: { teacher: '/teacher?tab=timetable' } });
    await N.notify({ schoolId, recipients: family, title: `The class timetable has changed${when}`, body: `A new timetable (version ${number}) has been published.`, key: `tt-v${number}`, link: { student: '/student?tab=timetable', parent: '/parent?tab=timetable' } });
    v.summary = { ...v.summary, notified: teacherIds.size + family.length }; await v.save();
    await audit(req, { action: 'timetable.publish', entityType: 'TimetableVersion', entityId: v._id, schoolId, detail: { number, changedClasses: changes.length } });
    res.status(201).json({ version: { _id: v._id, number, summary: v.summary } });
  } catch (e) { fail(res, e); }
};
// put an earlier published timetable back as the working timetable (it is not announced until published again)
exports.restore = async (req, res) => {
  try {
    const schoolId = sid(req); const v = isId(req.params.id) ? await Version.findOne({ _id: req.params.id, schoolId }) : null; if (!v) return res.status(404).json({ message: 'Version not found.' });
    const cfg = await TimetableConfig.findOne({ schoolId }); const valid = new Set((await Class.find({ schoolId }).select('_id')).map((c) => String(c._id)));
    const docs = (v.snapshot || []).filter((x) => valid.has(x.classId)).map((x) => ({ schoolId, classId: x.classId, dayOfWeek: x.dayOfWeek, academicYear: cfg?.academicYear, isActive: true, slots: x.slots.map((s) => ({ startTime: s.s, endTime: s.e, subjectId: s.sub || undefined, teacherId: s.t || undefined, isBreak: s.b, breakName: s.bn, room: s.room, locked: !s.b })) }));
    await Timetable.deleteMany({ schoolId }); if (docs.length) await Timetable.insertMany(docs);
    await audit(req, { action: 'timetable.restore', entityType: 'TimetableVersion', entityId: v._id, schoolId, detail: { number: v.number } });
    res.json({ message: `Version ${v.number} is now the working timetable. Publish it to tell teachers and families.`, classes: new Set(docs.map((d) => String(d.classId))).size });
  } catch (e) { fail(res, e); }
};

/* ───────── cover ───────── */
const slotFor = async (schoolId, classId, day, startTime, endTime) => { const t = await Timetable.findOne({ schoolId, classId, dayOfWeek: day }); return (t?.slots || []).find((s) => !s.isBreak && s.startTime === startTime && s.endTime === endTime) || null; };
const decorate = async (schoolId, rows) => {
  const nm = await nameMaps(schoolId);
  return rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), absentName: nm.t.get(String(r.absentTeacherId)), coverName: r.coverTeacherId ? nm.t.get(String(r.coverTeacherId)) : null, proposedName: r.proposedTeacherId ? nm.t.get(String(r.proposedTeacherId)) : null, className: nm.c.get(String(r.classId)), subjectName: r.subjectId ? nm.s.get(String(r.subjectId)) : '' }));
};
exports.listCover = async (req, res) => {
  try {
    const q = { schoolId: sid(req) }; q.status = ['Needed', 'Proposed', 'Assigned', 'Cancelled'].includes(req.query.status) ? req.query.status : { $ne: 'Cancelled' };
    if (req.query.source) q.source = req.query.source === 'leave' ? { $in: ['leave', null] } : req.query.source; if (H.isDate(req.query.from)) q.date = { $gte: req.query.from }; else q.date = { $gte: H.addDays(H.todayStr(), -7) };
    res.json({ cover: await decorate(sid(req), await Cover.find(q).sort({ date: 1, startTime: 1 }).limit(300)) });
  } catch (e) { fail(res, e); }
};
exports.createCover = async (req, res) => {
  try {
    const schoolId = sid(req); const b = req.body || {}; const date = str(b.date, 10);
    if (!H.isDate(date) || date < H.todayStr()) return res.status(400).json({ message: 'Choose today or a later date.' });
    if (!isId(b.classId) || !isId(b.absentTeacherId) || !hhmm(b.startTime) || !hhmm(b.endTime)) return res.status(400).json({ message: 'Choose the class, the teacher who is away and the lesson time.' });
    const day = dayOf(date); const slot = await slotFor(schoolId, b.classId, day, b.startTime, b.endTime);
    if (!slot || String(slot.teacherId) !== String(b.absentTeacherId)) return res.status(422).json({ message: `That teacher does not teach this class at ${b.startTime}-${b.endTime} on ${day}.` });
    if (await Cover.findOne({ schoolId, date, classId: b.classId, startTime: b.startTime, status: { $ne: 'Cancelled' } })) return res.status(409).json({ message: 'This lesson already has a cover request.' });
    const reason = str(b.reason, 200); if (reason.length < 3) return res.status(400).json({ message: 'Say why cover is needed.' });
    const c = await Cover.create({ schoolId, source: 'adhoc', date, classId: b.classId, startTime: b.startTime, endTime: b.endTime, subjectId: slot.subjectId, absentTeacherId: b.absentTeacherId, status: 'Needed', reason, createdByName: req.actorName || '' });
    await audit(req, { action: 'timetable.cover.create', entityType: 'CoverAssignment', entityId: c._id, schoolId, detail: { date, start: b.startTime } }); res.status(201).json({ cover: c });
  } catch (e) { fail(res, e); }
};
const coverOf = async (req) => (isId(req.params.id) ? Cover.findOne({ _id: req.params.id, schoolId: sid(req) }) : null);
// Eligible teachers, fairest first: teaches the subject, teaches the class, fewest recent covers, lightest day
exports.candidates = async (req, res) => {
  try {
    const schoolId = sid(req); const c = await coverOf(req); if (!c) return res.status(404).json({ message: 'Cover lesson not found.' });
    const cfg = await cfgOf(schoolId); const day = dayOf(c.date); const dur = cfg.lectureDurationMinutes || 45;
    const teachers = await Teacher.find({ schoolId, _id: { $ne: c.absentTeacherId } }).select('name subjectClassAssignments');
    const load = new Map(); const week = new Map(); const teachesSubject = new Set(); const teachesClass = new Set();
    for (const t of await Timetable.find({ schoolId, isActive: { $ne: false } })) for (const s of t.slots || []) {
      if (s.isBreak || !s.teacherId) continue; const k = String(s.teacherId); week.set(k, (week.get(k) || 0) + TT.periodsOf(s, dur));
      if (t.dayOfWeek === day) load.set(k, (load.get(k) || 0) + TT.periodsOf(s, dur));
      if (c.subjectId && String(s.subjectId) === String(c.subjectId)) teachesSubject.add(k); if (String(t.classId) === String(c.classId)) teachesClass.add(k);
    }
    const recent = new Map(); for (const x of await Cover.find({ schoolId, status: 'Assigned', date: { $gte: H.addDays(H.todayStr(), -30) } })) if (x.source !== 'swap' && x.coverTeacherId) recent.set(String(x.coverTeacherId), (recent.get(String(x.coverTeacherId)) || 0) + 1);
    const out = [], excluded = [];
    for (const t of teachers) {
      const k = String(t._id); const why = await hr.coverFree(schoolId, t._id, c, c._id);
      if (why) { excluded.push({ _id: t._id, name: t.name, why }); continue; }
      if ((load.get(k) || 0) + 1 > cfg.maxPeriodsPerDay) { excluded.push({ _id: t._id, name: t.name, why: `would pass the daily limit of ${cfg.maxPeriodsPerDay} periods` }); continue; }
      out.push({ _id: t._id, name: t.name, teachesSubject: teachesSubject.has(k) || (t.subjectClassAssignments || []).some((a) => String(a.subjectId) === String(c.subjectId)), teachesClass: teachesClass.has(k), coversLast30Days: recent.get(k) || 0, periodsThatDay: load.get(k) || 0, periodsThisWeek: week.get(k) || 0 });
    }
    out.sort((a, b) => (b.teachesSubject - a.teachesSubject) || (b.teachesClass - a.teachesClass) || (a.coversLast30Days - b.coversLast30Days) || (a.periodsThatDay - b.periodsThatDay) || a.name.localeCompare(b.name));
    res.json({ candidates: out, excluded });
  } catch (e) { fail(res, e); }
};
exports.propose = async (req, res) => {
  try {
    const schoolId = sid(req); const c = await coverOf(req); if (!c) return res.status(404).json({ message: 'Cover lesson not found.' });
    if (!['Needed', 'Proposed'].includes(c.status)) return res.status(422).json({ message: c.status === 'Assigned' ? 'Cover is already arranged. Release it first.' : 'This cover is cancelled.' });
    if (c.date < H.todayStr()) return res.status(422).json({ message: 'That lesson is in the past.' });
    const t = isId(req.body?.teacherId) ? await Teacher.findOne({ _id: req.body.teacherId, schoolId }) : null; if (!t) return res.status(404).json({ message: 'Teacher not found.' });
    if (String(t._id) === String(c.absentTeacherId)) return res.status(422).json({ message: 'The teacher who is away cannot cover their own lesson.' });
    const why = await hr.coverFree(schoolId, t._id, c, c._id); if (why) return res.status(422).json({ message: `${t.name} ${why}.` });
    const cfg = await cfgOf(schoolId); const day = dayOf(c.date); let dayLoad = 0;
    for (const tt of await Timetable.find({ schoolId, dayOfWeek: day, isActive: { $ne: false } })) for (const s of tt.slots || []) if (!s.isBreak && String(s.teacherId) === String(t._id)) dayLoad += TT.periodsOf(s, cfg.lectureDurationMinutes);
    if (dayLoad + 1 > cfg.maxPeriodsPerDay) return res.status(422).json({ message: `${t.name} would pass the daily limit of ${cfg.maxPeriodsPerDay} periods.` });
    c.proposedTeacherId = t._id; c.proposedById = me(req); c.proposedByName = req.actorName || ''; c.status = 'Proposed'; await c.save();
    await audit(req, { action: 'timetable.cover.propose', entityType: 'CoverAssignment', entityId: c._id, schoolId, detail: { date: c.date, teacher: t.name } });
    await N.notify({ schoolId, recipients: await N.admins(schoolId), exclude: me(req), title: 'A cover proposal needs your approval', body: `${c.date} ${c.startTime}-${c.endTime}: ${t.name}`, link: { admin: '/admin?tab=timetablePlan' }, key: `cover-prop-${c._id}-${t._id}` });
    res.json({ cover: c });
  } catch (e) { fail(res, e); }
};
exports.decideCover = async (req, res) => {
  try {
    const schoolId = sid(req); const c = await coverOf(req); if (!c) return res.status(404).json({ message: 'Cover lesson not found.' });
    if (c.status !== 'Proposed') return res.status(422).json({ message: 'Nobody is proposed for this lesson.' });
    if (String(c.proposedById) === String(me(req))) return res.status(403).json({ message: 'A different administrator must approve your proposal.' });
    const decision = req.body?.decision;
    if (decision === 'decline') { c.status = 'Needed'; c.proposedTeacherId = undefined; c.proposedById = undefined; c.proposedByName = ''; await c.save(); await audit(req, { action: 'timetable.cover.decline', entityType: 'CoverAssignment', entityId: c._id, schoolId }); return res.json({ cover: c }); }
    if (decision !== 'approve') return res.status(400).json({ message: 'Choose approve or decline.' });
    const t = await Teacher.findOne({ _id: c.proposedTeacherId, schoolId }); if (!t) return res.status(404).json({ message: 'Teacher not found.' });
    const why = await hr.coverFree(schoolId, t._id, c, c._id); if (why) return res.status(422).json({ message: `${t.name} ${why}. Propose someone else.` });
    c.coverTeacherId = t._id; c.status = 'Assigned'; c.assignedByName = c.proposedByName; c.response = ''; await c.save();
    await audit(req, { action: 'timetable.cover.approve', entityType: 'CoverAssignment', entityId: c._id, schoolId, detail: { date: c.date, teacher: t.name } });
    const cls = await Class.findById(c.classId).select('standard division');
    await N.notify({ schoolId, recipients: [{ id: t._id, role: 'teacher' }], title: 'You are covering a lesson', body: `${c.date} ${c.startTime}-${c.endTime}${cls ? `, class ${cls.standard}-${cls.division}` : ''}`, link: { teacher: '/teacher?tab=timetablePlan' }, key: `cover-ok-${c._id}-${t._id}` });
    await N.notify({ schoolId, recipients: [{ id: c.absentTeacherId, role: 'teacher' }], title: 'Your lesson is covered', body: `${c.date} ${c.startTime}-${c.endTime}: ${t.name} will take it.`, key: `cover-ok-abs-${c._id}-${t._id}` });
    res.json({ cover: c });
  } catch (e) { fail(res, e); }
};
exports.releaseCover = async (req, res) => {
  try {
    const c = await coverOf(req); if (!c) return res.status(404).json({ message: 'Cover lesson not found.' });
    if (c.source === 'swap') return res.status(422).json({ message: 'This cover belongs to a swap. Cancel the swap instead.' });
    if (req.body?.cancel) { if (c.source === 'leave') return res.status(422).json({ message: 'Leave cover is cancelled by cancelling the leave.' }); c.status = 'Cancelled'; } else { c.status = 'Needed'; }
    c.coverTeacherId = null; c.proposedTeacherId = undefined; c.proposedById = undefined; c.proposedByName = ''; await c.save();
    await audit(req, { action: req.body?.cancel ? 'timetable.cover.cancel' : 'timetable.cover.release', entityType: 'CoverAssignment', entityId: c._id, schoolId: sid(req) }); res.json({ cover: c });
  } catch (e) { fail(res, e); }
};
// the teacher who was given a lesson can hand it back with a reason
exports.respondCover = async (req, res) => {
  try {
    const schoolId = sid(req); const c = await coverOf(req); if (!c || String(c.coverTeacherId) !== String(me(req))) return res.status(404).json({ message: 'Cover lesson not found.' });
    if (c.status !== 'Assigned') return res.status(422).json({ message: 'This cover is not active.' }); if (c.source === 'swap') return res.status(422).json({ message: 'A swap is cancelled from the swaps list.' });
    const note = str(req.body?.note, 200);
    if (req.body?.response === 'Accepted') { c.response = 'Accepted'; await c.save(); return res.json({ cover: c }); }
    if (req.body?.response !== 'Declined') return res.status(400).json({ message: 'Choose accept or decline.' }); if (note.length < 3) return res.status(400).json({ message: 'Say why you cannot take it.' });
    const who = (await Teacher.findById(c.coverTeacherId).select('name'))?.name || 'A teacher';
    c.coverTeacherId = null; c.status = 'Needed'; c.response = 'Declined'; c.responseNote = note; c.proposedTeacherId = undefined; c.proposedById = undefined; c.proposedByName = ''; await c.save();
    await audit(req, { action: 'timetable.cover.handback', entityType: 'CoverAssignment', entityId: c._id, schoolId, detail: { note } });
    await N.notify({ schoolId, recipients: await N.admins(schoolId), title: 'A teacher cannot take a cover lesson', body: `${who}: ${c.date} ${c.startTime}-${c.endTime}. ${note}`, link: { admin: '/admin?tab=timetablePlan' }, key: `cover-back-${c._id}-${Date.now()}` });
    res.json({ cover: c });
  } catch (e) { fail(res, e); }
};

/* ───────── a teacher's week, and swaps ───────── */
exports.lessons = async (req, res) => {
  try {
    const schoolId = sid(req); const date = str(req.query.date, 10); if (!H.isDate(date)) return res.status(400).json({ message: 'Choose a date.' });
    const teacherId = req.query.teacherId || me(req); if (!isId(teacherId)) return res.status(400).json({ message: 'Choose a teacher.' });
    if (!(await Teacher.exists({ _id: teacherId, schoolId }))) return res.status(404).json({ message: 'Teacher not found.' });
    const day = dayOf(date); const nm = await nameMaps(schoolId); const out = [];
    for (const t of await Timetable.find({ schoolId, dayOfWeek: day, isActive: { $ne: false } })) for (const s of t.slots || []) if (!s.isBreak && String(s.teacherId) === String(teacherId)) out.push({ classId: t.classId, className: nm.c.get(String(t.classId)), subjectId: s.subjectId, subjectName: nm.s.get(String(s.subjectId)), startTime: s.startTime, endTime: s.endTime, room: s.room || '' });
    out.sort((a, b) => TT.toMin(a.startTime) - TT.toMin(b.startTime)); res.json({ day, lessons: out });
  } catch (e) { fail(res, e); }
};
exports.colleagues = async (req, res) => { try { res.json({ teachers: (await Teacher.find({ schoolId: sid(req), _id: { $ne: me(req) } }).select('name').sort({ name: 1 })).map((t) => ({ _id: t._id, name: t.name })) }); } catch (e) { fail(res, e); } };
exports.mine = async (req, res) => {
  try {
    const schoolId = sid(req); const teacherId = isAdmin(req) ? req.query.teacherId : me(req); if (!isId(teacherId)) return res.status(400).json({ message: 'Choose a teacher.' });
    const from = weekStart(H.isDate(req.query.from) ? req.query.from : H.todayStr()); const to = H.addDays(from, 5); const nm = await nameMaps(schoolId);
    const byDay = {}; for (const t of await Timetable.find({ schoolId, isActive: { $ne: false } })) for (const s of t.slots || []) if (!s.isBreak && String(s.teacherId) === String(teacherId)) (byDay[t.dayOfWeek] ||= []).push({ classId: String(t.classId), className: nm.c.get(String(t.classId)), subjectName: nm.s.get(String(s.subjectId)) || '', startTime: s.startTime, endTime: s.endTime, room: s.room || '' });
    const covers = await Cover.find({ schoolId, date: { $gte: from, $lte: to }, status: { $ne: 'Cancelled' }, $or: [{ absentTeacherId: teacherId }, { coverTeacherId: teacherId }] });
    const days = H.range(from, to).map((date) => {
      const lessons = (byDay[dayOf(date)] || []).map((l) => { const c = covers.find((x) => x.date === date && String(x.absentTeacherId) === String(teacherId) && String(x.classId) === l.classId && x.startTime === l.startTime); return { ...l, state: !c ? 'normal' : c.status === 'Assigned' ? 'covered' : 'cover-needed', coverName: c?.coverTeacherId ? nm.t.get(String(c.coverTeacherId)) : '', swap: c?.source === 'swap' }; });
      for (const c of covers) if (c.date === date && String(c.coverTeacherId) === String(teacherId) && c.status === 'Assigned') lessons.push({ coverId: c._id, classId: String(c.classId), className: nm.c.get(String(c.classId)), subjectName: nm.s.get(String(c.subjectId)) || '', startTime: c.startTime, endTime: c.endTime, room: '', state: 'cover', coverName: '', swap: c.source === 'swap', forName: nm.t.get(String(c.absentTeacherId)), response: c.response });
      return { date, day: dayOf(date), lessons: lessons.sort((a, b) => TT.toMin(a.startTime) - TT.toMin(b.startTime)) };
    });
    const wl = (await workloadOf(schoolId, teacherId)).teachers[0] || null;
    res.json({ from, to, days, workload: wl });
  } catch (e) { fail(res, e); }
};
const lessonOf = (l) => ({ classId: l.classId, startTime: l.startTime, endTime: l.endTime });
const swapView = async (schoolId, rows) => { const nm = await nameMaps(schoolId); return rows.map((r) => { const o = JSON.parse(JSON.stringify(r)); o.requesterName = nm.t.get(String(r.requesterId)); o.peerName = nm.t.get(String(r.peerId)); for (const k of ['requesterLesson', 'peerLesson']) { o[k].className = nm.c.get(String(r[k].classId)); o[k].subjectName = nm.s.get(String(r[k].subjectId)) || ''; } return o; }); };
exports.listSwaps = async (req, res) => {
  try {
    const q = { schoolId: sid(req) }; if (!isAdmin(req)) q.$or = [{ requesterId: me(req) }, { peerId: me(req) }]; if (req.query.status) q.status = req.query.status;
    res.json({ swaps: await swapView(sid(req), await Swap.find(q).sort({ date: -1 }).limit(200)) });
  } catch (e) { fail(res, e); }
};
exports.createSwap = async (req, res) => {
  try {
    const schoolId = sid(req); const b = req.body || {}; const date = str(b.date, 10);
    if (!H.isDate(date) || date < H.todayStr()) return res.status(400).json({ message: 'Choose today or a later date.' });
    const requesterId = isAdmin(req) ? b.requesterId : me(req); if (!isId(requesterId) || !isId(b.peerId)) return res.status(400).json({ message: 'Choose both teachers.' });
    if (String(requesterId) === String(b.peerId)) return res.status(400).json({ message: 'Choose a different teacher to swap with.' });
    const [a, p] = [b.myLesson || {}, b.peerLesson || {}]; const day = dayOf(date); const sa = await slotFor(schoolId, a.classId, day, a.startTime, a.endTime); const sp = await slotFor(schoolId, p.classId, day, p.startTime, p.endTime);
    if (!sa || String(sa.teacherId) !== String(requesterId)) return res.status(422).json({ message: 'You do not teach the lesson you offered at that time.' });
    if (!sp || String(sp.teacherId) !== String(b.peerId)) return res.status(422).json({ message: 'The other teacher does not teach the lesson you chose at that time.' });
    const reason = str(b.reason, 200); if (reason.length < 3) return res.status(400).json({ message: 'Say why you want to swap.' });
    const err = await swapProblem(schoolId, date, requesterId, b.peerId, a, p, null); if (err) return res.status(422).json({ message: err });
    const s = await Swap.create({ schoolId, date, requesterId, peerId: b.peerId, requesterLesson: { ...lessonOf(a), subjectId: sa.subjectId, room: sa.room }, peerLesson: { ...lessonOf(p), subjectId: sp.subjectId, room: sp.room }, reason });
    await audit(req, { action: 'timetable.swap.request', entityType: 'TimetableSwap', entityId: s._id, schoolId, detail: { date } });
    const who = (await Teacher.findById(requesterId).select('name'))?.name || 'A colleague';
    await N.notify({ schoolId, recipients: [{ id: b.peerId, role: 'teacher' }], title: 'A colleague asks to swap a lesson', body: `${who}, ${date}. ${reason}`, link: { teacher: '/teacher?tab=timetablePlan' }, key: `swap-req-${s._id}` });
    res.status(201).json({ swap: s });
  } catch (e) { fail(res, e); }
};
// why a swap cannot happen (null when fine). Each teacher must be free when they take the other's lesson.
async function swapProblem(schoolId, date, aId, bId, la, lb, exceptSwapId) {
  const busyCover = await Cover.find({ schoolId, date, status: { $ne: 'Cancelled' }, $or: [{ classId: la.classId, startTime: la.startTime }, { classId: lb.classId, startTime: lb.startTime }] });
  if (busyCover.length) return 'One of those lessons already has cover arranged.';
  const open = await Swap.find({ schoolId, date, status: { $in: ['Requested', 'PeerAccepted'] } });
  if (open.some((o) => String(o._id) !== String(exceptSwapId) && [o.requesterLesson, o.peerLesson].some((x) => [la, lb].some((y) => String(x.classId) === String(y.classId) && x.startTime === y.startTime)))) return 'Another swap is already waiting for one of those lessons.';
  const mk = (l) => ({ date, classId: l.classId, startTime: l.startTime, endTime: l.endTime });
  const [wa, wb] = await Promise.all([hr.coverFree(schoolId, aId, mk(lb), null, la), hr.coverFree(schoolId, bId, mk(la), null, lb)]);
  if (wa) return `The first teacher ${wa}.`; if (wb) return `The other teacher ${wb}.`; return null;
}
exports.respondSwap = async (req, res) => {
  try {
    const schoolId = sid(req); const s = isId(req.params.id) ? await Swap.findOne({ _id: req.params.id, schoolId, peerId: me(req) }) : null; if (!s) return res.status(404).json({ message: 'Swap not found.' });
    if (s.status !== 'Requested') return res.status(409).json({ message: 'You have already answered this swap.' }); if (s.date < H.todayStr()) return res.status(422).json({ message: 'That date has passed.' });
    s.peerNote = str(req.body?.note, 200);
    if (req.body?.response === 'decline') { s.status = 'Declined'; await s.save(); await N.notify({ schoolId, recipients: [{ id: s.requesterId, role: 'teacher' }], title: 'Your swap was declined', body: `${s.date}. ${s.peerNote}`, key: `swap-no-${s._id}` }); await audit(req, { action: 'timetable.swap.decline', entityType: 'TimetableSwap', entityId: s._id, schoolId }); return res.json({ swap: s }); }
    if (req.body?.response !== 'accept') return res.status(400).json({ message: 'Choose accept or decline.' });
    const err = await swapProblem(schoolId, s.date, s.requesterId, s.peerId, s.requesterLesson, s.peerLesson, s._id); if (err) return res.status(422).json({ message: err });
    s.status = 'PeerAccepted'; await s.save(); await audit(req, { action: 'timetable.swap.accept', entityType: 'TimetableSwap', entityId: s._id, schoolId });
    await N.notify({ schoolId, recipients: await N.admins(schoolId), title: 'A lesson swap needs approval', body: `${s.date}: both teachers agree.`, link: { admin: '/admin?tab=timetablePlan' }, key: `swap-ok-${s._id}` });
    res.json({ swap: s });
  } catch (e) { fail(res, e); }
};
exports.decideSwap = async (req, res) => {
  try {
    const schoolId = sid(req); const s = isId(req.params.id) ? await Swap.findOne({ _id: req.params.id, schoolId }) : null; if (!s) return res.status(404).json({ message: 'Swap not found.' });
    if (s.status !== 'PeerAccepted') return res.status(422).json({ message: s.status === 'Requested' ? 'The other teacher has not agreed yet.' : `This swap is ${s.status.toLowerCase()}.` });
    s.decisionNote = str(req.body?.note, 200); s.decidedByName = req.actorName || ''; s.decidedAt = new Date();
    if (req.body?.decision === 'decline') { s.status = 'Declined'; await s.save(); await N.notify({ schoolId, recipients: [{ id: s.requesterId, role: 'teacher' }, { id: s.peerId, role: 'teacher' }], title: 'A lesson swap was not approved', body: `${s.date}. ${s.decisionNote}`, key: `swap-rej-${s._id}` }); await audit(req, { action: 'timetable.swap.reject', entityType: 'TimetableSwap', entityId: s._id, schoolId }); return res.json({ swap: s }); }
    if (req.body?.decision !== 'approve') return res.status(400).json({ message: 'Choose approve or decline.' });
    if (s.date < H.todayStr()) return res.status(422).json({ message: 'That date has passed.' });
    const err = await swapProblem(schoolId, s.date, s.requesterId, s.peerId, s.requesterLesson, s.peerLesson, s._id); if (err) return res.status(422).json({ message: err });
    const mk = (l, away, cover) => ({ schoolId, source: 'swap', swapId: s._id, date: s.date, classId: l.classId, startTime: l.startTime, endTime: l.endTime, subjectId: l.subjectId, absentTeacherId: away, coverTeacherId: cover, status: 'Assigned', assignedByName: req.actorName || '', reason: 'Lesson swap', response: 'Accepted' });
    await Cover.create(mk(s.requesterLesson, s.requesterId, s.peerId)); await Cover.create(mk(s.peerLesson, s.peerId, s.requesterId));
    s.status = 'Approved'; await s.save(); await audit(req, { action: 'timetable.swap.approve', entityType: 'TimetableSwap', entityId: s._id, schoolId, detail: { date: s.date } });
    await N.notify({ schoolId, recipients: [{ id: s.requesterId, role: 'teacher' }, { id: s.peerId, role: 'teacher' }], title: 'Your lesson swap is approved', body: `${s.date}. Check your timetable for the changed lessons.`, link: { teacher: '/teacher?tab=timetablePlan' }, key: `swap-yes-${s._id}` });
    res.json({ swap: s });
  } catch (e) { fail(res, e); }
};
exports.cancelSwap = async (req, res) => {
  try {
    const schoolId = sid(req); const s = isId(req.params.id) ? await Swap.findOne({ _id: req.params.id, schoolId }) : null; if (!s) return res.status(404).json({ message: 'Swap not found.' });
    if (!isAdmin(req) && ![String(s.requesterId), String(s.peerId)].includes(String(me(req)))) return res.status(404).json({ message: 'Swap not found.' });
    if (!['Requested', 'PeerAccepted', 'Approved'].includes(s.status)) return res.status(422).json({ message: `This swap is ${s.status.toLowerCase()}.` }); if (s.status === 'Approved' && s.date < H.todayStr()) return res.status(422).json({ message: 'That day has passed.' });
    const wasApproved = s.status === 'Approved'; s.status = 'Cancelled'; await s.save(); if (wasApproved) await Cover.updateMany({ schoolId, swapId: s._id }, { status: 'Cancelled' });
    await audit(req, { action: 'timetable.swap.cancel', entityType: 'TimetableSwap', entityId: s._id, schoolId });
    await N.notify({ schoolId, recipients: [{ id: s.requesterId, role: 'teacher' }, { id: s.peerId, role: 'teacher' }], exclude: me(req), title: 'A lesson swap was cancelled', body: s.date, key: `swap-x-${s._id}` }); res.json({ swap: s });
  } catch (e) { fail(res, e); }
};

/* ───────── desk overview ───────── */
exports.overview = async (req, res) => {
  try {
    const schoolId = sid(req); const today = H.todayStr();
    const [rooms, conflicts, wl, latest, needed, proposed, swaps] = await Promise.all([Room.countDocuments({ schoolId, active: true }), TT.findConflicts(schoolId), workloadOf(schoolId), Version.findOne({ schoolId }).sort({ number: -1 }).select('number publishedAt'),
      Cover.countDocuments({ schoolId, status: 'Needed', date: { $gte: today } }), Cover.countDocuments({ schoolId, status: 'Proposed', date: { $gte: today } }), Swap.countDocuments({ schoolId, status: 'PeerAccepted', date: { $gte: today } })]);
    const cur = await snapshotOf(schoolId); const unpublished = diffSnap(latest ? (await Version.findOne({ schoolId, number: latest.number })).snapshot : [], cur).length;
    res.json({ rooms, conflicts: conflicts.length, workloadExceptions: wl.teachers.filter((t) => t.exceptions.length).length, latestVersion: latest ? { number: latest.number, publishedAt: latest.publishedAt } : null, unpublishedClasses: unpublished, coverNeeded: needed, coverProposed: proposed, swapsWaiting: swaps });
  } catch (e) { fail(res, e); }
};
