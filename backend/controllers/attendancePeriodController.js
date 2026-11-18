// Period attendance (PRD E08, CAP-0368 and CAP-0373): presence for each scheduled lesson, not only the school day,
// with queued offline registers accepted once and judged by when they were really taken.
const mongoose = require('../lib/pgdoc');
const A = require('../utils/attendanceOps');
const { audit } = require('../utils/audit');
const { timeToMinutes, nowInTz } = require('../utils/time');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Timetable = require('../models/Timetable');
const CoverAssignment = require('../models/CoverAssignment');
const AttendanceEvidence = require('../models/AttendanceEvidence');
const School = require('../models/School');
const { manageClass } = require('./attendanceOpsController')._internals;

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const sid = (req) => req.user.schoolId;
const VALID = ['Present', 'Absent', 'Late', 'Leave'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (key) => DAYS[A.toUTCDay(key).getUTCDay()];

async function slotsOn(schoolId, key, { teacherId, classId } = {}) {
  const q = { schoolId, dayOfWeek: dayName(key), isActive: true }; if (classId) q.classId = classId;
  const tts = await Timetable.find(q);
  const out = [];
  for (const tt of tts) for (const s of tt.slots || []) {
    if (s.isBreak || !s.startTime || !s.endTime) continue;
    if (teacherId && String(s.teacherId) !== String(teacherId)) continue;
    out.push({ classId: tt.classId, subjectId: s.subjectId || null, startTime: s.startTime, endTime: s.endTime, room: s.room || '', teacherId: s.teacherId || null });
  }
  return out;
}
// is this person scheduled (or covering) for exactly this lesson?
async function scheduled(req, { classId, subjectId, startTime, endTime }, key) {
  if (req.user.role === 'admin') return true;
  if (await manageClass(req, classId)) return true;
  const mine = await slotsOn(sid(req), key, { teacherId: req.user.userId, classId });
  if (mine.some((s) => s.startTime === startTime && s.endTime === endTime && String(s.subjectId || '') === String(subjectId || ''))) return true;
  const covers = await CoverAssignment.find({ schoolId: sid(req), coverTeacherId: req.user.userId, date: key, status: 'Assigned' });
  return covers.some((c) => String(c.classId) === String(classId) && c.startTime === startTime && c.endTime === endTime && String(c.subjectId || '') === String(subjectId || ''));
}

// the teacher's lessons today, including lessons they cover
exports.today = async (req, res) => {
  try {
    const clock = await A.clock(sid(req)); const key = clock.dateKey;
    const lessons = (await slotsOn(sid(req), key, { teacherId: req.user.userId })).map((s) => ({ ...s, cover: false }));
    for (const c of await CoverAssignment.find({ schoolId: sid(req), coverTeacherId: req.user.userId, date: key, status: 'Assigned' })) lessons.push({ classId: c.classId, subjectId: c.subjectId || null, startTime: c.startTime, endTime: c.endTime, room: '', cover: true });
    const cls = new Map((await Class.find({ _id: { $in: lessons.map((l) => l.classId) } }).select('standard division')).map((c) => [String(c._id), `${c.standard}-${c.division}`]));
    const subj = new Map((await Subject.find({ _id: { $in: lessons.map((l) => l.subjectId).filter(Boolean) } }).select('name')).map((x) => [String(x._id), x.name]));
    const day = A.toUTCDay(key); const out = [];
    for (const l of lessons.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))) {
      const marked = await Attendance.countDocuments({ schoolId: sid(req), classId: l.classId, subjectId: l.subjectId || null, date: day });
      const total = await Student.countDocuments({ schoolId: sid(req), classId: l.classId, isActive: { $ne: false } });
      const start = timeToMinutes(l.startTime); const end = timeToMinutes(l.endTime);
      out.push({ ...l, className: cls.get(String(l.classId)) || '', subjectName: subj.get(String(l.subjectId)) || 'Lesson', windowStatus: clock.minutes < start ? 'upcoming' : clock.minutes < end ? 'open' : 'closed', marked, total });
    }
    res.json({ date: key, lessons: out });
  } catch (e) { fail(res, e); }
};

exports.roster = async (req, res) => {
  try {
    const { classId, subjectId, startTime, endTime } = req.query; const clock = await A.clock(sid(req)); const key = A.isDay(req.query.date) ? req.query.date : clock.dateKey;
    if (!isId(classId)) return res.status(400).json({ message: 'Choose the class.' });
    if (!(await Class.exists({ _id: classId, schoolId: sid(req) }))) return res.status(404).json({ message: 'Class not found.' });
    if (!(await scheduled(req, { classId, subjectId: subjectId || null, startTime, endTime }, key))) return res.status(403).json({ message: 'You are not scheduled for this lesson.' });
    const students = (await Student.find({ schoolId: sid(req), classId, isActive: { $ne: false } }).select('name rollNumber')).sort((a, b) => String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, { numeric: true }) || a.name.localeCompare(b.name));
    const day = A.toUTCDay(key);
    const [marks, leaves, gate] = await Promise.all([
      Attendance.find({ schoolId: sid(req), classId, subjectId: subjectId || null, date: day }),
      A.leaveMap(sid(req), students.map((s) => s._id), key),
      AttendanceEvidence.find({ schoolId: sid(req), kind: { $in: ['gate', 'badge', 'biometric'] }, studentId: { $in: students.map((s) => s._id) }, occurredAt: { $gte: new Date(day.getTime() - 86400000), $lte: new Date(day.getTime() + 2 * 86400000) } }),
    ]);
    const m = new Map(marks.map((x) => [String(x.userId), x])); const atGate = new Set(); for (const e of gate) if (e.direction === 'in' && (await A.localDay(sid(req), e.occurredAt)) === key) atGate.add(String(e.studentId));
    res.json({ date: key, students: students.map((s) => ({ _id: s._id, name: s.name, rollNumber: s.rollNumber || '', status: m.get(String(s._id))?.status || null, leave: leaves.get(String(s._id)) ? { kind: leaves.get(String(s._id)).kind, state: leaves.get(String(s._id)).state } : null, atGate: atGate.has(String(s._id)) })) });
  } catch (e) { fail(res, e); }
};

exports.mark = async (req, res) => {
  try {
    const b = req.body || {}; const clock = await A.clock(sid(req));
    if (!isId(b.classId)) return res.status(400).json({ message: 'Choose the class.' });
    if (!A.HHMM.test(String(b.startTime || '')) || !A.HHMM.test(String(b.endTime || ''))) return res.status(400).json({ message: 'startTime and endTime look like 09:30.' });
    const key = A.isDay(b.date) ? b.date : clock.dateKey; if (key > clock.dateKey) return res.status(400).json({ message: 'You cannot take attendance for a future date.' });
    const records = Array.isArray(b.records) ? b.records : []; if (!records.length) return res.status(400).json({ message: 'No students to save.' });
    if (!(await Class.exists({ _id: b.classId, schoolId: sid(req) }))) return res.status(404).json({ message: 'Class not found.' });
    const subjectId = b.subjectId && isId(b.subjectId) ? b.subjectId : null;
    if (!(await scheduled(req, { classId: b.classId, subjectId, startTime: b.startTime, endTime: b.endTime }, key))) return res.status(403).json({ message: 'You are not scheduled to teach this class and subject in this slot.' });

    // A teacher is held to the lesson window by when the register was really taken. An offline register syncs later, so its
    // own capture time counts, as long as it is not in the future and not more than a day old.
    let late = false;
    if (req.user.role !== 'admin') {
      if (key !== clock.dateKey) return res.status(403).json({ message: 'Teachers can only take today\'s lessons. The school office can correct older days.' });
      let at = clock.minutes;
      if (b.capturedAt) {
        const t = new Date(b.capturedAt).getTime();
        if (!Number.isFinite(t) || t > Date.now() + 120000 || t < Date.now() - 86400000) return res.status(400).json({ message: 'capturedAt must be a time in the last 24 hours.' });
        const tz = (await School.findById(sid(req)).select('timezone'))?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC'; const c = nowInTz(tz, new Date(t));
        if (c.dateKey !== key) return res.status(403).json({ message: 'That register was taken on another day.' });
        at = c.minutes; late = Date.now() - t > 120000;
      }
      if (at < timeToMinutes(b.startTime)) return res.status(403).json({ message: 'This lesson has not started yet.' });
      if (at >= timeToMinutes(b.endTime)) return res.status(403).json({ message: 'The lesson window had closed. Ask the school office to correct it.' });
    }

    const ids = [...new Set(records.map((r) => String(r.studentId)))];
    if ((await Student.countDocuments({ _id: { $in: ids }, classId: b.classId, schoolId: sid(req) })) !== ids.length) return res.status(400).json({ message: 'Some students do not belong to this class.' });
    if (records.some((r) => !VALID.includes(r.status))) return res.status(400).json({ message: `Status must be one of ${VALID.join(', ')}.` });
    const leaves = await A.leaveMap(sid(req), ids, key); const day = A.toUTCDay(key); let saved = 0; let excused = 0;
    for (const r of records) {
      let status = r.status; if (status === 'Absent' && leaves.has(String(r.studentId))) { status = 'Leave'; excused++; }
      await Attendance.findOneAndUpdate({ schoolId: sid(req), userId: r.studentId, classId: b.classId, subjectId, date: day },
        { $set: { status, teacherId: req.user.role === 'teacher' ? req.user.userId : null, periodStartTime: b.startTime, periodEndTime: b.endTime, markedBy: req.user.userId, markedByModel: req.user.role === 'admin' ? 'User' : 'Teacher', capturedAt: b.capturedAt ? new Date(b.capturedAt) : new Date(), source: 'register' } }, { upsert: true, new: true });
      saved++;
    }
    await audit(req, { action: 'attendance.period.mark', entityType: 'Attendance', entityId: `${b.classId}:${key}:${b.startTime}`, schoolId: sid(req), detail: { saved, excused, lateSync: late } });
    res.json({ message: 'Attendance saved', count: saved, excusedAsLeave: excused, syncedLate: late });
  } catch (e) { fail(res, e); }
};

// Admin or head master: how each lesson of a class went on a date
exports.report = async (req, res) => {
  try {
    const clock = await A.clock(sid(req)); const key = A.isDay(req.query.date) ? req.query.date : clock.dateKey;
    if (!isId(req.query.classId) || !(await manageClass(req, req.query.classId))) return res.status(404).json({ message: 'Class not found.' });
    const rows = await Attendance.find({ schoolId: sid(req), classId: req.query.classId, date: A.toUTCDay(key) });
    const subj = new Map((await Subject.find({ _id: { $in: rows.map((r) => r.subjectId).filter(Boolean) } }).select('name')).map((x) => [String(x._id), x.name]));
    const by = new Map();
    for (const r of rows) { const k = `${r.subjectId || ''}|${r.periodStartTime || ''}`; if (!by.has(k)) by.set(k, { subjectName: subj.get(String(r.subjectId)) || 'Lesson', startTime: r.periodStartTime || '', endTime: r.periodEndTime || '', Present: 0, Absent: 0, Late: 0, Leave: 0 }); by.get(k)[r.status]++; }
    res.json({ date: key, lessons: [...by.values()].sort((a, b) => String(a.startTime).localeCompare(b.startTime)) });
  } catch (e) { fail(res, e); }
};
