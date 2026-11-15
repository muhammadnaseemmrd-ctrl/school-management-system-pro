const Attendance = require('../models/Attendance');
const DailyAttendance = require('../models/DailyAttendance');
const { buildDailyReport } = require('../utils/attendanceReport');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Marks = require('../models/Marks');
const StudentFee = require('../models/StudentFee');
const FeeStructure = require('../models/FeeStructure');
const School = require('../models/School');
const { nowInTz } = require('../utils/time');

const schoolNow = async (schoolId) => {
  const school = await School.findById(schoolId).select('timezone');
  return nowInTz(school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC');
};
const VALID_STATUS = ['Present', 'Absent', 'Late', 'Leave'];

/* ─── Helpers ─────────────────────────────────────────────── */
const toHHMM = (d) => {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};
const timeToMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ─── TEACHER: Get today's active/upcoming/locked periods ─── */
exports.getTeacherActivePeriods = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.userId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    const sn = await schoolNow(req.user.schoolId);
    const todayName = sn.dayName;
    const nowMin = sn.minutes;

    // Find all timetables where this teacher has a slot today
    const timetables = await Timetable.find({
      schoolId: req.user.schoolId,
      dayOfWeek: todayName,
      isActive: true,
      'slots.teacherId': teacher._id,
    }).populate('classId', 'standard division');

    const periods = [];

    for (const tt of timetables) {
      for (const slot of tt.slots) {
        if (slot.isBreak) continue;
        const slotTeacherId = slot.teacherId?.toString?.() || slot.teacherId;
        if (slotTeacherId !== teacher._id.toString()) continue;

        const startMin = timeToMinutes(slot.startTime);
        const endMin = timeToMinutes(slot.endTime);

        let windowStatus = 'upcoming';
        if (nowMin >= startMin && nowMin < endMin) windowStatus = 'open';
        else if (nowMin >= endMin) windowStatus = 'locked';

        // Fetch subject info
        let subjectName = 'Unknown Subject';
        if (slot.subjectId) {
          const sub = await Subject.findById(slot.subjectId).select('name');
          if (sub) subjectName = sub.name;
        }

        // Count already marked students for this period
        const todayStart = sn.dateUTC;
        const todayEnd = new Date(sn.dateUTC.getTime() + 24 * 3600 * 1000 - 1);

        const markedCount = await Attendance.countDocuments({
          schoolId: req.user.schoolId,
          classId: tt.classId._id,
          subjectId: slot.subjectId,
          date: { $gte: todayStart, $lte: todayEnd },
        });

        const totalStudents = await Student.countDocuments({
          schoolId: req.user.schoolId,
          classId: tt.classId._id,
        });

        periods.push({
          timetableId: tt._id,
          classId: tt.classId._id,
          classLabel: `${tt.classId.standard} (${tt.classId.division})`,
          standard: tt.classId.standard,
          division: tt.classId.division,
          subjectId: slot.subjectId,
          subjectName,
          startTime: slot.startTime,
          endTime: slot.endTime,
          windowStatus,
          markedCount,
          totalStudents,
        });
      }
    }

    // Sort by startTime
    periods.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    res.json({ periods, today: todayName });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── TEACHER: Get students for a period (to mark attendance) */
exports.getPeriodStudents = async (req, res) => {
  try {
    const { classId, subjectId, date } = req.query;
    if (!classId) return res.status(400).json({ message: 'classId required' });

    const students = await Student.find({
      schoolId: req.user.schoolId,
      classId,
    }).select('_id name rollNumber email').sort({ rollNumber: 1 });

    // Fetch existing attendance for this date/subject if any
    const queryDate = date ? new Date(date) : new Date();
    const dayStart = new Date(queryDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(queryDate);
    dayEnd.setHours(23, 59, 59, 999);

    const existingRecords = await Attendance.find({
      schoolId: req.user.schoolId,
      classId,
      subjectId: subjectId || null,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    const existingMap = {};
    existingRecords.forEach(r => {
      existingMap[r.userId.toString()] = r.status;
    });

    res.json({
      students,
      existingMap,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── TEACHER: Mark period attendance (time-window enforced) ─ */
exports.markPeriodAttendance = async (req, res) => {
  try {
    const { classId, subjectId, date, startTime, endTime, attendanceData } = req.body;
    // attendanceData: [{ studentId, status }]

    if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
      return res.status(400).json({ message: 'attendanceData array required' });
    }

    // Server-side checks (school-local clock)
    const sn = await schoolNow(req.user.schoolId);
    const nowMin = sn.minutes;
    if (!endTime || !startTime) return res.status(400).json({ message: 'startTime and endTime are required' });
    if (nowMin >= timeToMinutes(endTime)) {
      return res.status(403).json({
        message: 'Attendance window has closed. Cannot mark or modify after period ends.',
      });
    }
    if (nowMin < timeToMinutes(startTime)) {
      return res.status(403).json({ message: 'This lecture has not started yet.' });
    }

    // The teacher must really be scheduled for this class + subject + slot today
    const scheduled = await Timetable.findOne({
      schoolId: req.user.schoolId, classId, dayOfWeek: sn.dayName, isActive: true,
      slots: { $elemMatch: { teacherId: req.user.userId, subjectId: subjectId || null, startTime, endTime } },
    }).select('_id');
    if (!scheduled) {
      return res.status(403).json({ message: 'You are not scheduled to teach this class and subject in this slot.' });
    }

    // Only students of that class, only valid statuses
    const ids = [...new Set(attendanceData.map((e) => String(e.studentId)))];
    const inClass = await Student.countDocuments({ _id: { $in: ids }, classId, schoolId: req.user.schoolId });
    if (inClass !== ids.length) return res.status(400).json({ message: 'Some students do not belong to this class' });
    if (attendanceData.some((e) => !VALID_STATUS.includes(e.status))) {
      return res.status(400).json({ message: 'Invalid attendance status' });
    }

    // Teachers can only mark TODAY (school date); past dates are admin-only
    const markDate = sn.dateUTC;

    const results = [];
    for (const entry of attendanceData) {
      const { studentId, status } = entry;
      const filter = {
        schoolId: req.user.schoolId,
        userId: studentId,
        classId,
        subjectId: subjectId || null,
        date: markDate,
      };
      const update = {
        status,
        teacherId: req.user.userId,
        periodStartTime: startTime,
        periodEndTime: endTime,
        markedBy: req.user.userId,
        markedByModel: 'Teacher',
      };
      const record = await Attendance.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });
      results.push(record);
    }

    res.json({ message: 'Attendance saved', count: results.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── STUDENT: Get my attendance (subject-wise per day) ────── */
exports.getMyAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const student = await Student.findOne({
      _id: req.user.userId,
      schoolId: req.user.schoolId,
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      };
    }

    const records = await Attendance.find({
      schoolId: req.user.schoolId,
      userId: student._id,
      ...dateFilter,
    })
      .populate('subjectId', 'name code')
      .sort({ date: -1 });

    // Group by date
    const grouped = {};
    for (const r of records) {
      const dateKey = new Date(r.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        _id: r._id,
        subjectName: r.subjectId?.name || 'General',
        subjectCode: r.subjectId?.code || '',
        status: r.status,
        periodStartTime: r.periodStartTime,
        periodEndTime: r.periodEndTime,
      });
    }

    // Stats
    const total = records.length;
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

    res.json({ grouped, stats: { total, present, absent, percentage } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── ADMIN: Get full student profile (att + fees + marks) ─── */
exports.getAdminStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId })
      .populate('classId', 'standard division');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Attendance (once-a-day records)
    const attQuery = { schoolId: req.user.schoolId, studentId };
    if (startDate && endDate) attQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    const attRecords = await DailyAttendance.find(attQuery).sort({ date: -1 });
    const report = buildDailyReport(attRecords);
    const attendance = attRecords.map((r) => ({ _id: r._id, date: new Date(r.date).toISOString().split('T')[0], status: r.status, leftAt: r.leftAt, remarks: r.remarks }));

    // Fees
    const feeStructure = await FeeStructure.findOne({
      schoolId: req.user.schoolId,
      standard: student.classId?.standard,
    });
    const studentFee = await StudentFee.findOne({
      studentId,
      schoolId: req.user.schoolId,
    });

    // Marks
    const marks = await Marks.find({ studentId, schoolId: req.user.schoolId })
      .populate('examId', 'name date')
      .populate('subjectId', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      student,
      attendance: { records: attendance, stats: report.stats, monthly: report.monthly },
      fees: { structure: feeStructure, record: studentFee },
      marks,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── ADMIN: Override attendance record ─────────────────────── */
exports.adminUpdateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status, remarks } = req.body;

    const record = await Attendance.findOneAndUpdate(
      { _id: attendanceId, schoolId: req.user.schoolId },
      {
        status,
        remarks,
        markedBy: req.user.userId,
        markedByModel: 'User',
      },
      { new: true }
    ).populate('subjectId', 'name');

    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Attendance updated', record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── ADMIN: Create attendance override for a date/subject ─── */
exports.adminCreateAttendance = async (req, res) => {
  try {
    const { studentId, classId, subjectId, date, status, remarks } = req.body;

    const markDate = new Date(date);
    markDate.setHours(0, 0, 0, 0);

    const filter = {
      schoolId: req.user.schoolId,
      userId: studentId,
      date: markDate,
      subjectId: subjectId || null,
    };

    const record = await Attendance.findOneAndUpdate(
      filter,
      {
        ...filter,
        classId,
        status,
        remarks,
        markedBy: req.user.userId,
        markedByModel: 'User',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('subjectId', 'name');

    res.json({ message: 'Attendance saved', record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── Legacy: Mark Attendance (kept for compatibility) ──────── */
exports.markAttendance = async (req, res) => {
  try {
    const { userId, date, status, remarks } = req.body;
    const markDate = new Date(date);
    markDate.setHours(0, 0, 0, 0);

    const record = await Attendance.findOneAndUpdate(
      { schoolId: req.user.schoolId, userId, date: markDate, subjectId: null },
      { status, remarks, markedBy: req.user.userId, markedByModel: req.user.role === 'teacher' ? 'Teacher' : 'User' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ message: 'Attendance saved', attendance: record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── Legacy: Mark Class Attendance ────────────────────────── */
exports.markClassAttendance = async (req, res) => {
  try {
    const { classId, date, attendanceData } = req.body;
    if (!Array.isArray(attendanceData)) {
      return res.status(400).json({ message: 'Attendance data must be an array' });
    }
    const markDate = new Date(date);
    markDate.setHours(0, 0, 0, 0);

    const results = [];
    for (const entry of attendanceData) {
      const { userId, status, remarks } = entry;
      const record = await Attendance.findOneAndUpdate(
        { schoolId: req.user.schoolId, userId, classId, date: markDate, subjectId: null },
        { status, remarks, markedBy: req.user.userId, markedByModel: req.user.role === 'teacher' ? 'Teacher' : 'User' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results.push(record);
    }
    res.json({ message: 'Class attendance marked successfully', marked: results.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── Legacy: Get User Attendance ─────────────────────────── */
exports.getUserAttendance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year, page = 1, limit = 100 } = req.query;
    if (!(await require('../utils/access').canAccessStudent(req.user, userId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let query = { userId, schoolId: req.user.schoolId };
    if (month && year) {
      query.date = {
        $gte: new Date(year, month - 1, 1),
        $lte: new Date(year, month, 0),
      };
    }

    const attendance = await Attendance.find(query)
      .populate('subjectId', 'name code')
      .populate('markedBy', 'name')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const total = attendance.length;
    const presentCount = attendance.filter(a => a.status === 'Present').length;
    const absentCount = attendance.filter(a => a.status === 'Absent').length;
    const percentage = total > 0 ? ((presentCount / total) * 100).toFixed(2) : 0;

    res.json({
      attendance,
      stats: { total, present: presentCount, absent: absentCount, percentage },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── Legacy: Get Class Attendance Report ──────────────────── */
exports.getClassAttendanceReport = async (req, res) => {
  try {
    const { classId, month, year } = req.query;
    const students = await Student.find({ classId, schoolId: req.user.schoolId });
    const report = [];
    for (const student of students) {
      let query = { userId: student._id };
      if (month && year) {
        query.date = {
          $gte: new Date(year, month - 1, 1),
          $lte: new Date(year, month, 0),
        };
      }
      const att = await Attendance.find(query);
      const presentCount = att.filter(a => a.status === 'Present').length;
      const percentage = att.length > 0 ? ((presentCount / att.length) * 100).toFixed(2) : 0;
      report.push({
        studentId: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        totalDays: att.length,
        presentDays: presentCount,
        percentage,
      });
    }
    res.json({ report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
