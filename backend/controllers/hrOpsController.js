// Day-to-day HR (PRD E07): shifts and roster, staff attendance, leave, cover, overtime, advances.
const mongoose = require('../lib/pgdoc');
const Employee = require('../models/Employee'); const Shift = require('../models/Shift'); const Roster = require('../models/RosterEntry'); const SAtt = require('../models/StaffAttendance'); const Leave = require('../models/LeaveRequest');
const Cover = require('../models/CoverAssignment'); const Overtime = require('../models/OvertimeEntry'); const Advance = require('../models/StaffAdvance'); const Timetable = require('../models/Timetable'); const Teacher = require('../models/Teacher');
const Record = require('../models/EmployeeRecord'); const PayrollBatch = require('../models/PayrollBatch'); const AppSetting = require('../models/AppSetting');
const H = require('../utils/hr'); const N = require('../utils/notify'); const { audit } = require('../utils/audit');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const whole = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const emp = (sid, id) => (isId(id) ? Employee.findOne({ _id: id, schoolId: sid }) : null);

const settings = async (sid) => { const s = await AppSetting.findOne({ key: `hr:${sid}` }); return { ...H.DEFAULTS, ...(s?.value || {}) }; };
exports.settings = settings;
exports.getSettings = async (req, res) => { try { res.json({ settings: await settings(req.user.schoolId) }); } catch (e) { fail(res, e); } };
exports.putSettings = async (req, res) => {
  try {
    const b = req.body || {}; const cur = await settings(req.user.schoolId); const next = { ...cur };
    for (const k of ['annual', 'sick', 'casual', 'lateGraceMinutes', 'maxAdvanceMultiple']) if (b[k] !== undefined) { const n = whole(b[k]); if (!(n >= 0 && n <= 366)) return res.status(400).json({ message: `${k} must be a whole number from 0 to 366.` }); next[k] = n; }
    if (b.overtimeMultiplier !== undefined) { const n = Number(b.overtimeMultiplier); if (!(n >= 1 && n <= 4)) return res.status(400).json({ message: 'The overtime multiplier is between 1 and 4.' }); next.overtimeMultiplier = n; }
    await AppSetting.updateOne({ key: `hr:${req.user.schoolId}` }, { $set: { value: next } }, { upsert: true }); await audit(req, { action: 'hr.settings', entityType: 'AppSetting', entityId: 'hr', schoolId: req.user.schoolId, detail: next }); res.json({ settings: next });
  } catch (e) { fail(res, e); }
};

/* ───────── leave ───────── */
const usedDays = async (sid, employeeId, type, year) => (await Leave.find({ schoolId: sid, employeeId, type, status: 'Approved', fromDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } })).reduce((t, l) => t + l.days, 0);
async function leaveBalances(sid, e) {
  const st = await settings(sid); const year = new Date().getFullYear(); const out = {};
  for (const t of ['annual', 'sick', 'casual']) { const used = await usedDays(sid, e._id, t, year); out[t] = { entitled: st[t], used, left: Math.max(0, st[t] - used) }; }
  out.unpaid = { used: await usedDays(sid, e._id, 'unpaid', year) }; return out;
}
exports.leaveBalances = leaveBalances;
const onLeave = async (sid, employeeId, date) => !!(await Leave.findOne({ schoolId: sid, employeeId, status: 'Approved', fromDate: { $lte: date }, toDate: { $gte: date } }));

async function requestLeave(req, res, e) {
  const sid = req.user.schoolId; const b = req.body || {};
  if (e.status !== 'Active') return res.status(422).json({ message: 'Only an active employee can take leave.' }); if (!['annual', 'sick', 'casual', 'unpaid'].includes(b.type)) return res.status(400).json({ message: 'Choose the kind of leave.' });
  if (!H.isDate(b.fromDate) || !H.isDate(b.toDate)) return res.status(400).json({ message: 'Choose the first and last day.' }); if (b.toDate < b.fromDate) return res.status(400).json({ message: 'The last day cannot be before the first day.' });
  if (str(b.reason).length < 3) return res.status(400).json({ message: 'Write the reason.' });
  const days = H.workDays(b.fromDate, b.toDate).length; if (!days) return res.status(422).json({ message: 'Those dates are only days off.' }); if (days > 90) return res.status(400).json({ message: 'Ask for at most 90 days at a time.' });
  const clash = await Leave.findOne({ schoolId: sid, employeeId: e._id, status: { $in: ['Requested', 'Approved'] }, fromDate: { $lte: b.toDate }, toDate: { $gte: b.fromDate } });
  if (clash) return res.status(422).json({ message: `This overlaps leave from ${clash.fromDate} to ${clash.toDate}.` });
  if (b.type !== 'unpaid') { const bal = (await leaveBalances(sid, e))[b.type]; if (days > bal.left) return res.status(422).json({ message: `Only ${bal.left} ${b.type} days are left this year, and ${days} were asked for.` }); }
  const l = await Leave.create({ schoolId: sid, employeeId: e._id, type: b.type, fromDate: b.fromDate, toDate: b.toDate, days, reason: str(b.reason, 300), requestedByName: req.actorName || e.name });
  await audit(req, { action: 'hr.leave.request', entityType: 'LeaveRequest', entityId: l._id, schoolId: sid, detail: { employee: e.code, days, type: l.type } });
  await N.notify({ schoolId: sid, recipients: await N.admins(sid), title: 'Leave request', body: `${e.name}: ${days} day${days > 1 ? 's' : ''} from ${b.fromDate}`, link: '/admin/dashboard#/staff', type: 'general' });
  return res.status(201).json({ leave: l });
}
exports.requestLeave = async (req, res) => { try { const e = await emp(req.user.schoolId, req.body?.employeeId); if (!e) return res.status(404).json({ message: 'Employee not found' }); await requestLeave(req, res, e); } catch (e) { fail(res, e); } };
exports.requestLeaveMine = async (req, res) => { try { const e = await Employee.findOne({ schoolId: req.user.schoolId, teacherId: req.user.userId }); if (!e) return res.status(404).json({ message: 'You have no staff record yet. Ask the office.' }); await requestLeave(req, res, e); } catch (e) { fail(res, e); } };

async function makeCover(sid, leave, e) {
  if (!e.teacherId) return 0; let n = 0;
  for (const date of H.workDays(leave.fromDate, leave.toDate)) {
    const tts = await Timetable.find({ schoolId: sid, dayOfWeek: H.DAYNAMES[H.dow(date)], isActive: { $ne: false } });
    for (const t of tts) for (const s of t.slots || []) { if (s.isBreak || String(s.teacherId) !== String(e.teacherId)) continue; await Cover.create({ schoolId: sid, leaveId: leave._id, absentTeacherId: e.teacherId, date, classId: t.classId, startTime: s.startTime, endTime: s.endTime, subjectId: s.subjectId }); n++; }
  }
  return n;
}
exports.decideLeave = async (req, res) => {
  try {
    const sid = req.user.schoolId; const l = isId(req.params.id) ? await Leave.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!l) return res.status(404).json({ message: 'Leave request not found' });
    const d = req.body?.decision; if (!['approve', 'reject'].includes(d)) return res.status(400).json({ message: 'Choose approve or reject.' });
    if (l.status !== 'Requested') return res.status(422).json({ message: `This request was already ${l.status.toLowerCase()}.` }); if (d === 'reject' && str(req.body?.note).length < 3) return res.status(400).json({ message: 'Write why it is rejected.' });
    const e = await Employee.findOne({ _id: l.employeeId, schoolId: sid });
    if (d === 'approve' && l.type !== 'unpaid') { const bal = (await leaveBalances(sid, e))[l.type]; if (l.days > bal.left) return res.status(422).json({ message: `Only ${bal.left} ${l.type} days are left, so this cannot be approved.` }); }
    l.status = d === 'approve' ? 'Approved' : 'Rejected'; l.decidedByName = req.actorName || ''; l.decidedAt = new Date(); l.decisionNote = str(req.body?.note, 200); await l.save();
    let cover = 0; if (d === 'approve') cover = await makeCover(sid, l, e);
    await audit(req, { action: `hr.leave.${d}`, entityType: 'LeaveRequest', entityId: l._id, schoolId: sid, detail: { employee: e.code, days: l.days, coverNeeded: cover } });
    if (e.teacherId) await N.notify({ schoolId: sid, recipients: [{ id: e.teacherId, role: 'teacher' }], title: `Leave ${l.status.toLowerCase()}`, body: `${l.fromDate} to ${l.toDate}`, type: 'general' });
    if (cover) await N.notify({ schoolId: sid, recipients: await N.admins(sid), title: 'Cover needed', body: `${cover} lesson${cover > 1 ? 's' : ''} need a teacher while ${e.name} is away`, link: '/admin/dashboard#/staff', type: 'general' });
    res.json({ leave: l, coverNeeded: cover });
  } catch (e) { fail(res, e); }
};
exports.cancelLeave = async (req, res) => {
  try {
    const sid = req.user.schoolId; const l = isId(req.params.id) ? await Leave.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!l) return res.status(404).json({ message: 'Leave request not found' });
    if (req.user.role === 'teacher') { const me = await Employee.findOne({ schoolId: sid, teacherId: req.user.userId }); if (!me || String(me._id) !== String(l.employeeId)) return res.status(404).json({ message: 'Leave request not found' }); }
    if (!['Requested', 'Approved'].includes(l.status)) return res.status(422).json({ message: `This request is ${l.status.toLowerCase()}.` }); if (l.status === 'Approved' && l.fromDate <= H.todayStr()) return res.status(422).json({ message: 'Leave that has started cannot be cancelled. Ask HR to correct attendance instead.' });
    const wasApproved = l.status === 'Approved'; l.status = 'Cancelled'; await l.save();
    if (wasApproved) { const cv = await Cover.find({ schoolId: sid, leaveId: l._id, status: { $ne: 'Cancelled' } }); for (const c of cv) { if (c.coverTeacherId) await N.notify({ schoolId: sid, recipients: [{ id: c.coverTeacherId, role: 'teacher' }], title: 'Cover cancelled', body: `${c.date} ${c.startTime}: the teacher is back`, type: 'general' }); c.status = 'Cancelled'; await c.save(); } }
    await audit(req, { action: 'hr.leave.cancel', entityType: 'LeaveRequest', entityId: l._id, schoolId: sid }); res.json({ leave: l });
  } catch (e) { fail(res, e); }
};
exports.listLeave = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { p, l } = pg(req.query); const q = { schoolId: sid }; if (req.query.status) q.status = String(req.query.status); if (isId(req.query.employeeId)) q.employeeId = req.query.employeeId;
    const [rows, total] = await Promise.all([Leave.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Leave.countDocuments(q)]);
    const names = new Map((await Employee.find({ schoolId: sid, _id: { $in: rows.map((r) => r.employeeId) } }).select('name code')).map((x) => [String(x._id), x.name]));
    res.json({ leave: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), employeeName: names.get(String(r.employeeId)) || '' })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};

/* ───────── cover ───────── */
const free = async (sid, teacherId, c, exceptCoverId) => {
  const day = H.DAYNAMES[H.dow(c.date)];
  const tts = await Timetable.find({ schoolId: sid, dayOfWeek: day, isActive: { $ne: false } });
  for (const t of tts) for (const s of t.slots || []) if (!s.isBreak && String(s.teacherId) === String(teacherId) && H.overlap(s.startTime, s.endTime, c.startTime, c.endTime)) return 'teaches another class at that time';
  const other = await Cover.find({ schoolId: sid, coverTeacherId: teacherId, date: c.date, status: 'Assigned' });
  if (other.some((o) => String(o._id) !== String(exceptCoverId) && H.overlap(o.startTime, o.endTime, c.startTime, c.endTime))) return 'is already covering another lesson then';
  const e = await Employee.findOne({ schoolId: sid, teacherId });
  if (e) { if (e.status !== 'Active') return 'is not an active employee'; if (await onLeave(sid, e._id, c.date)) return 'is on approved leave'; const bad = await Record.findOne({ schoolId: sid, employeeId: e._id, kind: 'training', mandatory: true, expiresOn: { $lt: new Date() } }); if (bad) return `has expired mandatory training (${bad.title})`; }
  return null;
};
exports.listCover = async (req, res) => {
  try {
    const sid = req.user.schoolId; const q = { schoolId: sid, status: req.query.status || { $ne: 'Cancelled' } }; if (req.query.date) q.date = String(req.query.date); else if (req.query.from) q.date = { $gte: String(req.query.from) };
    const rows = await Cover.find(q).sort({ date: 1, startTime: 1 }).limit(300); const ids = [...new Set(rows.flatMap((r) => [r.absentTeacherId, r.coverTeacherId].filter(Boolean).map(String)))];
    const t = new Map((await Teacher.find({ schoolId: sid, _id: { $in: ids } }).select('name')).map((x) => [String(x._id), x.name]));
    const Class = require('../models/Class'); const cl = new Map((await Class.find({ schoolId: sid }).select('standard division')).map((x) => [String(x._id), `${x.standard}-${x.division}`]));
    res.json({ cover: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), absentName: t.get(String(r.absentTeacherId)), coverName: r.coverTeacherId ? t.get(String(r.coverTeacherId)) : null, className: cl.get(String(r.classId)) })) });
  } catch (e) { fail(res, e); }
};
exports.coverCandidates = async (req, res) => {
  try {
    const sid = req.user.schoolId; const c = isId(req.params.id) ? await Cover.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!c) return res.status(404).json({ message: 'Cover lesson not found' });
    const teachers = await Teacher.find({ schoolId: sid, _id: { $ne: c.absentTeacherId } }).select('name'); const out = [];
    for (const t of teachers) { const why = await free(sid, t._id, c, c._id); if (!why) out.push({ _id: t._id, name: t.name }); }
    res.json({ candidates: out });
  } catch (e) { fail(res, e); }
};
exports.assignCover = async (req, res) => {
  try {
    const sid = req.user.schoolId; const c = isId(req.params.id) ? await Cover.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!c) return res.status(404).json({ message: 'Cover lesson not found' });
    if (c.status === 'Cancelled') return res.status(422).json({ message: 'This cover is cancelled because the leave was cancelled.' });
    if (req.body?.unassign) { c.coverTeacherId = null; c.status = 'Needed'; await c.save(); await audit(req, { action: 'hr.cover.unassign', entityType: 'CoverAssignment', entityId: c._id, schoolId: sid }); return res.json({ cover: c }); }
    const t = isId(req.body?.coverTeacherId) ? await Teacher.findOne({ _id: req.body.coverTeacherId, schoolId: sid }) : null; if (!t) return res.status(404).json({ message: 'Teacher not found' }); if (String(t._id) === String(c.absentTeacherId)) return res.status(422).json({ message: 'The absent teacher cannot cover their own lesson.' });
    const why = await free(sid, t._id, c, c._id); if (why) return res.status(422).json({ message: `${t.name} ${why}.` });
    c.coverTeacherId = t._id; c.status = 'Assigned'; c.assignedByName = req.actorName || ''; await c.save();
    await audit(req, { action: 'hr.cover.assign', entityType: 'CoverAssignment', entityId: c._id, schoolId: sid, detail: { date: c.date, start: c.startTime } });
    await N.notify({ schoolId: sid, recipients: [{ id: t._id, role: 'teacher' }], title: 'You are covering a lesson', body: `${c.date} ${c.startTime}-${c.endTime}`, type: 'general' }); res.json({ cover: c });
  } catch (e) { fail(res, e); }
};

/* ───────── shifts and roster ───────── */
const hhmm = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
exports.createShift = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; if (str(b.name).length < 2) return res.status(400).json({ message: 'Name the shift.' }); if (!hhmm(b.startTime) || !hhmm(b.endTime)) return res.status(400).json({ message: 'Enter start and end times like 07:30.' });
    const br = b.breakMinutes === undefined ? 0 : whole(b.breakMinutes); if (!(br >= 0 && br <= 240)) return res.status(400).json({ message: 'Break minutes are 0 to 240.' });
    const mins = H.toMin(b.endTime) - H.toMin(b.startTime) - br; if (mins <= 0) return res.status(400).json({ message: 'The shift must end after it starts.' });
    const s = await Shift.create({ schoolId: sid, name: str(b.name, 40), startTime: b.startTime, endTime: b.endTime, breakMinutes: br, hours: Math.round((mins / 60) * 100) / 100 }); await audit(req, { action: 'hr.shift.create', entityType: 'Shift', entityId: s._id, schoolId: sid }); res.status(201).json({ shift: s });
  } catch (e) { fail(res, e); }
};
exports.listShifts = async (req, res) => { try { res.json({ shifts: await Shift.find({ schoolId: req.user.schoolId, isActive: true }).sort({ startTime: 1 }) }); } catch (e) { fail(res, e); } };
exports.assignRoster = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const shift = isId(b.shiftId) ? await Shift.findOne({ _id: b.shiftId, schoolId: sid, isActive: true }) : null; if (!shift) return res.status(404).json({ message: 'Shift not found' });
    const ids = Array.isArray(b.employeeIds) ? b.employeeIds : [b.employeeId]; const dates = Array.isArray(b.dates) ? b.dates : [b.date];
    if (!ids.filter(Boolean).length || !dates.filter(Boolean).length) return res.status(400).json({ message: 'Choose who and which days.' }); if (dates.some((d) => !H.isDate(d))) return res.status(400).json({ message: 'Every date must look like 2026-11-24.' }); if (ids.length * dates.length > 500) return res.status(400).json({ message: 'Too many at once. Roster at most 500 shifts per request.' });
    const done = []; const skipped = []; const warnings = [];
    for (const id of ids) {
      const e = await emp(sid, id); if (!e) return res.status(404).json({ message: 'Employee not found' }); if (e.status !== 'Active') { skipped.push({ employee: e.name, why: 'Not an active employee' }); continue; }
      for (const date of dates) {
        if (H.dow(date) === 0) { skipped.push({ employee: e.name, date, why: 'Sunday is the weekly day off' }); continue; } if (await onLeave(sid, e._id, date)) { skipped.push({ employee: e.name, date, why: 'On approved leave' }); continue; }
        await Roster.updateOne({ schoolId: sid, employeeId: e._id, date }, { $set: { shiftId: shift._id, hours: shift.hours, startTime: shift.startTime, endTime: shift.endTime, status: 'Draft' } }, { upsert: true }); done.push({ employee: e.name, date });
      }
      const wk = new Map(); (await Roster.find({ schoolId: sid, employeeId: e._id, date: { $gte: H.addDays([...dates].sort()[0], -7), $lte: H.addDays([...dates].sort().pop(), 7) } })).forEach((r) => { const monday = H.addDays(r.date, -((H.dow(r.date) + 6) % 7)); wk.set(monday, (wk.get(monday) || 0) + r.hours); });
      wk.forEach((h, w) => { if (h > 48) warnings.push(`${e.name} is rostered ${h} hours in the week of ${w}. That is over 48 hours, so overtime may follow.`); });
    }
    await audit(req, { action: 'hr.roster.assign', entityType: 'RosterEntry', entityId: String(shift._id), schoolId: sid, detail: { assigned: done.length, skipped: skipped.length } }); res.status(201).json({ assigned: done.length, skipped, warnings });
  } catch (e) { fail(res, e); }
};
exports.publishRoster = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { from, to } = req.body || {}; if (!H.isDate(from) || !H.isDate(to) || to < from) return res.status(400).json({ message: 'Choose the first and last day to publish.' });
    const rows = await Roster.find({ schoolId: sid, date: { $gte: from, $lte: to }, status: 'Draft' }); for (const r of rows) { r.status = 'Published'; await r.save(); }
    const eids = [...new Set(rows.map((r) => String(r.employeeId)))]; const teachers = (await Employee.find({ schoolId: sid, _id: { $in: eids }, teacherId: { $ne: null } }).select('teacherId')).map((e) => ({ id: e.teacherId, role: 'teacher' }));
    if (teachers.length) await N.notify({ schoolId: sid, recipients: teachers, title: 'Roster published', body: `${from} to ${to}`, type: 'general' });
    await audit(req, { action: 'hr.roster.publish', entityType: 'RosterEntry', entityId: `${from}..${to}`, schoolId: sid, detail: { published: rows.length } }); res.json({ published: rows.length });
  } catch (e) { fail(res, e); }
};
exports.listRoster = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { from, to } = req.query; if (!H.isDate(from) || !H.isDate(to) || to < from || H.range(from, to).length > 62) return res.status(400).json({ message: 'Choose up to two months.' });
    const rows = await Roster.find({ schoolId: sid, date: { $gte: from, $lte: to } }).sort({ date: 1 }); const names = new Map((await Employee.find({ schoolId: sid }).select('name')).map((e) => [String(e._id), e.name]));
    res.json({ roster: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), employeeName: names.get(String(r.employeeId)) })) });
  } catch (e) { fail(res, e); }
};

/* ───────── staff attendance ───────── */
exports.markAttendance = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const e = await emp(sid, b.employeeId); if (!e) return res.status(404).json({ message: 'Employee not found' });
    if (e.status !== 'Active') return res.status(422).json({ message: 'Only an active employee has attendance.' }); if (!H.isDate(b.date)) return res.status(400).json({ message: 'Choose the date.' }); if (b.date > H.todayStr()) return res.status(422).json({ message: 'Attendance cannot be recorded for a future day.' });
    if (!['manual', 'badge', 'biometric'].includes(b.source || 'manual')) return res.status(400).json({ message: 'Unknown source.' });
    for (const k of ['checkIn', 'checkOut']) if (b[k] && !hhmm(b[k])) return res.status(400).json({ message: 'Times look like 07:45.' });
    if (b.checkIn && b.checkOut && H.toMin(b.checkOut) <= H.toMin(b.checkIn)) return res.status(400).json({ message: 'Check-out must be after check-in.' });
    if (await onLeave(sid, e._id, b.date) && b.status !== 'Leave') return res.status(422).json({ message: 'This person is on approved leave that day.' });
    const st = await settings(sid); const r = await Roster.findOne({ schoolId: sid, employeeId: e._id, date: b.date }); let status = b.status; let late = 0;
    if (b.checkIn && r?.startTime) late = Math.max(0, H.toMin(b.checkIn) - H.toMin(r.startTime)); if (!status) status = b.checkIn ? (late > st.lateGraceMinutes ? 'Late' : 'Present') : null;
    if (!['Present', 'Late', 'Absent', 'HalfDay', 'Leave'].includes(status)) return res.status(400).json({ message: 'Choose Present, Late, Absent or Half day.' });
    const worked = b.checkIn && b.checkOut ? H.toMin(b.checkOut) - H.toMin(b.checkIn) : 0; const prev = await SAtt.findOne({ schoolId: sid, employeeId: e._id, date: b.date });
    if (prev) {
      if (prev.source === 'biometric' && (b.source || 'manual') === 'manual' && str(b.reason).length < 5) return res.status(422).json({ message: 'A device record can be overridden only with a written reason.' });
      if (prev.status !== status && str(b.reason).length < 5) return res.status(422).json({ message: 'Changing a recorded day needs a reason.' });
      if (prev.status !== status) prev.corrections.push({ at: new Date(), byName: req.actorName || '', reason: str(b.reason, 200), from: prev.status, to: status });
      Object.assign(prev, { status, checkIn: b.checkIn || prev.checkIn, checkOut: b.checkOut || prev.checkOut, lateMinutes: late || (status === 'Late' ? prev.lateMinutes : 0), workedMinutes: worked || prev.workedMinutes }); prev.markModified('corrections'); await prev.save();
      await audit(req, { action: 'hr.attendance.correct', entityType: 'StaffAttendance', entityId: prev._id, schoolId: sid, detail: { date: b.date, status } }); return res.json({ attendance: prev, corrected: true });
    }
    const a = await SAtt.create({ schoolId: sid, employeeId: e._id, date: b.date, status, checkIn: b.checkIn, checkOut: b.checkOut, lateMinutes: late, workedMinutes: worked, source: b.source || 'manual' });
    await audit(req, { action: 'hr.attendance.mark', entityType: 'StaffAttendance', entityId: a._id, schoolId: sid, detail: { date: b.date, status } }); res.status(201).json({ attendance: a });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'That day was just recorded by someone else. Reload.' }); fail(res, e); }
};
exports.listAttendance = async (req, res) => {
  try {
    const sid = req.user.schoolId; const date = H.isDate(req.query.date) ? req.query.date : H.todayStr(); const emps = await Employee.find({ schoolId: sid, status: 'Active' }).sort({ name: 1 }); const att = new Map((await SAtt.find({ schoolId: sid, date })).map((a) => [String(a.employeeId), a]));
    const lv = await Leave.find({ schoolId: sid, status: 'Approved', fromDate: { $lte: date }, toDate: { $gte: date } }); const lset = new Set(lv.map((l) => String(l.employeeId))); const ros = new Map((await Roster.find({ schoolId: sid, date })).map((r) => [String(r.employeeId), r]));
    res.json({ date, rows: emps.map((e) => ({ employeeId: e._id, code: e.code, name: e.name, kind: e.kind, onLeave: lset.has(String(e._id)), rostered: ros.get(String(e._id)) ? `${ros.get(String(e._id)).startTime}-${ros.get(String(e._id)).endTime}` : null, attendance: att.get(String(e._id)) || null })) });
  } catch (e) { fail(res, e); }
};

/* ───────── overtime ───────── */
const closedPeriod = async (sid, period) => !!(await PayrollBatch.findOne({ schoolId: sid, period, status: 'Finalized' }));
exports.requestOvertime = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const e = await emp(sid, b.employeeId); if (!e) return res.status(404).json({ message: 'Employee not found' }); if (e.status !== 'Active') return res.status(422).json({ message: 'Only an active employee can have overtime.' });
    if (!H.isDate(b.date) || b.date > H.todayStr()) return res.status(400).json({ message: 'Choose a day that has already happened.' }); const hours = Number(b.hours); if (!(hours >= 0.5 && hours <= 12) || (hours * 2) % 1 !== 0) return res.status(400).json({ message: 'Hours must be from 0.5 to 12, in halves.' });
    if (str(b.reason).length < 5) return res.status(400).json({ message: 'Say what the extra work was.' }); if (await closedPeriod(sid, b.date.slice(0, 7))) return res.status(422).json({ message: 'That month’s payroll is already final.' });
    const o = await Overtime.create({ schoolId: sid, employeeId: e._id, date: b.date, hours, reason: str(b.reason, 200), period: b.date.slice(0, 7), requestedByName: req.actorName || '', requestedBy: req.user.userId });
    await audit(req, { action: 'hr.overtime.request', entityType: 'OvertimeEntry', entityId: o._id, schoolId: sid, detail: { employee: e.code, hours } }); res.status(201).json({ overtime: o });
  } catch (e) { fail(res, e); }
};
exports.decideOvertime = async (req, res) => {
  try {
    const sid = req.user.schoolId; const o = isId(req.params.id) ? await Overtime.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!o) return res.status(404).json({ message: 'Overtime entry not found' });
    if (String(o.requestedBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who entered overtime cannot approve it. Another admin must decide.' });
    if (o.status !== 'Requested') return res.status(422).json({ message: `This entry was already ${o.status.toLowerCase()}.` }); if (!['approve', 'reject'].includes(req.body?.decision)) return res.status(400).json({ message: 'Choose approve or reject.' });
    if (await closedPeriod(sid, o.period)) return res.status(422).json({ message: 'That month’s payroll is already final.' });
    o.status = req.body.decision === 'approve' ? 'Approved' : 'Rejected'; o.approvedByName = req.actorName || ''; o.decidedAt = new Date(); await o.save();
    await audit(req, { action: `hr.overtime.${req.body.decision}`, entityType: 'OvertimeEntry', entityId: o._id, schoolId: sid, detail: { hours: o.hours } }); res.json({ overtime: o });
  } catch (e) { fail(res, e); }
};
exports.listOvertime = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { p, l } = pg(req.query); const q = { schoolId: sid }; if (req.query.status) q.status = String(req.query.status); if (req.query.period) q.period = String(req.query.period);
    const [rows, total] = await Promise.all([Overtime.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Overtime.countDocuments(q)]); const names = new Map((await Employee.find({ schoolId: sid, _id: { $in: rows.map((r) => r.employeeId) } }).select('name')).map((x) => [String(x._id), x.name]));
    res.json({ overtime: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), employeeName: names.get(String(r.employeeId)) })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};

/* ───────── advances ───────── */
exports.requestAdvance = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const e = await emp(sid, b.employeeId); if (!e) return res.status(404).json({ message: 'Employee not found' }); if (e.status !== 'Active') return res.status(422).json({ message: 'Only an active employee can have an advance.' });
    const amount = whole(b.amount); const per = whole(b.monthlyRecovery); if (!(amount >= 1) || !(per >= 1)) return res.status(400).json({ message: 'Enter the amount and the monthly recovery in whole rupees.' }); if (per > amount) return res.status(400).json({ message: 'The monthly recovery cannot be more than the advance.' });
    const st = await settings(sid); if (!e.basicSalary) return res.status(422).json({ message: 'Set the basic salary first.' });
    const open = (await Advance.find({ schoolId: sid, employeeId: e._id, status: { $in: ['Requested', 'Active'] } })).reduce((t, a) => t + a.amount - a.recovered, 0);
    if (open + amount > e.basicSalary * st.maxAdvanceMultiple) return res.status(422).json({ message: `Advances together may not pass ${st.maxAdvanceMultiple} months of basic salary (Rs ${(e.basicSalary * st.maxAdvanceMultiple).toLocaleString('en-PK')}). Rs ${open.toLocaleString('en-PK')} is already open.` });
    if (per > Math.floor(e.basicSalary / 2)) return res.status(422).json({ message: 'The monthly recovery may not be more than half the basic salary.' }); if (str(b.reason).length < 3) return res.status(400).json({ message: 'Write the reason.' });
    const a = await Advance.create({ schoolId: sid, employeeId: e._id, amount, monthlyRecovery: per, reason: str(b.reason, 200), requestedBy: req.user.userId, requestedByName: req.actorName || '' });
    await audit(req, { action: 'hr.advance.request', entityType: 'StaffAdvance', entityId: a._id, schoolId: sid, detail: { employee: e.code, amount, per } }); res.status(201).json({ advance: a });
  } catch (e) { fail(res, e); }
};
exports.decideAdvance = async (req, res) => {
  try {
    const sid = req.user.schoolId; const a = isId(req.params.id) ? await Advance.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!a) return res.status(404).json({ message: 'Advance not found' });
    if (String(a.requestedBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who entered the advance cannot approve it. Another admin must decide.' }); if (a.status !== 'Requested') return res.status(422).json({ message: `This advance is already ${a.status.toLowerCase()}.` });
    if (!['approve', 'reject'].includes(req.body?.decision)) return res.status(400).json({ message: 'Choose approve or reject.' }); a.status = req.body.decision === 'approve' ? 'Active' : 'Rejected'; a.decidedByName = req.actorName || ''; a.decidedAt = new Date(); await a.save();
    await audit(req, { action: `hr.advance.${req.body.decision}`, entityType: 'StaffAdvance', entityId: a._id, schoolId: sid, detail: { amount: a.amount } }); res.json({ advance: a });
  } catch (e) { fail(res, e); }
};
exports.listAdvances = async (req, res) => { try { const sid = req.user.schoolId; const q = { schoolId: sid }; if (req.query.status) q.status = String(req.query.status); const rows = await Advance.find(q).sort({ createdAt: -1 }).limit(200); const names = new Map((await Employee.find({ schoolId: sid, _id: { $in: rows.map((r) => r.employeeId) } }).select('name')).map((x) => [String(x._id), x.name])); res.json({ advances: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), employeeName: names.get(String(r.employeeId)) })) }); } catch (e) { fail(res, e); } };
