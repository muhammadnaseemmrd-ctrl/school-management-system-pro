// Anomaly scan (PRD E08, CAP-0376/0379). It only raises findings for a person to look at; it never edits a mark.
const mongoose = require('../lib/pgdoc');
const A = require('./attendanceOps');
const Class = require('../models/Class');
const Student = require('../models/Student');
const School = require('../models/School');
const DailyAttendance = require('../models/DailyAttendance');
const Attendance = require('../models/Attendance');
const AttendanceEvidence = require('../models/AttendanceEvidence');
const AttendanceDevice = require('../models/AttendanceDevice');
const AttendanceAnomaly = require('../models/AttendanceAnomaly');
const { nowInTz, timeToMinutes } = require('./time');

async function scan(schoolId, date) {
  const sid = A.oid(schoolId); const st = await A.getSettings(schoolId);
  const school = await School.findById(sid).select('timezone'); const tz = school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC';
  const now = nowInTz(tz);
  const found = [];
  const raise = (kind, key, extra) => found.push({ kind, key: `${kind}:${date}:${key}`, ...extra });
  const dayUTC = A.toUTCDay(date);

  if (A.isSchoolDay(date)) {
    const classes = await Class.find({ schoolId: sid }).select('standard division');
    const students = await Student.find({ schoolId: sid, isActive: { $ne: false } }).select('classId name');
    const byClass = new Map(); students.forEach((s) => { const k = String(s.classId); if (!byClass.has(k)) byClass.set(k, []); byClass.get(k).push(s); });
    const rows = await DailyAttendance.find({ schoolId: sid, date: dayUTC });
    const marks = new Map(); rows.forEach((r) => { const k = String(r.classId); if (!marks.has(k)) marks.set(k, []); marks.get(k).push(r); });

    const cutoffPassed = date < now.dateKey || (date === now.dateKey && now.minutes >= timeToMinutes(st.rollCallCutoff));
    for (const c of classes) {
      const roster = byClass.get(String(c._id)) || []; if (!roster.length) continue;
      const m = marks.get(String(c._id)) || [];
      if (!m.length && cutoffPassed) raise('MissingRollCall', String(c._id), { classId: c._id, detail: `No register for ${c.standard}-${c.division} on ${date} (cutoff ${st.rollCallCutoff}).` });
      if (m.length >= 15 && m.length === roster.length && m.every((r) => r.status === 'Present')) raise('EveryonePresent', String(c._id), { classId: c._id, detail: `All ${m.length} students of ${c.standard}-${c.division} are marked present. Worth a glance that the register was really taken.` });
    }

    // marked present on a day of approved leave
    const leaves = await A.leaveMap(schoolId, rows.map((r) => r.studentId), date);
    for (const r of rows) {
      if (['Present', 'Late', 'HalfDay'].includes(r.status) && leaves.has(String(r.studentId))) {
        const stu = students.find((s) => String(s._id) === String(r.studentId));
        raise('PresentOnLeave', String(r.studentId), { classId: r.classId, studentId: r.studentId, detail: `${stu?.name || 'A student'} is marked ${r.status.toLowerCase()} but has approved ${leaves.get(String(r.studentId)).kind.toLowerCase()} leave today.` });
      }
    }

    // gate evidence against the register: a gate scan is evidence of entry only, so these are questions, not corrections
    const ev = (await AttendanceEvidence.find({ schoolId: sid, kind: { $in: ['gate', 'badge', 'biometric'] }, occurredAt: { $gte: new Date(dayUTC.getTime() - 86400000), $lte: new Date(dayUTC.getTime() + 2 * 86400000) } }))
      .filter((e) => e.studentId && e.direction === 'in' && nowInTz(tz, e.occurredAt).dateKey === date);
    const entered = new Set(ev.map((e) => String(e.studentId)));
    for (const r of rows) {
      const stu = students.find((s) => String(s._id) === String(r.studentId));
      if (r.status === 'Absent' && entered.has(String(r.studentId))) raise('AbsentButAtGate', String(r.studentId), { classId: r.classId, studentId: r.studentId, detail: `${stu?.name || 'A student'} is marked absent but the gate reader saw them come in.` });
    }
    // only where the reader clearly covers the class (at least half the roster came through it), so a partly installed reader stays quiet
    const gateClasses = new Set([...byClass].filter(([k, roster]) => roster.filter((s) => entered.has(String(s._id))).length * 2 >= roster.length).map(([k]) => k));
    for (const r of rows) {
      if (r.status === 'Present' && gateClasses.has(String(r.classId)) && !entered.has(String(r.studentId))) {
        const stu = students.find((s) => String(s._id) === String(r.studentId));
        raise('PresentNoGateEntry', String(r.studentId), { classId: r.classId, studentId: r.studentId, detail: `${stu?.name || 'A student'} is marked present but has no gate entry while classmates do.` });
      }
    }

    // the same student present in two lessons that overlap in time
    const periods = await Attendance.find({ schoolId: sid, date: dayUTC, status: 'Present' });
    const per = new Map(); periods.forEach((p) => { const k = String(p.userId); if (!per.has(k)) per.set(k, []); per.get(k).push(p); });
    for (const [stid, list] of per) {
      const t = list.filter((p) => p.periodStartTime && p.periodEndTime).map((p) => [timeToMinutes(p.periodStartTime), timeToMinutes(p.periodEndTime), p.subjectId]);
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i][0] < t[j][1] && t[j][0] < t[i][1]) { raise('PeriodClash', stid, { studentId: stid, detail: 'Present in two lessons that overlap in time.' }); i = t.length; break; }
    }
  }

  // device health: silent or drifting readers
  const devices = await AttendanceDevice.find({ schoolId: sid, status: 'Active' });
  if (date === now.dateKey) {
    for (const d of devices) {
      if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > st.deviceStaleMinutes * 60000) raise('DeviceSilent', String(d._id), { deviceId: d._id, detail: `${d.name} has not reported for over ${st.deviceStaleMinutes} minutes.` });
      if (Math.abs(d.driftSeconds || 0) > st.driftToleranceSeconds) raise('DeviceDrift', String(d._id), { deviceId: d._id, detail: `${d.name}'s clock is ${Math.round(d.driftSeconds)} seconds off the server.` });
    }
  }

  let raised = 0;
  for (const f of found) {
    try { await AttendanceAnomaly.create({ schoolId: sid, date, classId: null, studentId: null, deviceId: null, ...f }); raised++; } catch (e) { if (e.code !== 11000) throw e; }
  }
  return { date, raised, alreadyKnown: found.length - raised };
}

module.exports = { scan };
