// Classroom check-in, gate and classroom devices (PRD E08, CAP-0374/0375/0376/0380/0382).
const crypto = require('crypto');
const mongoose = require('../lib/pgdoc');
const A = require('../utils/attendanceOps');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Timetable = require('../models/Timetable');
const Attendance = require('../models/Attendance');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceEvidence = require('../models/AttendanceEvidence');
const AttendanceDevice = require('../models/AttendanceDevice');
const AttendanceConsent = require('../models/AttendanceConsent');
const { manageClass } = require('./attendanceOpsController')._internals;

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const sid = (req) => req.user.schoolId;
const roleModel = (r) => (r === 'admin' ? 'User' : 'Teacher');

// a teacher may open a classroom session for a class they head or teach; the office may open any
async function mayRun(req, classId) {
  if (await manageClass(req, classId)) return true;
  if (req.user.role !== 'teacher') return false;
  const tts = await Timetable.find({ schoolId: sid(req), classId, isActive: true });
  return tts.some((t) => (t.slots || []).some((s) => String(s.teacherId) === String(req.user.userId)));
}

/* ───────── classroom sessions (teacher / office) ───────── */
exports.openSession = async (req, res) => {
  try {
    const b = req.body || {}; if (!isId(b.classId)) return res.status(400).json({ message: 'Choose the class.' });
    const cls = await Class.findOne({ _id: b.classId, schoolId: sid(req) }).select('standard division'); if (!cls) return res.status(404).json({ message: 'Class not found.' });
    if (!(await mayRun(req, cls._id))) return res.status(403).json({ message: 'You do not teach this class.' });
    const st = await A.getSettings(sid(req)); if (!st.selfCheckInEnabled) return res.status(422).json({ message: 'Classroom check-in is switched off for this school. The office can turn it on in attendance settings.' });
    let subjectId = null; if (b.subjectId) { if (!isId(b.subjectId) || !(await Subject.exists({ _id: b.subjectId, schoolId: sid(req) }))) return res.status(404).json({ message: 'Subject not found.' }); subjectId = b.subjectId; }
    for (const k of ['startTime', 'endTime']) if (b[k] && !A.HHMM.test(String(b[k]))) return res.status(400).json({ message: 'Times look like 09:30.' });
    const open = (await AttendanceSession.find({ schoolId: sid(req), classId: cls._id, status: 'Open' })).find((x) => String(x.subjectId || '') === String(subjectId || ''));
    if (open) return res.status(409).json({ message: 'A check-in is already open for this class and subject. Close it first.', sessionId: open._id });
    const s = await AttendanceSession.create({
      schoolId: sid(req), classId: cls._id, subjectId, teacherId: req.user.role === 'teacher' ? req.user.userId : undefined, openedBy: req.user.userId, openedByRole: req.user.role,
      date: (await A.clock(sid(req))).dateKey, startTime: b.startTime || '', endTime: b.endTime || '', secret: A.newSecret(), windowSeconds: st.qrWindowSeconds,
    });
    await audit(req, { action: 'attendance.session.open', entityType: 'AttendanceSession', entityId: s._id, schoolId: sid(req), detail: { classId: cls._id, subjectId } });
    const { secret, ...safe } = s.toObject();
    res.status(201).json({ session: safe, ...A.currentCode(s) });
  } catch (e) { fail(res, e); }
};
async function sessionFor(req) {
  if (!isId(req.params.id)) return null;
  const s = await AttendanceSession.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!s) return null;
  return (await mayRun(req, s.classId)) ? s : null;
}
exports.listSessions = async (req, res) => {
  try {
    const q = { schoolId: sid(req), status: 'Open' };
    if (req.user.role === 'student') {
      const me = await Student.findOne({ _id: req.user.userId, schoolId: sid(req) }).select('classId'); if (!me?.classId) return res.json({ sessions: [] }); q.classId = me.classId;
    }
    let list = await AttendanceSession.find(q).sort({ createdAt: -1 }).limit(50);
    if (req.user.role === 'teacher') { const keep = []; for (const s of list) if (await mayRun(req, s.classId)) keep.push(s); list = keep; }
    const cls = new Map((await Class.find({ _id: { $in: list.map((s) => s.classId) } }).select('standard division')).map((c) => [String(c._id), `${c.standard}-${c.division}`]));
    const subj = new Map((await Subject.find({ _id: { $in: list.map((s) => s.subjectId).filter(Boolean) } }).select('name')).map((c) => [String(c._id), c.name]));
    res.json({ sessions: list.map((s) => ({ _id: s._id, classId: s.classId, className: cls.get(String(s.classId)) || '', subjectName: subj.get(String(s.subjectId)) || '', date: s.date, startTime: s.startTime, endTime: s.endTime, status: s.status })) });
  } catch (e) { fail(res, e); }
};
exports.sessionCode = async (req, res) => {
  try {
    const s = await sessionFor(req); if (!s) return res.status(404).json({ message: 'Session not found.' });
    if (s.status !== 'Open') return res.status(409).json({ message: 'This session is closed.' });
    res.json({ ...A.currentCode(s), windowSeconds: s.windowSeconds });
  } catch (e) { fail(res, e); }
};
exports.getSession = async (req, res) => {
  try {
    const s = await sessionFor(req); if (!s) return res.status(404).json({ message: 'Session not found.' });
    const ev = await AttendanceEvidence.find({ sessionId: s._id }).sort({ occurredAt: 1 });
    const stu = new Map((await Student.find({ _id: { $in: ev.map((e) => e.studentId) } }).select('name rollNumber')).map((x) => [String(x._id), x]));
    const { secret, ...safe } = s.toObject();
    res.json({ session: safe, evidence: ev.map((e) => ({ ...e.toObject(), studentName: stu.get(String(e.studentId))?.name || '', rollNumber: stu.get(String(e.studentId))?.rollNumber || '' })), counts: { pending: ev.filter((e) => e.status === 'Pending').length, approved: ev.filter((e) => e.status === 'Approved').length, flagged: ev.filter((e) => e.flags.length).length } });
  } catch (e) { fail(res, e); }
};
exports.closeSession = async (req, res) => {
  try {
    const s = await sessionFor(req); if (!s) return res.status(404).json({ message: 'Session not found.' });
    if (s.status === 'Closed') return res.status(409).json({ message: 'Already closed.' });
    s.status = 'Closed'; s.closedAt = new Date(); await s.save();
    await audit(req, { action: 'attendance.session.close', entityType: 'AttendanceSession', entityId: s._id, schoolId: sid(req), detail: {} });
    res.json({ session: { _id: s._id, status: s.status, closedAt: s.closedAt } });
  } catch (e) { fail(res, e); }
};
// The instructor approves a check-in; only then does the lesson show the student present
async function applyEvidence(req, s, e) {
  const date = A.toUTCDay(s.date);
  await Attendance.findOneAndUpdate(
    { schoolId: sid(req), userId: e.studentId, classId: s.classId, subjectId: s.subjectId || null, date },
    { $set: { status: 'Present', teacherId: s.teacherId || null, periodStartTime: s.startTime || null, periodEndTime: s.endTime || null, markedBy: req.user.userId, markedByModel: roleModel(req.user.role), remarks: 'QR check-in approved' } },
    { upsert: true, new: true },
  );
  e.status = 'Approved'; e.decidedBy = req.user.userId; e.decidedAt = new Date(); await e.save();
}
exports.decideEvidence = async (req, res) => {
  try {
    const s = await sessionFor(req); if (!s) return res.status(404).json({ message: 'Session not found.' });
    if (!isId(req.params.eid)) return res.status(404).json({ message: 'Check-in not found.' });
    const e = await AttendanceEvidence.findOne({ _id: req.params.eid, sessionId: s._id }); if (!e) return res.status(404).json({ message: 'Check-in not found.' });
    if (e.status !== 'Pending') return res.status(409).json({ message: `Already ${e.status.toLowerCase()}.` });
    const d = req.body?.decision; if (!['approve', 'reject'].includes(d)) return res.status(400).json({ message: 'Decision must be approve or reject.' });
    if (d === 'approve') await applyEvidence(req, s, e);
    else { const note = str(req.body?.note, 200); if (note.length < 3) return res.status(400).json({ message: 'Say why this check-in is refused.' }); e.status = 'Rejected'; e.note = note; e.decidedBy = req.user.userId; e.decidedAt = new Date(); await e.save(); }
    await audit(req, { action: `attendance.checkin.${d}`, entityType: 'AttendanceEvidence', entityId: e._id, schoolId: sid(req), detail: { student: e.studentId, flags: e.flags } });
    res.json({ evidence: e });
  } catch (e) { fail(res, e); }
};
// Approve everything that raised no flag; flagged check-ins always need an individual look
exports.approveClean = async (req, res) => {
  try {
    const s = await sessionFor(req); if (!s) return res.status(404).json({ message: 'Session not found.' });
    const ev = await AttendanceEvidence.find({ sessionId: s._id, status: 'Pending' }); let approved = 0; let held = 0;
    for (const e of ev) { if (e.flags.length) { held++; continue; } await applyEvidence(req, s, e); approved++; }
    await audit(req, { action: 'attendance.checkin.approve-clean', entityType: 'AttendanceSession', entityId: s._id, schoolId: sid(req), detail: { approved, held } });
    res.json({ approved, heldForReview: held });
  } catch (e) { fail(res, e); }
};

/* ───────── student check-in ───────── */
exports.checkIn = async (req, res) => {
  try {
    const b = req.body || {}; const sessionId = String(b.code || '').split('.')[0];
    if (!isId(sessionId)) return res.status(422).json({ message: 'That code is not valid.' });
    const stu = await Student.findOne({ _id: req.user.userId, schoolId: sid(req) }).select('name classId'); if (!stu) return res.status(404).json({ message: 'Student not found.' });
    const st = await A.getSettings(sid(req)); if (!st.selfCheckInEnabled) return res.status(403).json({ message: 'Classroom check-in is not switched on at your school.' });
    const s = await AttendanceSession.findOne({ _id: sessionId, schoolId: sid(req) });
    if (!s || s.status !== 'Open') return res.status(422).json({ message: 'That check-in is closed or does not exist.' });
    if (!stu.classId || String(stu.classId) !== String(s.classId)) return res.status(403).json({ message: 'This check-in is for another class.' });
    // consent comes first; it covers this one tool and nothing else (no location, no background use)
    let consent = await AttendanceConsent.findOne({ schoolId: sid(req), studentId: stu._id });
    if (!consent?.selfCheckIn) {
      if (b.consent !== true) return res.status(428).json({ message: 'Before your first check-in, agree that this class check-in records only that you scanned the code, at that time. Your location is never read.', consentRequired: true });
      await AttendanceConsent.updateOne({ schoolId: sid(req), studentId: stu._id }, { $set: { selfCheckIn: true, selfCheckInAt: new Date(), updatedBy: stu._id, updatedByRole: 'student' }, $setOnInsert: { schoolId: sid(req), studentId: stu._id } }, { upsert: true });
    }
    if (!A.codeValid(s, b.code)) return res.status(422).json({ message: 'That code has expired. Scan the one on the board now.' });
    if (await AttendanceEvidence.findOne({ sessionId: s._id, studentId: stu._id })) return res.status(409).json({ message: 'You are already checked in to this class.' });
    const flags = []; const clientKey = str(b.clientKey, 80);
    // one phone or browser checking in for several classmates is the usual way a code gets shared
    if (clientKey) {
      const same = (await AttendanceEvidence.find({ sessionId: s._id, clientKey })).filter((x) => String(x.studentId) !== String(stu._id));
      if (same.length) { flags.push('shared-device'); for (const o of same) if (!o.flags.includes('shared-device')) { o.flags.push('shared-device'); await o.save(); } }
    }
    const ev = await AttendanceEvidence.create({ schoolId: sid(req), kind: 'qr', studentId: stu._id, sessionId: s._id, occurredAt: new Date(), status: 'Pending', flags, clientKey });
    res.status(201).json({ message: 'You are checked in. Your teacher will confirm it.', status: ev.status, privacy: 'Only that you scanned this code, and when, was recorded.' });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'You are already checked in to this class.' }); fail(res, e); }
};

/* ───────── devices (office) ───────── */
const deviceView = (d, st) => {
  const stale = !d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > st.deviceStaleMinutes * 60000; const drifting = Math.abs(d.driftSeconds || 0) > st.driftToleranceSeconds;
  return { _id: d._id, name: d.name, kind: d.kind, location: d.location, status: d.status, lastSeenAt: d.lastSeenAt, lastEventAt: d.lastEventAt, driftSeconds: Math.round(d.driftSeconds || 0), health: d.status === 'Disabled' ? 'Disabled' : stale ? 'Silent' : drifting ? 'Clock drift' : 'Healthy' };
};
exports.listDevices = async (req, res) => { try { const st = await A.getSettings(sid(req)); res.json({ devices: (await AttendanceDevice.find({ schoolId: sid(req) }).sort({ createdAt: -1 })).map((d) => deviceView(d, st)) }); } catch (e) { fail(res, e); } };
exports.createDevice = async (req, res) => {
  try {
    const name = str(req.body?.name, 60); if (name.length < 2) return res.status(400).json({ message: 'Name the device.' });
    const kind = ['gate', 'classroom'].includes(req.body?.kind) ? req.body.kind : 'gate'; const key = A.newDeviceKey();
    const d = await AttendanceDevice.create({ schoolId: sid(req), name, kind, location: str(req.body?.location, 80), keyHash: A.hashKey(key), createdBy: req.user.userId });
    await audit(req, { action: 'attendance.device.create', entityType: 'AttendanceDevice', entityId: d._id, schoolId: sid(req), detail: { name, kind } });
    res.status(201).json({ device: deviceView(d, await A.getSettings(sid(req))), key, note: 'Copy this key into the device now. It is shown once and only its hash is kept.' });
  } catch (e) { fail(res, e); }
};
async function deviceOf(req) { return isId(req.params.id) ? AttendanceDevice.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; }
exports.rotateKey = async (req, res) => {
  try { const d = await deviceOf(req); if (!d) return res.status(404).json({ message: 'Device not found.' }); const key = A.newDeviceKey(); d.keyHash = A.hashKey(key); await d.save(); await audit(req, { action: 'attendance.device.rotate', entityType: 'AttendanceDevice', entityId: d._id, schoolId: sid(req), detail: {} }); res.json({ key }); } catch (e) { fail(res, e); }
};
exports.setDeviceStatus = async (req, res) => {
  try {
    const d = await deviceOf(req); if (!d) return res.status(404).json({ message: 'Device not found.' }); if (!['Active', 'Disabled'].includes(req.body?.status)) return res.status(400).json({ message: 'Status must be Active or Disabled.' });
    d.status = req.body.status; await d.save(); await audit(req, { action: 'attendance.device.status', entityType: 'AttendanceDevice', entityId: d._id, schoolId: sid(req), detail: { status: d.status } }); res.json({ device: deviceView(d, await A.getSettings(sid(req))) });
  } catch (e) { fail(res, e); }
};
exports.setBadge = async (req, res) => {
  try {
    if (!isId(req.params.studentId)) return res.status(404).json({ message: 'Student not found.' });
    const stu = await Student.findOne({ _id: req.params.studentId, schoolId: sid(req) }).select('name badgeId'); if (!stu) return res.status(404).json({ message: 'Student not found.' });
    const badge = str(req.body?.badgeId, 40); if (badge && !/^[A-Za-z0-9:_-]{3,40}$/.test(badge)) return res.status(400).json({ message: 'A badge number is 3-40 letters, numbers or - _ :' });
    if (badge && (await Student.findOne({ schoolId: sid(req), badgeId: badge, _id: { $ne: stu._id } }))) return res.status(409).json({ message: 'That badge is already assigned to another student.' });
    stu.badgeId = badge; await stu.save(); await audit(req, { action: 'attendance.badge', entityType: 'Student', entityId: stu._id, schoolId: sid(req), detail: { assigned: !!badge } });
    res.json({ studentId: stu._id, badgeId: stu.badgeId });
  } catch (e) { fail(res, e); }
};
exports.gateLog = async (req, res) => {
  try {
    const date = A.isDay(req.query.date) ? req.query.date : (await A.clock(sid(req))).dateKey; const day = A.toUTCDay(date);
    const ev = (await AttendanceEvidence.find({ schoolId: sid(req), kind: { $in: ['gate', 'badge', 'biometric'] }, occurredAt: { $gte: new Date(day.getTime() - 86400000), $lte: new Date(day.getTime() + 2 * 86400000) } }).sort({ occurredAt: -1 })).filter((e) => true);
    const keep = []; for (const e of ev) if (await A.localDay(sid(req), e.occurredAt) === date) keep.push(e);
    const stu = new Map((await Student.find({ _id: { $in: keep.map((e) => e.studentId).filter(Boolean) } }).select('name')).map((x) => [String(x._id), x.name]));
    res.json({ date, events: keep.slice(0, 300).map((e) => ({ ...e.toObject(), studentName: stu.get(String(e.studentId)) || '' })), note: 'A gate scan proves someone came in. It never marks a lesson.' });
  } catch (e) { fail(res, e); }
};

/* ───────── device endpoints (the reader signs in with its own key) ───────── */
exports.deviceAuth = async (req, res, next) => {
  try {
    const id = req.get('X-Device-Id'); const key = req.get('X-Device-Key');
    if (!isId(id) || !key) return res.status(401).json({ message: 'Device id and key are required.' });
    const d = await AttendanceDevice.findById(id);
    const a = Buffer.from(A.hashKey(key)); const b = Buffer.from(d?.keyHash || '');
    if (!d || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Device not recognised.' });
    if (d.status !== 'Active') return res.status(403).json({ message: 'This device is disabled.' });
    req.device = d; next();
  } catch (e) { fail(res, e); }
};
const driftOf = (deviceTime) => { const t = new Date(deviceTime).getTime(); return Number.isFinite(t) ? (t - Date.now()) / 1000 : null; };
exports.heartbeat = async (req, res) => {
  try {
    const d = req.device; const drift = driftOf(req.body?.deviceTime); d.lastSeenAt = new Date(); if (drift !== null) d.driftSeconds = drift; await d.save();
    const st = await A.getSettings(d.schoolId);
    res.json({ ok: true, serverTime: new Date().toISOString(), driftSeconds: Math.round(d.driftSeconds || 0), clockOk: Math.abs(d.driftSeconds || 0) <= st.driftToleranceSeconds });
  } catch (e) { fail(res, e); }
};
exports.deviceEvents = async (req, res) => {
  try {
    const d = req.device; const st = await A.getSettings(d.schoolId); const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!events.length) return res.status(400).json({ message: 'Send at least one event.' }); if (events.length > 200) return res.status(400).json({ message: 'Send at most 200 events at a time.' });
    const drift = driftOf(req.body?.deviceTime); d.lastSeenAt = new Date(); if (drift !== null) d.driftSeconds = drift;
    const out = { accepted: 0, replayed: 0, flagged: 0, rejected: [] };
    for (const [i, e] of events.entries()) {
      const method = ['nfc', 'rfid', 'badge', 'biometric'].includes(e.method) ? e.method : 'badge';
      const at = new Date(e.at); if (Number.isNaN(at.getTime())) { out.rejected.push({ index: i, reason: 'bad-time' }); continue; }
      const badgeId = str(e.badgeId, 40); const stu = badgeId ? await Student.findOne({ schoolId: d.schoolId, badgeId }).select('name') : null;
      if (!stu) { out.rejected.push({ index: i, reason: 'unknown-badge' }); continue; }
      const consent = await AttendanceConsent.findOne({ schoolId: d.schoolId, studentId: stu._id });
      if (method === 'biometric' && (!st.biometricPilot || consent?.biometricOptOut)) { out.rejected.push({ index: i, reason: st.biometricPilot ? 'opted-out' : 'biometric-off' }); continue; }
      if (await AttendanceEvidence.findOne({ schoolId: d.schoolId, deviceId: d._id, studentId: stu._id, occurredAt: at })) { out.replayed++; continue; }
      const flags = [];
      if (at.getTime() > Date.now() + st.driftToleranceSeconds * 1000) flags.push('future-timestamp');
      if (Math.abs(d.driftSeconds || 0) > st.driftToleranceSeconds) flags.push('clock-drift');
      const near = (await AttendanceEvidence.find({ schoolId: d.schoolId, deviceId: d._id, studentId: stu._id, occurredAt: { $gte: new Date(at.getTime() - st.duplicateWindowSeconds * 1000), $lte: new Date(at.getTime() + st.duplicateWindowSeconds * 1000) } })).length;
      if (near) flags.push('suspect-duplicate');
      await AttendanceEvidence.create({ schoolId: d.schoolId, kind: method === 'biometric' ? 'biometric' : method === 'badge' ? 'badge' : 'gate', studentId: stu._id, deviceId: d._id, direction: e.direction === 'out' ? 'out' : 'in', occurredAt: at, driftSeconds: drift || 0, status: 'Info', flags, badgeId });
      out.accepted++; if (flags.length) out.flagged++; d.lastEventAt = new Date();
    }
    await d.save();
    res.status(201).json({ ...out, note: 'Gate events are evidence of entry only. Lessons are still marked by the teacher or an approved check-in.' });
  } catch (e) { fail(res, e); }
};
