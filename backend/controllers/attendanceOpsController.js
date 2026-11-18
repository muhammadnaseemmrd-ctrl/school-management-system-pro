// Attendance operations (PRD E08): verified alerts with receipts, leave and mobility, corrections with history,
// repeated-absence cases, anomaly review, consent and policy.
const mongoose = require('../lib/pgdoc');
const A = require('../utils/attendanceOps');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const guardian = require('../utils/guardianRights');
const AppSetting = require('../models/AppSetting');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const DailyAttendance = require('../models/DailyAttendance');
const AttendanceAlert = require('../models/AttendanceAlert');
const AlertReceipt = require('../models/AlertReceipt');
const StudentLeave = require('../models/StudentLeave');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const AttendanceHistory = require('../models/AttendanceHistory');
const AttendanceCase = require('../models/AttendanceCase');
const AttendanceAnomaly = require('../models/AttendanceAnomaly');
const AttendanceConsent = require('../models/AttendanceConsent');
const AttendanceDevice = require('../models/AttendanceDevice');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const sid = (req) => req.user.schoolId;
const STATUSES = DailyAttendance.STATUSES || ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];
const roleModel = (role) => (role === 'admin' ? 'User' : 'Teacher');

/* ───────── who may act for which class or child ───────── */
// admin: any class; teacher: the head master of the class or someone holding a time-limited grant for it
async function manageClass(req, classId) {
  if (req.user.role === 'admin') return !!(await Class.exists({ _id: classId, schoolId: sid(req) }));
  if (req.user.role !== 'teacher') return false;
  const cls = await Class.findOne({ _id: classId, schoolId: sid(req) }).select('classTeacherId');
  if (!cls) return false;
  if (cls.classTeacherId && String(cls.classTeacherId) === String(req.user.userId)) return true;
  const g = await require('../utils/permissions').can(req.user, 'academics.attendance.mark', { classId: cls._id });
  return !!g.allowed;
}
// the classes a teacher heads (admin: null = all)
async function myClassIds(req) {
  if (req.user.role === 'admin') return null;
  if (req.user.role !== 'teacher') return [];
  return (await Class.find({ schoolId: sid(req), classTeacherId: req.user.userId }).select('_id')).map((c) => c._id);
}
// the student, if this user may act for them: admin, class head, the student themself, or a linked guardian with the right
async function studentAccess(req, studentId, right = 'viewAttendance') {
  if (!isId(studentId)) return null;
  const stu = await Student.findOne({ _id: studentId, schoolId: sid(req) }).select('name classId');
  if (!stu) return null;
  const r = req.user.role;
  if (r === 'admin') return stu;
  if (r === 'student') return String(req.user.userId) === String(stu._id) ? stu : null;
  if (r === 'teacher') return stu.classId && (await manageClass(req, stu.classId)) ? stu : null;
  if (r === 'parent') {
    const g = await guardian.resolve(sid(req), req.user.userId, stu._id);
    return g.linked && g.rights[right] ? stu : null;
  }
  return null;
}

/* ───────── policy ───────── */
exports.getSettings = async (req, res) => { try { res.json({ settings: await A.getSettings(sid(req)) }); } catch (e) { fail(res, e); } };
exports.putSettings = async (req, res) => {
  try {
    const b = req.body || {}; const cur = await A.getSettings(sid(req)); const next = { ...cur };
    for (const k of ['requireVerification', 'selfCheckInEnabled', 'biometricPilot']) if (b[k] !== undefined) next[k] = b[k] === true;
    const ranges = { graceMinutes: [0, 1440], caseThreshold: [1, 60], caseWindowDays: [1, 180], qrWindowSeconds: [10, 120], deviceStaleMinutes: [1, 1440], driftToleranceSeconds: [5, 3600], duplicateWindowSeconds: [1, 300] };
    for (const [k, [lo, hi]] of Object.entries(ranges)) {
      if (b[k] === undefined) continue;
      const n = Number(b[k]); if (!Number.isInteger(n) || n < lo || n > hi) return res.status(400).json({ message: `${k} must be a whole number from ${lo} to ${hi}.` });
      next[k] = n;
    }
    if (b.rollCallCutoff !== undefined) { if (!A.HHMM.test(String(b.rollCallCutoff))) return res.status(400).json({ message: 'The roll call cutoff must look like 10:00.' }); next.rollCallCutoff = b.rollCallCutoff; }
    // a biometric pilot may only run beside a way to be counted without a camera or fingerprint (CAP-0382)
    if (next.biometricPilot) {
      const badge = await AttendanceDevice.countDocuments({ schoolId: sid(req), status: 'Active' });
      if (!next.selfCheckInEnabled && !badge) return res.status(422).json({ message: 'A biometric pilot needs a no-camera alternative first: turn on classroom QR check-in or register an ID badge reader. Teacher roll call always stays available.' });
    }
    await AppSetting.updateOne({ key: `attendance:${sid(req)}` }, { $set: { value: next } }, { upsert: true });
    await audit(req, { action: 'attendance.settings', entityType: 'AppSetting', entityId: 'attendance', schoolId: sid(req), detail: next });
    res.json({ settings: next });
  } catch (e) { fail(res, e); }
};

exports.overview = async (req, res) => {
  try {
    const s = sid(req); await A.dispatchDue(s);
    const [pendingAlerts, openCases, openAnomalies, leaveRequests, corrections, devices] = await Promise.all([
      AttendanceAlert.countDocuments({ schoolId: s, status: 'Pending' }), AttendanceCase.countDocuments({ schoolId: s, status: { $in: ['Open', 'InProgress'] } }),
      AttendanceAnomaly.countDocuments({ schoolId: s, status: 'Open' }), StudentLeave.countDocuments({ schoolId: s, status: 'Requested' }),
      AttendanceCorrection.countDocuments({ schoolId: s, status: 'Requested' }), AttendanceDevice.find({ schoolId: s, status: 'Active' }),
    ]);
    const st = await A.getSettings(s); const cutoff = Date.now() - st.deviceStaleMinutes * 60000;
    res.json({ pendingAlerts, openCases, openAnomalies, leaveRequests, corrections, devices: devices.length, staleDevices: devices.filter((d) => !d.lastSeenAt || d.lastSeenAt.getTime() < cutoff).length });
  } catch (e) { fail(res, e); }
};

/* ───────── alerts ───────── */
async function alertRows(list) {
  const stu = new Map((await Student.find({ _id: { $in: list.map((a) => a.studentId) } }).select('name rollNumber')).map((x) => [String(x._id), x]));
  return list.map((a) => ({ ...a.toObject(), student: stu.get(String(a.studentId)) ? { _id: a.studentId, name: stu.get(String(a.studentId)).name, rollNumber: stu.get(String(a.studentId)).rollNumber || '' } : null }));
}
exports.listAlerts = async (req, res) => {
  try {
    const { p, l } = pg(req.query); const q = { schoolId: sid(req) };
    const mine = await myClassIds(req); if (mine) q.classId = { $in: mine };
    if (['Pending', 'Verified', 'Sent', 'Cancelled'].includes(req.query.status)) q.status = req.query.status;
    if (isId(req.query.classId)) q.classId = mine ? (mine.map(String).includes(String(req.query.classId)) ? req.query.classId : null) : req.query.classId;
    if (A.isDay(req.query.date)) q.date = req.query.date;
    await A.dispatchDue(sid(req));
    const [items, total] = await Promise.all([AttendanceAlert.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), AttendanceAlert.countDocuments(q)]);
    res.json({ alerts: await alertRows(items), pagination: { currentPage: p, totalPages: Math.max(1, Math.ceil(total / l)), pages: Math.max(1, Math.ceil(total / l)), total } });
  } catch (e) { fail(res, e); }
};
async function alertFor(req) {
  if (!isId(req.params.id)) return null;
  const a = await AttendanceAlert.findOne({ _id: req.params.id, schoolId: sid(req) });
  if (!a) return null;
  return a.classId && (await manageClass(req, a.classId)) ? a : (req.user.role === 'admin' ? a : null);
}
exports.getAlert = async (req, res) => {
  try {
    const a = await alertFor(req); if (!a) return res.status(404).json({ message: 'Alert not found.' });
    const [row] = await alertRows([a]);
    res.json({ alert: row, receipts: await A.receiptsFor(a._id) });
  } catch (e) { fail(res, e); }
};
exports.verifyAlert = async (req, res) => {
  try {
    const a = await alertFor(req); if (!a) return res.status(404).json({ message: 'Alert not found.' });
    if (a.status !== 'Pending') return res.status(409).json({ message: `This alert is already ${a.status.toLowerCase()}.` });
    const st = await A.getSettings(sid(req));
    // the mark must still say what the alert says: a teacher confirms the absence is real
    const rec = await DailyAttendance.findOne({ studentId: a.studentId, date: A.toUTCDay(a.date) });
    if (!rec || A.kindFor(rec.status) !== a.kind) { a.status = 'Cancelled'; a.cancelledReason = 'The mark changed before it was verified'; await a.save(); return res.status(422).json({ message: 'The register no longer shows this. The alert was cancelled.' }); }
    a.status = 'Verified'; a.verifiedBy = req.user.userId; a.verifiedByModel = roleModel(req.user.role); a.verifiedAt = new Date(); a.dueAt = new Date(Date.now() + st.graceMinutes * 60000); await a.save();
    await audit(req, { action: 'attendance.alert.verify', entityType: 'AttendanceAlert', entityId: a._id, schoolId: sid(req), detail: { student: a.studentId, date: a.date, kind: a.kind } });
    await A.dispatchDue(sid(req));
    const fresh = await AttendanceAlert.findById(a._id);
    res.json({ alert: fresh, message: fresh.status === 'Sent' ? 'Verified and sent.' : `Verified. It will be sent after the ${st.graceMinutes}-minute wait.` });
  } catch (e) { fail(res, e); }
};
exports.cancelAlert = async (req, res) => {
  try {
    const a = await alertFor(req); if (!a) return res.status(404).json({ message: 'Alert not found.' });
    const reason = str(req.body?.reason, 200); if (reason.length < 3) return res.status(400).json({ message: 'Say why this alert should not go out.' });
    if (!['Pending', 'Verified'].includes(a.status)) return res.status(409).json({ message: `This alert is already ${a.status.toLowerCase()}.` });
    a.status = 'Cancelled'; a.cancelledReason = reason; await a.save();
    await audit(req, { action: 'attendance.alert.cancel', entityType: 'AttendanceAlert', entityId: a._id, schoolId: sid(req), detail: { reason } });
    res.json({ alert: a });
  } catch (e) { fail(res, e); }
};
exports.dispatch = async (req, res) => { try { res.json({ sent: await A.dispatchDue(sid(req)) }); } catch (e) { fail(res, e); } };

// A parent or student: what was I told, and did I answer?
exports.myAlerts = async (req, res) => {
  try {
    const rows = await AlertReceipt.find({ schoolId: sid(req), recipientId: req.user.userId, role: req.user.role }).sort({ createdAt: -1 }).limit(60);
    const alerts = new Map((await AttendanceAlert.find({ _id: { $in: rows.map((r) => r.alertId) } })).map((a) => [String(a._id), a]));
    const stu = new Map((await Student.find({ _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((x) => [String(x._id), x.name]));
    res.json({ alerts: rows.map((r) => { const a = alerts.get(String(r.alertId)); return { _id: a?._id, receiptId: r._id, student: stu.get(String(r.studentId)) || '', kind: a?.kind, date: a?.date, detail: a?.detail, deliveredAt: r.deliveredAt, readAt: r.readAt, acknowledgedAt: r.acknowledgedAt, reply: r.reply }; }).filter((x) => x._id) });
  } catch (e) { fail(res, e); }
};
exports.acknowledge = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Alert not found.' });
    const r = await AlertReceipt.findOne({ alertId: req.params.id, recipientId: req.user.userId, role: req.user.role, schoolId: sid(req) });
    if (!r) return res.status(404).json({ message: 'Alert not found.' });
    if (r.acknowledgedAt) return res.status(409).json({ message: 'You already answered this alert.' });
    const reply = str(req.body?.reply, 300);
    r.acknowledgedAt = new Date(); r.readAt = r.readAt || r.acknowledgedAt; r.reply = reply; await r.save();
    const a = await AttendanceAlert.findById(r.alertId);
    if (reply && a) {
      const stu = await Student.findById(a.studentId).select('name classId'); const cls = stu?.classId ? await Class.findById(stu.classId).select('classTeacherId') : null;
      await N.notify({ schoolId: sid(req), type: 'attendance', title: `Family reply about ${stu?.name || 'a student'} (${a.date})`, body: reply, link: '/admin/dashboard#/attendance-ops', recipients: [...(await N.admins(sid(req))), ...(cls?.classTeacherId ? [{ id: cls.classTeacherId, role: 'teacher' }] : [])], key: `attreply:${r._id}` });
    }
    res.json({ receipt: r });
  } catch (e) { fail(res, e); }
};

/* ───────── leave and mobility ───────── */
const KINDS = require('../models/StudentLeave');
exports.requestLeave = async (req, res) => {
  try {
    const b = req.body || {}; const stu = await studentAccess(req, b.studentId);
    if (!stu) return res.status(404).json({ message: 'Student not found.' });
    if (!KINDS.KINDS.includes(b.kind)) return res.status(400).json({ message: `Choose one of: ${KINDS.KINDS.join(', ')}.` });
    if (b.kind === 'Transfer' && !['admin', 'teacher'].includes(req.user.role)) return res.status(403).json({ message: 'A transfer is recorded by the school office.' });
    if (!A.isDay(b.fromDate) || !A.isDay(b.toDate)) return res.status(400).json({ message: 'Choose the first and last day.' });
    if (b.toDate < b.fromDate) return res.status(400).json({ message: 'The last day cannot be before the first day.' });
    if ((A.toUTCDay(b.toDate) - A.toUTCDay(b.fromDate)) / 86400000 > 120) return res.status(400).json({ message: 'A single request can cover at most 120 days.' });
    const reason = str(b.reason, 400); if (reason.length < 3) return res.status(400).json({ message: 'Give a reason.' });
    const clash = await StudentLeave.findOne({ studentId: stu._id, status: { $in: ['Requested', 'Approved'] }, fromDate: { $lte: b.toDate }, toDate: { $gte: b.fromDate } });
    if (clash) return res.status(409).json({ message: `There is already a ${clash.status.toLowerCase()} request for ${clash.fromDate} to ${clash.toDate}.` });
    const doc = await StudentLeave.create({
      schoolId: sid(req), studentId: stu._id, classId: stu.classId, kind: b.kind, state: KINDS.MOBILITY.includes(b.kind) ? 'Mobility' : 'Leave',
      fromDate: b.fromDate, toDate: b.toDate, reason, evidenceUrl: str(b.evidenceUrl, 500), requestedBy: req.user.userId, requestedByRole: req.user.role,
    });
    const cls = stu.classId ? await Class.findById(stu.classId).select('classTeacherId') : null;
    await N.notify({ schoolId: sid(req), type: 'attendance', title: `Leave request: ${stu.name}`, body: `${b.kind}, ${b.fromDate} to ${b.toDate}`, link: '/admin/dashboard#/attendance-ops', recipients: [...(await N.admins(sid(req))), ...(cls?.classTeacherId ? [{ id: cls.classTeacherId, role: 'teacher' }] : [])], exclude: req.user.userId, key: `leavereq:${doc._id}` });
    await audit(req, { action: 'attendance.leave.request', entityType: 'StudentLeave', entityId: doc._id, schoolId: sid(req), detail: { student: stu._id, kind: b.kind, from: b.fromDate, to: b.toDate } });
    res.status(201).json({ leave: doc });
  } catch (e) { fail(res, e); }
};
exports.listLeave = async (req, res) => {
  try {
    const { p, l } = pg(req.query); const q = { schoolId: sid(req) };
    if (req.user.role === 'student') q.studentId = req.user.userId;
    else if (req.user.role === 'parent') {
      const parent = await require('../models/Parent').findById(req.user.userId).select('children'); q.studentId = { $in: (parent?.children || []).map((c) => c) };
    } else { const mine = await myClassIds(req); if (mine) q.classId = { $in: mine }; }
    if (['Requested', 'Approved', 'Rejected', 'Cancelled'].includes(req.query.status)) q.status = req.query.status;
    if (isId(req.query.studentId) && !['student'].includes(req.user.role)) q.studentId = req.query.studentId;
    const [items, total] = await Promise.all([StudentLeave.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), StudentLeave.countDocuments(q)]);
    const stu = new Map((await Student.find({ _id: { $in: items.map((i) => i.studentId) } }).select('name')).map((x) => [String(x._id), x.name]));
    res.json({ leave: items.map((i) => ({ ...i.toObject(), studentName: stu.get(String(i.studentId)) || '' })), pagination: { currentPage: p, totalPages: Math.max(1, Math.ceil(total / l)), pages: Math.max(1, Math.ceil(total / l)), total } });
  } catch (e) { fail(res, e); }
};
exports.decideLeave = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Request not found.' });
    const lv = await StudentLeave.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!lv) return res.status(404).json({ message: 'Request not found.' });
    if (!(lv.classId ? await manageClass(req, lv.classId) : req.user.role === 'admin')) return res.status(403).json({ message: 'Only the head master of this class or the school office can decide.' });
    if (String(lv.requestedBy) === String(req.user.userId)) return res.status(403).json({ message: 'You cannot decide your own request.' });
    if (lv.status !== 'Requested') return res.status(409).json({ message: `This request is already ${lv.status.toLowerCase()}.` });
    const decision = req.body?.decision; if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Decision must be approve or reject.' });
    const note = str(req.body?.note, 300); if (decision === 'reject' && note.length < 3) return res.status(400).json({ message: 'Say why the request is refused.' });
    lv.status = decision === 'approve' ? 'Approved' : 'Rejected'; lv.decidedBy = req.user.userId; lv.decidedByRole = req.user.role; lv.decidedAt = new Date(); lv.decisionNote = note;
    let applied = 0;
    if (decision === 'approve') {
      // days already marked Absent become excused leave; days not yet taken are filled in when the sheet is opened
      const today = (await A.clock(sid(req))).dateKey; const stu = await Student.findById(lv.studentId).select('name classId');
      for (let d = lv.fromDate; d <= lv.toDate && d <= today; d = A.addDays(d, 1)) {
        const rec = await DailyAttendance.findOne({ studentId: lv.studentId, date: A.toUTCDay(d) });
        if (!rec || rec.status !== 'Absent') continue;
        const before = A.snapOf(rec); rec.status = 'Leave'; rec.remarks = `Approved ${lv.kind.toLowerCase()} leave`; rec.markedBy = req.user.userId; rec.markedByModel = roleModel(req.user.role); await rec.save();
        await A.logChange({ schoolId: sid(req), studentId: lv.studentId, date: d, before, after: A.snapOf(rec), source: 'leave', by: req.user.userId, role: req.user.role, reason: `Leave approved: ${lv.reason}` });
        await A.syncAlert({ schoolId: sid(req), student: stu, classId: lv.classId, date: d, record: A.snapOf(rec), marker: req.user.userId, markerModel: roleModel(req.user.role) });
        applied++;
      }
    }
    lv.appliedDays = applied; await lv.save();
    const stu2 = await Student.findById(lv.studentId).select('name');
    const to = [{ id: lv.requestedBy, role: lv.requestedByRole }, ...(await A.recipientsFor(sid(req), lv.studentId))];
    await N.notify({ schoolId: sid(req), type: 'attendance', title: `Leave ${lv.status.toLowerCase()}: ${stu2?.name || ''}`, body: `${lv.kind}, ${lv.fromDate} to ${lv.toDate}${note ? `. ${note}` : ''}`, link: { parent: '/parent/dashboard#/attendance', student: '/student/dashboard#/attendance', default: '/admin/dashboard#/attendance-ops' }, recipients: to, exclude: req.user.userId, key: `leavedec:${lv._id}` });
    await audit(req, { action: `attendance.leave.${decision}`, entityType: 'StudentLeave', entityId: lv._id, schoolId: sid(req), detail: { student: lv.studentId, appliedDays: applied } });
    res.json({ leave: lv, appliedDays: applied });
  } catch (e) { fail(res, e); }
};
exports.cancelLeave = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Request not found.' });
    const lv = await StudentLeave.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!lv) return res.status(404).json({ message: 'Request not found.' });
    if (String(lv.requestedBy) !== String(req.user.userId) && req.user.role !== 'admin') return res.status(403).json({ message: 'Only the person who asked, or the school office, can withdraw it.' });
    if (lv.status !== 'Requested') return res.status(422).json({ message: 'Only a request that has not been decided can be withdrawn.' });
    lv.status = 'Cancelled'; await lv.save(); res.json({ leave: lv });
  } catch (e) { fail(res, e); }
};

/* ───────── corrections and history ───────── */
exports.requestCorrection = async (req, res) => {
  try {
    const b = req.body || {}; const stu = await studentAccess(req, b.studentId);
    if (!stu) return res.status(404).json({ message: 'Student not found.' });
    if (!A.isDay(b.date)) return res.status(400).json({ message: 'Choose the date.' });
    const today = (await A.clock(sid(req))).dateKey; if (b.date > today) return res.status(400).json({ message: 'You cannot correct a future date.' });
    if (!STATUSES.includes(b.status)) return res.status(400).json({ message: 'Choose the correct status.' });
    const reason = str(b.reason, 400); if (reason.length < 5) return res.status(400).json({ message: 'Explain what was wrong.' });
    const rec = await DailyAttendance.findOne({ studentId: stu._id, date: A.toUTCDay(b.date) });
    if (rec && rec.status === b.status && !b.leftAt && !b.arrivedAt) return res.status(422).json({ message: 'The register already says that.' });
    if (await AttendanceCorrection.findOne({ studentId: stu._id, date: b.date, status: 'Requested' })) return res.status(409).json({ message: 'A correction for this day is already waiting.' });
    const requested = { status: b.status, leftAt: b.status === 'HalfDay' && A.HHMM.test(String(b.leftAt || '')) ? b.leftAt : null, arrivedAt: b.status === 'Late' && A.HHMM.test(String(b.arrivedAt || '')) ? b.arrivedAt : null, remarks: str(b.remarks, 200) };
    const doc = await AttendanceCorrection.create({ schoolId: sid(req), studentId: stu._id, classId: stu.classId, date: b.date, original: A.snapOf(rec) || { status: 'Unmarked' }, requested, reason, requestedBy: req.user.userId, requestedByRole: req.user.role });
    const cls = stu.classId ? await Class.findById(stu.classId).select('classTeacherId') : null;
    await N.notify({ schoolId: sid(req), type: 'attendance', title: `Attendance correction asked: ${stu.name}`, body: `${b.date}: ${doc.original.status} to ${b.status}. ${reason}`, link: '/admin/dashboard#/attendance-ops', recipients: [...(await N.admins(sid(req))), ...(cls?.classTeacherId ? [{ id: cls.classTeacherId, role: 'teacher' }] : [])], exclude: req.user.userId, key: `attcorr:${doc._id}` });
    await audit(req, { action: 'attendance.correction.request', entityType: 'AttendanceCorrection', entityId: doc._id, schoolId: sid(req), detail: { student: stu._id, date: b.date, to: b.status } });
    res.status(201).json({ correction: doc });
  } catch (e) { fail(res, e); }
};
exports.listCorrections = async (req, res) => {
  try {
    const { p, l } = pg(req.query); const q = { schoolId: sid(req) };
    if (req.user.role === 'student') q.studentId = req.user.userId;
    else if (req.user.role === 'parent') { const parent = await require('../models/Parent').findById(req.user.userId).select('children'); q.studentId = { $in: parent?.children || [] }; }
    else { const mine = await myClassIds(req); if (mine) q.classId = { $in: mine }; }
    if (['Requested', 'Approved', 'Rejected'].includes(req.query.status)) q.status = req.query.status;
    const [items, total] = await Promise.all([AttendanceCorrection.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), AttendanceCorrection.countDocuments(q)]);
    const stu = new Map((await Student.find({ _id: { $in: items.map((i) => i.studentId) } }).select('name')).map((x) => [String(x._id), x.name]));
    res.json({ corrections: items.map((i) => ({ ...i.toObject(), studentName: stu.get(String(i.studentId)) || '' })), pagination: { currentPage: p, totalPages: Math.max(1, Math.ceil(total / l)), pages: Math.max(1, Math.ceil(total / l)), total } });
  } catch (e) { fail(res, e); }
};
exports.decideCorrection = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Request not found.' });
    const c = await AttendanceCorrection.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!c) return res.status(404).json({ message: 'Request not found.' });
    if (!(c.classId ? await manageClass(req, c.classId) : req.user.role === 'admin')) return res.status(403).json({ message: 'Only the head master of this class or the school office can decide.' });
    if (String(c.requestedBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who asked for a correction cannot approve it.' });
    if (c.status !== 'Requested') return res.status(409).json({ message: `This request is already ${c.status.toLowerCase()}.` });
    const decision = req.body?.decision; if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Decision must be approve or reject.' });
    const note = str(req.body?.note, 300); if (decision === 'reject' && note.length < 3) return res.status(400).json({ message: 'Say why it is refused.' });
    c.decidedBy = req.user.userId; c.decidedByRole = req.user.role; c.decidedAt = new Date(); c.decisionNote = note; c.status = decision === 'approve' ? 'Approved' : 'Rejected';
    const stu = await Student.findById(c.studentId).select('name classId');
    if (decision === 'approve') {
      const was = await DailyAttendance.findOne({ studentId: c.studentId, date: A.toUTCDay(c.date) });
      const r = c.requested;
      const next = { status: r.status, leftAt: r.leftAt || null, arrivedAt: r.arrivedAt || null, authorizedBy: '', remarks: r.remarks || `Corrected: ${c.reason}`.slice(0, 200) };
      await DailyAttendance.findOneAndUpdate({ studentId: c.studentId, date: A.toUTCDay(c.date) }, { $set: { schoolId: sid(req), classId: c.classId, ...next, markedBy: req.user.userId, markedByModel: roleModel(req.user.role) } }, { upsert: true, new: true });
      await A.logChange({ schoolId: sid(req), studentId: c.studentId, date: c.date, before: A.snapOf(was), after: A.snapOf(next), source: 'correction', by: req.user.userId, role: req.user.role, reason: c.reason });
      await A.syncAlert({ schoolId: sid(req), student: stu, classId: c.classId, date: c.date, record: next, marker: req.user.userId, markerModel: roleModel(req.user.role) });
      await A.dispatchDue(sid(req));
    }
    await c.save();
    await N.notify({ schoolId: sid(req), type: 'attendance', title: `Attendance correction ${c.status.toLowerCase()}: ${stu?.name || ''}`, body: `${c.date}${note ? `. ${note}` : ''}`, link: { parent: '/parent/dashboard#/attendance', student: '/student/dashboard#/attendance', default: '/admin/dashboard#/attendance-ops' }, recipients: [{ id: c.requestedBy, role: c.requestedByRole }, ...(await A.recipientsFor(sid(req), c.studentId))], exclude: req.user.userId, key: `attcorrdec:${c._id}` });
    await audit(req, { action: `attendance.correction.${decision}`, entityType: 'AttendanceCorrection', entityId: c._id, schoolId: sid(req), detail: { student: c.studentId, date: c.date } });
    res.json({ correction: c });
  } catch (e) { fail(res, e); }
};
exports.history = async (req, res) => {
  try {
    const stu = await studentAccess(req, req.params.studentId); if (!stu || ['parent', 'student'].includes(req.user.role)) return res.status(404).json({ message: 'Student not found.' });
    const q = { schoolId: sid(req), studentId: stu._id }; if (A.isDay(req.query.date)) q.date = req.query.date;
    res.json({ history: await AttendanceHistory.find(q).sort({ at: -1 }).limit(100) });
  } catch (e) { fail(res, e); }
};

/* ───────── repeated absence cases ───────── */
exports.scanCases = async (req, res) => {
  try {
    const st = await A.getSettings(sid(req)); const today = (await A.clock(sid(req))).dateKey; const from = A.addDays(today, -(st.caseWindowDays - 1));
    const rows = await DailyAttendance.find({ schoolId: sid(req), status: 'Absent', date: { $gte: A.toUTCDay(from), $lte: A.toUTCDay(today) } }).select('studentId');
    const count = new Map(); rows.forEach((r) => count.set(String(r.studentId), (count.get(String(r.studentId)) || 0) + 1));
    let opened = 0;
    for (const [id, n] of count) if (n >= st.caseThreshold && (await A.maybeOpenCase(sid(req), id))) opened++;
    res.json({ opened, checked: count.size });
  } catch (e) { fail(res, e); }
};
async function caseRows(list) {
  const stu = new Map((await Student.find({ _id: { $in: list.map((c) => c.studentId) } }).select('name rollNumber')).map((x) => [String(x._id), x]));
  return list.map((c) => ({ ...c.toObject(), studentName: stu.get(String(c.studentId))?.name || '', rollNumber: stu.get(String(c.studentId))?.rollNumber || '' }));
}
exports.listCases = async (req, res) => {
  try {
    const { p, l } = pg(req.query); const q = { schoolId: sid(req) }; const mine = await myClassIds(req); if (mine) q.classId = { $in: mine };
    if (['Open', 'InProgress', 'Resolved'].includes(req.query.status)) q.status = req.query.status;
    const [items, total] = await Promise.all([AttendanceCase.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), AttendanceCase.countDocuments(q)]);
    res.json({ cases: await caseRows(items), pagination: { currentPage: p, totalPages: Math.max(1, Math.ceil(total / l)), pages: Math.max(1, Math.ceil(total / l)), total } });
  } catch (e) { fail(res, e); }
};
async function caseFor(req) {
  if (!isId(req.params.id)) return null;
  const c = await AttendanceCase.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!c) return null;
  return req.user.role === 'admin' || (c.classId && (await manageClass(req, c.classId))) ? c : null;
}
exports.getCase = async (req, res) => {
  try {
    const c = await caseFor(req); if (!c) return res.status(404).json({ message: 'Case not found.' });
    const [row] = await caseRows([c]);
    const absences = await DailyAttendance.find({ studentId: c.studentId, status: { $in: ['Absent', 'Leave'] } }).sort({ date: -1 }).limit(30);
    res.json({ case: row, days: absences.map((a) => ({ date: A.dayKey(a.date), status: a.status, remarks: a.remarks })) });
  } catch (e) { fail(res, e); }
};
exports.addCaseNote = async (req, res) => {
  try {
    const c = await caseFor(req); if (!c) return res.status(404).json({ message: 'Case not found.' });
    const text = str(req.body?.text, 600); if (text.length < 3) return res.status(400).json({ message: 'Write the note.' });
    c.notes.push({ at: new Date(), by: req.user.userId, byRole: req.user.role, text }); if (c.status === 'Open') c.status = 'InProgress'; await c.save();
    await audit(req, { action: 'attendance.case.note', entityType: 'AttendanceCase', entityId: c._id, schoolId: sid(req), detail: { length: text.length } });
    res.status(201).json({ case: c });
  } catch (e) { fail(res, e); }
};
exports.setCaseStatus = async (req, res) => {
  try {
    const c = await caseFor(req); if (!c) return res.status(404).json({ message: 'Case not found.' });
    const status = req.body?.status; if (!['InProgress', 'Resolved'].includes(status)) return res.status(400).json({ message: 'Status must be InProgress or Resolved.' });
    if (c.status === 'Resolved') return res.status(409).json({ message: 'This case is already resolved.' });
    if (status === 'Resolved') { const outcome = str(req.body?.outcome, 400); if (outcome.length < 5) return res.status(400).json({ message: 'Record what was agreed with the family before closing.' }); c.outcome = outcome; c.resolvedAt = new Date(); }
    c.status = status; await c.save();
    await audit(req, { action: `attendance.case.${status.toLowerCase()}`, entityType: 'AttendanceCase', entityId: c._id, schoolId: sid(req), detail: { student: c.studentId } });
    res.json({ case: c });
  } catch (e) { fail(res, e); }
};

/* ───────── anomalies ───────── */
exports.scanAnomalies = async (req, res) => {
  try {
    const date = req.body?.date || (await A.clock(sid(req))).dateKey; if (!A.isDay(date)) return res.status(400).json({ message: 'Date must be YYYY-MM-DD.' });
    const out = await require('../utils/attendanceAnomalies').scan(sid(req), date);
    await audit(req, { action: 'attendance.anomaly.scan', entityType: 'AttendanceAnomaly', entityId: date, schoolId: sid(req), detail: out });
    res.json(out);
  } catch (e) { fail(res, e); }
};
exports.listAnomalies = async (req, res) => {
  try {
    const { p, l } = pg(req.query); const q = { schoolId: sid(req) }; const mine = await myClassIds(req); if (mine) q.classId = { $in: mine };
    if (['Open', 'Reviewed', 'Dismissed'].includes(req.query.status)) q.status = req.query.status;
    if (A.isDay(req.query.date)) q.date = req.query.date;
    const [items, total] = await Promise.all([AttendanceAnomaly.find(q).sort({ date: -1, createdAt: -1 }).skip((p - 1) * l).limit(l), AttendanceAnomaly.countDocuments(q)]);
    const stu = new Map((await Student.find({ _id: { $in: items.map((i) => i.studentId).filter(Boolean) } }).select('name')).map((x) => [String(x._id), x.name]));
    const cls = new Map((await Class.find({ _id: { $in: items.map((i) => i.classId).filter(Boolean) } }).select('standard division')).map((x) => [String(x._id), `${x.standard}-${x.division}`]));
    res.json({ anomalies: items.map((i) => ({ ...i.toObject(), studentName: stu.get(String(i.studentId)) || '', className: cls.get(String(i.classId)) || '' })), pagination: { currentPage: p, totalPages: Math.max(1, Math.ceil(total / l)), pages: Math.max(1, Math.ceil(total / l)), total } });
  } catch (e) { fail(res, e); }
};
exports.reviewAnomaly = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
    const a = await AttendanceAnomaly.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!a) return res.status(404).json({ message: 'Not found.' });
    if (a.status !== 'Open') return res.status(409).json({ message: `Already ${a.status.toLowerCase()}.` });
    const status = req.body?.status; if (!['Reviewed', 'Dismissed'].includes(status)) return res.status(400).json({ message: 'Status must be Reviewed or Dismissed.' });
    const note = str(req.body?.note, 300); if (note.length < 3) return res.status(400).json({ message: 'Write what you found.' });
    a.status = status; a.note = note; a.reviewedBy = req.user.userId; a.reviewedAt = new Date(); await a.save();
    await audit(req, { action: `attendance.anomaly.${status.toLowerCase()}`, entityType: 'AttendanceAnomaly', entityId: a._id, schoolId: sid(req), detail: { kind: a.kind } });
    res.json({ anomaly: a });
  } catch (e) { fail(res, e); }
};

/* ───────── consent (self check-in, biometric opt-out) ───────── */
exports.getConsent = async (req, res) => {
  try {
    const stu = await studentAccess(req, req.params.studentId); if (!stu) return res.status(404).json({ message: 'Student not found.' });
    const c = await AttendanceConsent.findOne({ schoolId: sid(req), studentId: stu._id });
    res.json({ consent: { selfCheckIn: !!c?.selfCheckIn, biometricOptOut: !!c?.biometricOptOut } });
  } catch (e) { fail(res, e); }
};
exports.putConsent = async (req, res) => {
  try {
    const stu = await studentAccess(req, req.params.studentId); if (!stu) return res.status(404).json({ message: 'Student not found.' });
    const b = req.body || {}; const set = { updatedBy: req.user.userId, updatedByRole: req.user.role };
    if (b.selfCheckIn !== undefined) { set.selfCheckIn = b.selfCheckIn === true; set.selfCheckInAt = new Date(); }
    if (b.biometricOptOut !== undefined) { set.biometricOptOut = b.biometricOptOut === true; set.biometricOptOutAt = new Date(); }
    await AttendanceConsent.updateOne({ schoolId: sid(req), studentId: stu._id }, { $set: set, $setOnInsert: { schoolId: sid(req), studentId: stu._id } }, { upsert: true });
    await audit(req, { action: 'attendance.consent', entityType: 'AttendanceConsent', entityId: stu._id, schoolId: sid(req), detail: b });
    const c = await AttendanceConsent.findOne({ schoolId: sid(req), studentId: stu._id });
    res.json({ consent: { selfCheckIn: !!c.selfCheckIn, biometricOptOut: !!c.biometricOptOut } });
  } catch (e) { fail(res, e); }
};

exports._internals = { manageClass, myClassIds, studentAccess };
