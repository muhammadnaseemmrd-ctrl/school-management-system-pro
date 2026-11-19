// Teacher Today (PRD E11): one class-first queue for the day (lessons, registers, notes, marking, cover) and an offline pack
// so the day can be run with no network.
const mongoose = require('../lib/pgdoc');
const Teacher = require('../models/Teacher'); const Class = require('../models/Class'); const Student = require('../models/Student'); const Subject = require('../models/Subject'); const Homework = require('../models/Homework');
const Exam = require('../models/Exam'); const Marks = require('../models/Marks'); const DailyAttendance = require('../models/DailyAttendance'); const Attendance = require('../models/Attendance'); const Cover = require('../models/CoverAssignment');
const Swap = require('../models/TimetableSwap'); const Draft = require('../models/TeacherDraft'); const Conflict = require('../models/SyncConflict'); const Notification = require('../models/Notification');
const A = require('../utils/attendanceOps'); const invoke = require('../utils/invoke'); const period = require('./attendancePeriodController');

const sid = (req) => req.user.schoolId; const me = (req) => req.user.userId;
const fail = (res, e) => { console.error('teacher-today:', e); res.status(500).json({ message: e.message }); };
const label = (c) => `${c.standard}-${c.division}`;
const draftView = (d) => ({ localId: d.localId, kind: d.kind, title: d.title, body: d.body, classId: d.classId, subjectId: d.subjectId, date: d.date, dueDate: d.dueDate, revision: d.revision, status: d.status, updatedAt: d.updatedAt });

async function build(req) {
  const schoolId = sid(req); const teacherId = me(req); const clock = await A.clock(schoolId); const key = clock.dateKey; const day = A.toUTCDay(key);
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId }).select('name subjectClassAssignments'); if (!teacher) return null;
  const lr = await invoke(period.today, req, {}); const lessons = lr.body?.lessons || [];
  const headOf = await Class.find({ schoolId, classTeacherId: teacherId }).select('standard division');
  const assigns = (teacher.subjectClassAssignments || []).filter((a) => a.classId && a.subjectId);
  const classIds = [...new Set([...assigns.map((a) => String(a.classId)), ...headOf.map((c) => String(c._id)), ...lessons.map((l) => String(l.classId))])];
  const [classes, subjects] = await Promise.all([Class.find({ schoolId, _id: { $in: classIds } }).select('standard division'), Subject.find({ schoolId }).select('name')]);
  const cName = new Map(classes.map((c) => [String(c._id), label(c)])); const sName = new Map(subjects.map((s) => [String(s._id), s.name]));

  // class roll call for the classes this teacher heads
  const rolls = [];
  for (const c of headOf) { const [total, taken] = await Promise.all([Student.countDocuments({ schoolId, classId: c._id, isActive: { $ne: false } }), DailyAttendance.countDocuments({ schoolId, classId: c._id, date: day })]); rolls.push({ classId: c._id, className: label(c), total, taken, state: !total ? 'empty' : taken >= total ? 'done' : taken ? 'partial' : 'todo' }); }

  // drafts and notes
  const drafts = (await Draft.find({ schoolId, teacherId, status: 'Draft' }).sort({ updatedAt: -1 }).limit(100)).map(draftView);
  // homework to mark and homework due
  const hws = await Homework.find({ schoolId, teacherId, createdAt: { $gte: new Date(Date.now() - 90 * 86400000) } }).sort({ dueDate: -1 }).limit(120);
  const marking = []; const soon = [];
  for (const h of hws) {
    const ungraded = (h.submissions || []).filter((s) => ['Submitted', 'Late'].includes(s.status) && (s.marks === undefined || s.marks === null)).length;
    const due = h.dueDate ? new Date(h.dueDate).toISOString().slice(0, 10) : '';
    if (ungraded) marking.push({ homeworkId: h._id, title: h.title, className: cName.get(String(h.classId)) || '', subjectName: sName.get(String(h.subjectId)) || '', ungraded, dueDate: due });
    if (due && due >= key && due <= A.addDays(key, 2)) soon.push({ homeworkId: h._id, title: h.title, classId: h.classId, subjectId: h.subjectId, className: cName.get(String(h.classId)) || '', dueDate: due, fileUrl: h.fileUrl || '' });
  }
  // exams where marks are still missing for a subject this teacher teaches
  const marksDue = [];
  if (assigns.length) {
    const exams = await Exam.find({ schoolId, classId: { $in: assigns.map((a) => a.classId) }, date: { $lt: new Date(day.getTime() + 86400000), $gte: new Date(day.getTime() - 45 * 86400000) } }).sort({ date: -1 }).limit(60);
    for (const ex of exams) for (const a of assigns.filter((x) => String(x.classId) === String(ex.classId) && (!ex.subjectId || String(ex.subjectId) === String(x.subjectId)))) {
      const [total, entered] = await Promise.all([Student.countDocuments({ schoolId, classId: ex.classId, isActive: { $ne: false } }), Marks.countDocuments({ schoolId, examId: ex._id, subjectId: a.subjectId })]);
      if (total && entered < total) marksDue.push({ examId: ex._id, name: ex.name, classId: ex.classId, className: cName.get(String(ex.classId)) || '', subjectId: a.subjectId, subjectName: sName.get(String(a.subjectId)) || '', date: new Date(ex.date).toISOString().slice(0, 10), totalMarks: ex.totalMarks, entered, total });
    }
  }
  // cover and swaps waiting on this teacher
  const coverAsked = (await Cover.find({ schoolId, coverTeacherId: teacherId, status: 'Assigned', response: '', date: { $gte: key, $lte: A.addDays(key, 3) } })).map((c) => ({ _id: c._id, date: c.date, startTime: c.startTime, endTime: c.endTime, className: cName.get(String(c.classId)) || '' }));
  const swapsWaiting = await Swap.countDocuments({ schoolId, peerId: teacherId, status: 'Requested' });
  const [openConflicts, unread] = await Promise.all([Conflict.countDocuments({ schoolId, status: 'Open', $or: [{ ownerId: teacherId }, { assignedToId: teacherId }] }), Notification.countDocuments({ schoolId, userId: teacherId, readAt: null }).catch(() => 0)]);

  const out = lessons.map((l) => {
    const same = (x) => String(x.classId) === String(l.classId);
    return { ...l, notes: drafts.filter((d) => d.kind === 'lessonNote' && same(d) && d.date === key).map((d) => ({ localId: d.localId, title: d.title })), homeworkDue: soon.filter((h) => same(h) && (!l.subjectId || String(h.subjectId) === String(l.subjectId))), needsRegister: l.windowStatus === 'open' && l.marked < l.total };
  });
  const next = out.find((l) => l.windowStatus === 'open') || out.find((l) => l.windowStatus === 'upcoming') || null;
  return { date: key, time: `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`, teacher: { _id: teacher._id, name: teacher.name }, lessons: out, next, rolls, marking: marking.slice(0, 12), marksDue: marksDue.slice(0, 12), homeworkSoon: soon, coverAsked, swapsWaiting, drafts: drafts.slice(0, 20), draftCount: drafts.length, assignments: assigns.map((a) => ({ classId: a.classId, subjectId: a.subjectId, className: cName.get(String(a.classId)) || '', subjectName: sName.get(String(a.subjectId)) || '' })), openConflicts, unread,
    counts: { lessons: out.length, registersToTake: out.filter((l) => l.needsRegister).length, rollsToTake: rolls.filter((r) => r.state === 'todo' || r.state === 'partial').length, toMark: marking.reduce((n, m) => n + m.ungraded, 0), marksDue: marksDue.length, drafts: drafts.length, conflicts: openConflicts } };
}
exports.today = async (req, res) => { try { const d = await build(req); if (!d) return res.status(404).json({ message: 'Teacher profile not found.' }); res.json(d); } catch (e) { fail(res, e); } };

// Everything a teacher needs to run the day with no network: rosters, what is already marked, drafts, exams awaiting marks.
exports.pack = async (req, res) => {
  try {
    const schoolId = sid(req); const d = await build(req); if (!d) return res.status(404).json({ message: 'Teacher profile not found.' }); const day = A.toUTCDay(d.date);
    const classIds = [...new Set([...d.lessons.map((l) => String(l.classId)), ...d.rolls.map((r) => String(r.classId)), ...d.marksDue.map((m) => String(m.classId))])]; const classes = [];
    for (const id of classIds) {
      const cls = await Class.findOne({ _id: id, schoolId }).select('standard division'); if (!cls) continue;
      const students = (await Student.find({ schoolId, classId: id, isActive: { $ne: false } }).select('name rollNumber')).sort((a, b) => String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, { numeric: true }) || a.name.localeCompare(b.name));
      const ids = students.map((s) => String(s._id)); const leaves = await A.leaveMap(schoolId, ids, d.date); const dailyMap = {};
      for (const r of await DailyAttendance.find({ schoolId, classId: id, date: day })) dailyMap[String(r.studentId)] = r.status;
      const periods = {}; for (const l of d.lessons.filter((x) => String(x.classId) === id)) { const m = {}; for (const a of await Attendance.find({ schoolId, classId: id, subjectId: l.subjectId || null, date: day })) m[String(a.userId)] = a.status; periods[`${l.startTime}-${l.endTime}`] = m; }
      classes.push({ classId: id, className: label(cls), students: students.map((s) => ({ _id: s._id, name: s.name, rollNumber: s.rollNumber || '', onLeave: leaves.has(String(s._id)) })), daily: dailyMap, periods });
    }
    const exams = [];
    for (const m of d.marksDue.slice(0, 8)) { const cur = {}; for (const r of await Marks.find({ schoolId, examId: m.examId, subjectId: m.subjectId })) cur[String(r.studentId)] = { marks: r.marks, remarks: r.remarks || '' }; exams.push({ ...m, current: cur }); }
    const generatedAt = new Date(); res.json({ generatedAt, validUntil: new Date(generatedAt.getTime() + 36 * 3600000), date: d.date, teacher: d.teacher, lessons: d.lessons, rolls: d.rolls, classes, exams, drafts: d.drafts, assignments: d.assignments, today: d });
  } catch (e) { fail(res, e); }
};
