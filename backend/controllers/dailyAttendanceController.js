const mongoose = require('../lib/pgdoc');
const N = require('../utils/notify');
const DailyAttendance = require('../models/DailyAttendance');
const { STATUSES } = DailyAttendance;
const Class = require('../models/Class');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const School = require('../models/School');
const { nowInTz } = require('../utils/time');
const { tallyDaily, buildDailyReport, dayKey } = require('../utils/attendanceReport');

const EDIT_WINDOW_DAYS = 7; // a head master may correct the last 7 days; the admin can edit any day
const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const schoolClock = async (schoolId) => {
  const school = await School.findById(schoolId).select('timezone');
  return nowInTz(school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC');
};

const parseDay = (s) => {
  if (!DATE_RE.test(String(s || ''))) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const classLabel = (c) => `${c.standard}-${c.division}`;
const numericSort = (a, b) => String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, { numeric: true }) || a.name.localeCompare(b.name);

// Is this user allowed to mark/edit this class?  admin: always; teacher: only the class head master
const classAccess = async (req, classId) => {
  if (!isId(classId)) return { error: [400, 'Invalid class id'] };
  const cls = await Class.findOne({ _id: classId, schoolId: req.user.schoolId }).populate('classTeacherId', 'name');
  if (!cls) return { error: [404, 'Class not found'] };
  if (req.user.role === 'admin') return { cls, role: 'admin' };
  if (req.user.role === 'teacher') {
    const isHead = cls.classTeacherId && String(cls.classTeacherId._id || cls.classTeacherId) === String(req.user.userId);
    if (!isHead) return { error: [403, 'Only the head master of this class can take its attendance'] };
    return { cls, role: 'teacher' };
  }
  return { error: [403, 'Not allowed'] };
};

const withinEditWindow = (role, dateUTC, todayUTC) => {
  if (role === 'admin') return true;
  const days = Math.round((todayUTC - dateUTC) / 86400000);
  return days >= 0 && days <= EDIT_WINDOW_DAYS;
};

// The head master's own class (teacher dashboard calls this first)
exports.getMyClass = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ _id: req.user.userId, schoolId: req.user.schoolId }).select('name classTeacherOf isClassTeacher');
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    const cls = await Class.findOne({ schoolId: req.user.schoolId, classTeacherId: teacher._id });
    if (!cls) return res.json({ isHeadMaster: false, class: null });
    res.json({ isHeadMaster: true, class: { _id: cls._id, name: classLabel(cls), standard: cls.standard, division: cls.division } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Class list for one date with each student's saved status (null = not marked yet)
exports.getClassSheet = async (req, res) => {
  try {
    const access = await classAccess(req, req.params.classId);
    if (access.error) return res.status(access.error[0]).json({ message: access.error[1] });
    const { cls, role } = access;

    const clock = await schoolClock(req.user.schoolId);
    const dateUTC = req.query.date ? parseDay(req.query.date) : clock.dateUTC;
    if (!dateUTC) return res.status(400).json({ message: 'Date must be YYYY-MM-DD' });
    if (dateUTC > clock.dateUTC) return res.status(400).json({ message: 'You cannot take attendance for a future date' });

    const students = (await Student.find({ schoolId: req.user.schoolId, classId: cls._id, isActive: { $ne: false } })
      .select('name rollNumber photo')).sort(numericSort);
    const records = await DailyAttendance.find({ schoolId: req.user.schoolId, classId: cls._id, date: dateUTC });
    const byStudent = new Map(records.map((r) => [String(r.studentId), r]));

    const rows = students.map((s) => {
      const r = byStudent.get(String(s._id));
      return { _id: s._id, name: s.name, rollNumber: s.rollNumber || '', status: r ? r.status : null, leftAt: r?.leftAt || null, remarks: r?.remarks || '' };
    });

    res.json({
      class: { _id: cls._id, name: classLabel(cls), standard: cls.standard, division: cls.division },
      headMaster: cls.classTeacherId ? { _id: cls.classTeacherId._id, name: cls.classTeacherId.name } : null,
      date: dayKey(dateUTC),
      today: clock.dateKey,
      marked: records.length > 0,
      canEdit: withinEditWindow(role, dateUTC, clock.dateUTC),
      editWindowDays: role === 'admin' ? null : EDIT_WINDOW_DAYS,
      students: rows,
      summary: { ...tallyDaily(records), unmarked: Math.max(0, students.length - records.length) },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Save the whole class for one date in a single request
exports.saveClassSheet = async (req, res) => {
  try {
    const access = await classAccess(req, req.params.classId);
    if (access.error) return res.status(access.error[0]).json({ message: access.error[1] });
    const { cls, role } = access;

    const clock = await schoolClock(req.user.schoolId);
    const dateUTC = parseDay(req.body.date);
    if (!dateUTC) return res.status(400).json({ message: 'Date must be YYYY-MM-DD' });
    if (dateUTC > clock.dateUTC) return res.status(400).json({ message: 'You cannot take attendance for a future date' });
    if (!withinEditWindow(role, dateUTC, clock.dateUTC)) {
      return res.status(403).json({ message: `Head masters can only change the last ${EDIT_WINDOW_DAYS} days. Ask the school admin to edit older dates.` });
    }

    const incoming = Array.isArray(req.body.records) ? req.body.records : [];
    if (!incoming.length) return res.status(400).json({ message: 'No students to save' });

    const classStudents = await Student.find({ schoolId: req.user.schoolId, classId: cls._id }).select('_id');
    const allowed = new Set(classStudents.map((s) => String(s._id)));

    const ops = [];
    const clean = [];
    for (const r of incoming) {
      if (!allowed.has(String(r.studentId))) return res.status(400).json({ message: 'A student in the list does not belong to this class' });
      if (!STATUSES.includes(r.status)) return res.status(400).json({ message: `Invalid status "${r.status}"` });
      let leftAt = null;
      if (r.status === 'HalfDay' && r.leftAt) {
        if (!TIME_RE.test(String(r.leftAt))) return res.status(400).json({ message: 'Leaving time must look like 11:30' });
        leftAt = r.leftAt;
      }
      const remarks = String(r.remarks || '').slice(0, 200);
      clean.push({ status: r.status });
      ops.push({
        updateOne: {
          filter: { studentId: r.studentId, date: dateUTC },
          update: {
            $set: { schoolId: req.user.schoolId, classId: cls._id, status: r.status, leftAt, remarks, markedBy: req.user.userId, markedByModel: role === 'admin' ? 'User' : 'Teacher' },
          },
          upsert: true,
        },
      });
    }
    await DailyAttendance.bulkWrite(ops);

    // Parents (and the student) hear about absences, late arrivals and half days
    try {
      const flagged = incoming.filter((r) => ['Absent', 'Late', 'HalfDay'].includes(r.status));
      const label = { Absent: 'was marked absent', Late: 'arrived late', HalfDay: 'left early (half day)' };
      for (const r of flagged) {
        const stu = await Student.findById(r.studentId).select('name');
        const who = stu?.name || 'Your child';
        await N.notify({
          schoolId: req.user.schoolId, recipients: await N.studentAndParents(req.user.schoolId, [r.studentId]),
          title: `${who} ${label[r.status]}`, body: `${dayKey(dateUTC)}${r.status === 'HalfDay' && r.leftAt ? ` at ${r.leftAt}` : ''}`,
          link: { parent: '/parent/dashboard#/attendance', student: '/student/dashboard#/attendance' }, type: 'attendance', key: `att:${r.studentId}:${dayKey(dateUTC)}:${r.status}`,
        });
      }
    } catch (e) { console.error('attendance notify', e.message); }

    res.json({ message: 'Attendance saved', date: dayKey(dateUTC), summary: tallyDaily(clean) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Admin: which classes have been marked on a date
exports.getOverview = async (req, res) => {
  try {
    const clock = await schoolClock(req.user.schoolId);
    const dateUTC = req.query.date ? parseDay(req.query.date) : clock.dateUTC;
    if (!dateUTC) return res.status(400).json({ message: 'Date must be YYYY-MM-DD' });

    const schoolOid = new mongoose.Types.ObjectId(String(req.user.schoolId));
    const [classes, counts, sizes] = await Promise.all([
      Class.find({ schoolId: req.user.schoolId }).populate('classTeacherId', 'name'),
      DailyAttendance.aggregate([{ $match: { schoolId: schoolOid, date: dateUTC } }, { $group: { _id: { classId: '$classId', status: '$status' }, n: { $sum: 1 } } }]),
      Student.aggregate([{ $match: { schoolId: schoolOid, isActive: { $ne: false } } }, { $group: { _id: '$classId', n: { $sum: 1 } } }]),
    ]);
    const countMap = new Map();
    for (const c of counts) {
      const k = String(c._id.classId);
      if (!countMap.has(k)) countMap.set(k, {});
      countMap.get(k)[c._id.status] = c.n;
    }
    const sizeMap = new Map(sizes.map((s) => [String(s._id), s.n]));

    const rows = classes
      .map((c) => {
        const k = countMap.get(String(c._id)) || {};
        const marked = Object.values(k).reduce((a, b) => a + b, 0);
        return {
          classId: c._id, name: classLabel(c), standard: c.standard, division: c.division,
          headMaster: c.classTeacherId ? { _id: c.classTeacherId._id, name: c.classTeacherId.name } : null,
          students: sizeMap.get(String(c._id)) || 0,
          marked: marked > 0,
          present: (k.Present || 0) + (k.Late || 0), absent: k.Absent || 0, halfDay: k.HalfDay || 0, leave: k.Leave || 0, late: k.Late || 0,
        };
      })
      .sort((a, b) => String(a.standard).localeCompare(String(b.standard), undefined, { numeric: true }) || String(a.division).localeCompare(String(b.division)));

    res.json({ date: dayKey(dateUTC), today: clock.dateKey, classes: rows, totals: { classes: rows.length, marked: rows.filter((r) => r.marked).length, noHeadMaster: rows.filter((r) => !r.headMaster).length } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Student: own attendance
exports.getMyReport = async (req, res) => {
  try {
    const clock = await schoolClock(req.user.schoolId);
    const end = req.query.endDate ? parseDay(req.query.endDate) : clock.dateUTC;
    const start = req.query.startDate ? parseDay(req.query.startDate) : new Date(end.getTime() - 89 * 86400000);
    if (!start || !end) return res.status(400).json({ message: 'Dates must be YYYY-MM-DD' });
    const records = await DailyAttendance.find({ schoolId: req.user.schoolId, studentId: req.user.userId, date: { $gte: start, $lte: end } });
    const todayRec = records.find((r) => dayKey(r.date) === clock.dateKey);
    res.json({ range: { startDate: dayKey(start), endDate: dayKey(end) }, today: clock.dateKey, todayStatus: todayRec ? todayRec.status : null, ...buildDailyReport(records) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Admin: one student's daily records (profile modal) + edit one record
exports.getStudentRecords = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!isId(studentId)) return res.status(400).json({ message: 'Invalid student id' });
    const q = { schoolId: req.user.schoolId, studentId };
    if (req.query.startDate && req.query.endDate) q.date = { $gte: parseDay(req.query.startDate), $lte: parseDay(req.query.endDate) };
    const records = await DailyAttendance.find(q).sort({ date: -1 });
    res.json({ records: records.map((r) => ({ _id: r._id, date: dayKey(r.date), status: r.status, leftAt: r.leftAt, remarks: r.remarks })), ...buildDailyReport(records) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.adminSetStudentDay = async (req, res) => {
  try {
    const { studentId, date, status, leftAt, remarks } = req.body;
    if (!isId(studentId)) return res.status(400).json({ message: 'Invalid student id' });
    const dateUTC = parseDay(date);
    if (!dateUTC) return res.status(400).json({ message: 'Date must be YYYY-MM-DD' });
    if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId }).select('classId');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const rec = await DailyAttendance.findOneAndUpdate(
      { studentId, date: dateUTC },
      { $set: { schoolId: req.user.schoolId, classId: student.classId, status, leftAt: status === 'HalfDay' && TIME_RE.test(String(leftAt || '')) ? leftAt : null, remarks: String(remarks || '').slice(0, 200), markedBy: req.user.userId, markedByModel: 'User' } },
      { upsert: true, new: true }
    );
    res.json({ message: 'Attendance saved', record: rec });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
