// Attendance operations (PRD E08): policy, verified alerts, history, repeated-absence cases, QR signing, anomaly scan.
// Everything here is school-scoped and free of Express, so the daily sheet, the period register, the leave desk and the
// device endpoints all share one set of rules.
const crypto = require('crypto');
const mongoose = require('../lib/pgdoc');
const AppSetting = require('../models/AppSetting');
const AttendanceAlert = require('../models/AttendanceAlert');
const AlertReceipt = require('../models/AlertReceipt');
const AttendanceHistory = require('../models/AttendanceHistory');
const AttendanceCase = require('../models/AttendanceCase');
const DailyAttendance = require('../models/DailyAttendance');
const StudentLeave = require('../models/StudentLeave');
const Student = require('../models/Student');
const Class = require('../models/Class');
const School = require('../models/School');
const Notification = require('../models/Notification');
const N = require('./notify');
const { nowInTz } = require('./time');

const DEFAULTS = {
  requireVerification: false, // true: a teacher or admin must confirm each absence before parents hear of it
  graceMinutes: 0,            // wait this long after verification so a quick correction never reaches a parent
  caseThreshold: 3,           // absences inside the window that open a supportive follow-up case
  caseWindowDays: 14,
  rollCallCutoff: '10:00',    // a class with no register by then is flagged
  selfCheckInEnabled: false,  // students may check in to an open classroom session (CAP-0380)
  qrWindowSeconds: 30,
  biometricPilot: false,      // never on unless a no-camera alternative exists (CAP-0382)
  deviceStaleMinutes: 30,
  driftToleranceSeconds: 120,
  duplicateWindowSeconds: 10,
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const toUTCDay = (key) => new Date(`${key}T00:00:00.000Z`);
const addDays = (key, n) => dayKey(new Date(toUTCDay(key).getTime() + n * 86400000));
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(toUTCDay(s).getTime());
// Weekly off is Sunday, as in the HR rules
const isSchoolDay = (key) => toUTCDay(key).getUTCDay() !== 0;

async function getSettings(schoolId) {
  const s = await AppSetting.findOne({ key: `attendance:${schoolId}` });
  return { ...DEFAULTS, ...(s?.value || {}) };
}
async function clock(schoolId) {
  const school = await School.findById(schoolId).select('timezone');
  return nowInTz(school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC');
}
// School-local calendar day of an instant
async function localDay(schoolId, at) {
  const school = await School.findById(schoolId).select('timezone');
  return nowInTz(school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC', at).dateKey;
}

/* ───────── history (original is always preserved) ───────── */
const snapOf = (r) => (r ? { status: r.status, leftAt: r.leftAt || null, arrivedAt: r.arrivedAt || null, remarks: r.remarks || '', authorizedBy: r.authorizedBy || '' } : null);
const sameSnap = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function logChange({ schoolId, studentId, date, before, after, source, by, role, reason = '' }) {
  if (sameSnap(before, after)) return;
  await AttendanceHistory.create({ schoolId, studentId, date, before, after, source, changedBy: by, changedByRole: role || '', reason: String(reason).slice(0, 300) });
}

/* ───────── alerts: verify, grace, send, receipts ───────── */
const KIND_LABEL = { Absent: 'was marked absent', Late: 'arrived late', HalfDay: 'left early (half day)' };
const kindFor = (status) => (['Absent', 'Late', 'HalfDay'].includes(status) ? status : null);

function detailFor(row) {
  const bits = [row.date];
  if (row.kind === 'Late' && row.arrivedAt) bits.push(`arrived ${row.arrivedAt}`);
  if (row.kind === 'HalfDay' && row.leftAt) bits.push(`left ${row.leftAt}`);
  if (row.authorizedBy) bits.push(`authorised by ${row.authorizedBy}`);
  return bits.join(' · ');
}

// Called after a day is saved for one student. Raises, refreshes or cancels the alert so parents only ever hear the final truth.
async function syncAlert({ schoolId, student, classId, date, record, marker, markerModel }) {
  const sid = oid(schoolId); const stid = oid(student._id || student);
  const kind = kindFor(record?.status);
  const live = await AttendanceAlert.find({ studentId: stid, date, status: { $in: ['Pending', 'Verified'] } });
  for (const a of live) {
    if (a.kind !== kind) { a.status = 'Cancelled'; a.cancelledReason = 'The mark was corrected before the alert was sent'; await a.save(); }
  }
  // parents already told something that is no longer true hear the correction
  const told = await AttendanceAlert.find({ studentId: stid, date, status: 'Sent' });
  for (const a of told) {
    if (a.kind === kind || a.cancelledReason) continue;
    a.cancelledReason = 'Corrected after sending'; await a.save();
    const stu = await Student.findById(stid).select('name');
    await N.notify({
      schoolId: sid, recipients: await recipientsFor(schoolId, stid), type: 'attendance',
      title: `Correction: ${stu?.name || 'Your child'} is now marked ${(record?.status || 'unmarked').toLowerCase()}`, body: `${date}. The earlier alert (${a.kind.toLowerCase()}) was a mistake.`,
      link: { parent: '/parent/dashboard#/attendance', student: '/student/dashboard#/attendance' }, key: `attfix:${a._id}`,
    });
  }
  if (!kind) return null;
  const st = await getSettings(schoolId);
  const detail = detailFor({ ...record, date, kind });
  let a = await AttendanceAlert.findOne({ studentId: stid, date, kind });
  const verified = !st.requireVerification;
  const dueAt = verified ? new Date(Date.now() + st.graceMinutes * 60000) : null;
  if (!a) {
    return AttendanceAlert.create({
      schoolId: sid, studentId: stid, classId, date, kind, detail, markedBy: marker,
      status: verified ? 'Verified' : 'Pending', dueAt,
      ...(verified ? { verifiedBy: marker, verifiedByModel: markerModel, verifiedAt: new Date() } : {}),
    });
  }
  if (a.status === 'Sent') {
    // already told: only a changed detail (e.g. a corrected arrival time) is worth a follow-up
    if (a.detail !== detail) { a.detail = detail; await a.save(); await notifyAlert(a, { update: true }); }
    return a;
  }
  a.detail = detail; a.classId = classId;
  if (a.status === 'Cancelled') {
    a.status = verified ? 'Verified' : 'Pending'; a.cancelledReason = '';
    a.dueAt = dueAt; a.verifiedBy = verified ? marker : undefined; a.verifiedAt = verified ? new Date() : null;
  }
  await a.save();
  return a;
}

async function recipientsFor(schoolId, studentId) {
  return [{ id: studentId, role: 'student' }, ...(await N.parentsOf(schoolId, [studentId], 'viewAttendance'))];
}

async function notifyAlert(a, { update = false } = {}) {
  const stu = await Student.findById(a.studentId).select('name');
  const who = stu?.name || 'Your child';
  const recipients = await recipientsFor(a.schoolId, a.studentId);
  await N.notify({
    schoolId: a.schoolId, recipients, type: 'attendance',
    title: update ? `Update: ${who} ${KIND_LABEL[a.kind]}` : `${who} ${KIND_LABEL[a.kind]}`, body: a.detail,
    link: { parent: '/parent/dashboard#/attendance', student: '/student/dashboard#/attendance' },
    key: `attalert:${a._id}${update ? `:${Date.now()}` : ''}`,
  });
  for (const r of recipients) {
    await AlertReceipt.updateOne(
      { alertId: a._id, recipientId: oid(r.id) },
      { $setOnInsert: { schoolId: a.schoolId, studentId: a.studentId, role: r.role, deliveredAt: new Date() } },
      { upsert: true },
    ).catch(() => {});
  }
  return recipients.length;
}

// Send everything that is verified and past its grace period. Safe to call from any request or a timer: each alert is claimed once.
async function dispatchDue(schoolId, { limit = 200 } = {}) {
  const due = await AttendanceAlert.find({ schoolId: oid(schoolId), status: 'Verified', dueAt: { $lte: new Date() } }).limit(limit);
  let sent = 0;
  for (const a of due) {
    const claimed = await AttendanceAlert.findOneAndUpdate({ _id: a._id, status: 'Verified' }, { $set: { status: 'Sent', sentAt: new Date() } }, { new: true });
    if (!claimed) continue;
    try { await notifyAlert(claimed); sent++; } catch (e) { console.error('alert send', e.message); }
  }
  return sent;
}

// Delivery, reading and acknowledgement kept apart: refresh readAt from the in-app notification the recipient actually opened
async function receiptsFor(alertId) {
  const rows = await AlertReceipt.find({ alertId });
  if (!rows.length) return [];
  const notes = await Notification.find({ key: `attalert:${alertId}`, userId: { $in: rows.map((r) => r.recipientId) } }).select('userId readAt');
  const read = new Map(notes.map((n) => [String(n.userId), n.readAt]));
  const out = [];
  for (const r of rows) {
    const readAt = r.readAt || read.get(String(r.recipientId)) || null;
    if (readAt && !r.readAt) { r.readAt = readAt; await r.save(); }
    out.push({ _id: r._id, recipientId: r.recipientId, role: r.role, deliveredAt: r.deliveredAt, readAt, acknowledgedAt: r.acknowledgedAt, reply: r.reply });
  }
  return out;
}

/* ───────── approved leave and mobility ───────── */
async function leaveCovering(schoolId, studentId, date) {
  return StudentLeave.findOne({ schoolId: oid(schoolId), studentId: oid(studentId), status: 'Approved', fromDate: { $lte: date }, toDate: { $gte: date } });
}
async function leaveMap(schoolId, studentIds, date) {
  const rows = await StudentLeave.find({ schoolId: oid(schoolId), studentId: { $in: studentIds.map(oid) }, status: 'Approved', fromDate: { $lte: date }, toDate: { $gte: date } });
  return new Map(rows.map((l) => [String(l.studentId), l]));
}

/* ───────── repeated absence → supportive case ───────── */
async function maybeOpenCase(schoolId, studentId) {
  const st = await getSettings(schoolId);
  const today = (await clock(schoolId)).dateKey;
  const from = addDays(today, -(st.caseWindowDays - 1));
  const absences = await DailyAttendance.countDocuments({ schoolId: oid(schoolId), studentId: oid(studentId), status: 'Absent', date: { $gte: toUTCDay(from), $lte: toUTCDay(today) } });
  if (absences < st.caseThreshold) return null;
  const existing = await AttendanceCase.findOne({ studentId: oid(studentId), status: { $in: ['Open', 'InProgress'] } });
  if (existing) return null;
  const stu = await Student.findById(studentId).select('name classId');
  const cls = stu?.classId ? await Class.findById(stu.classId).select('classTeacherId standard division') : null;
  let c;
  try {
    c = await AttendanceCase.create({
      schoolId: oid(schoolId), studentId: oid(studentId), classId: stu?.classId, trigger: { absences, windowDays: st.caseWindowDays, from, to: today },
      assignedTo: cls?.classTeacherId || undefined, assignedRole: cls?.classTeacherId ? 'teacher' : '',
    });
  } catch (e) { if (e.code === 11000) return null; throw e; }
  const recipients = [...(await N.admins(schoolId)), ...(cls?.classTeacherId ? [{ id: cls.classTeacherId, role: 'teacher' }] : [])];
  await N.notify({
    schoolId, recipients, type: 'attendance', title: `Follow-up case: ${stu?.name || 'a student'}`,
    body: `${absences} absences in ${st.caseWindowDays} days. A supportive conversation with the family is the next step.`, link: '/admin/dashboard#/attendance-ops', key: `attcase:${c._id}`,
  });
  return c;
}

/* ───────── signed rotating classroom codes ───────── */
const slotOf = (windowSeconds, at = Date.now()) => Math.floor(at / (windowSeconds * 1000));
const sign = (session, slot) => crypto.createHmac('sha256', session.secret).update(`${session._id}.${slot}`).digest('base64url').slice(0, 10);
function currentCode(session, at = Date.now()) {
  const slot = slotOf(session.windowSeconds, at);
  const remaining = session.windowSeconds - Math.floor((at / 1000) % session.windowSeconds);
  return { code: `${session._id}.${sign(session, slot)}`, expiresInSeconds: remaining };
}
// A scanned code is good for its own window and the one before it (a student walking in just as it rotates)
function codeValid(session, given, at = Date.now()) {
  const part = String(given || '').split('.')[1] || '';
  if (part.length !== 10) return false;
  const slot = slotOf(session.windowSeconds, at);
  return [slot, slot - 1].some((s) => { const a = Buffer.from(sign(session, s)); const b = Buffer.from(part); return a.length === b.length && crypto.timingSafeEqual(a, b); });
}
const newSecret = () => crypto.randomBytes(24).toString('hex');
const hashKey = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');
const newDeviceKey = () => `dk_${crypto.randomBytes(24).toString('base64url')}`;

module.exports = {
  DEFAULTS, HHMM, oid, dayKey, toUTCDay, addDays, isDay, isSchoolDay, getSettings, clock, localDay,
  snapOf, logChange, kindFor, syncAlert, dispatchDue, notifyAlert, receiptsFor, recipientsFor,
  leaveCovering, leaveMap, maybeOpenCase, currentCode, codeValid, newSecret, hashKey, newDeviceKey,
};
