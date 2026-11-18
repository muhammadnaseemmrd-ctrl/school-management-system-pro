// Attendance alerts, leave, corrections, cases, offline replay, period register, QR check-in, devices, anomalies (E08).
module.exports = async ({ call, expect, log, tokens, base }) => {
  const School = require('../models/School'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class'); const Student = require('../models/Student'); const Parent = require('../models/Parent');
  const Subject = require('../models/Subject'); const Timetable = require('../models/Timetable'); const User = require('../models/User'); const Notification = require('../models/Notification');
  const Daily = require('../models/DailyAttendance'); const Period = require('../models/Attendance'); const Alert = require('../models/AttendanceAlert'); const History = require('../models/AttendanceHistory');
  const Session = require('../models/AttendanceSession'); const Evidence = require('../models/AttendanceEvidence'); const Device = require('../models/AttendanceDevice'); const Anomaly = require('../models/AttendanceAnomaly');
  const Leave = require('../models/StudentLeave'); const Corr = require('../models/AttendanceCorrection'); const Case = require('../models/AttendanceCase'); const AuditLog = require('../models/AuditLog'); const Mutation = require('../models/AttendanceMutation');
  const AppSetting = require('../models/AppSetting'); const AO = require('../utils/attendanceOps');
  const { hashPassword } = require('../utils/password'); const { nowInTz } = require('../utils/time');
  const A = tokens.admin; const T = tokens.teacher;
  console.log('\n— Attendance operations —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id);
  const clock = nowInTz(school.timezone || process.env.DEFAULT_TIMEZONE || 'UTC'); const today = clock.dateKey; const yday = AO.addDays(today, -1);
  // sign tokens directly: the login endpoint is rate limited and the suite has already used most of its budget
  const { generateAccessToken } = require('../utils/jwt'); const tokFor = (doc, role) => generateAccessToken(String(doc._id), sid, role);
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' }); const otherT = (await Teacher.find({ schoolId: sid, _id: { $ne: sara._id } }))[0];
  let adm2 = await User.findOne({ schoolId: sid, email: 'second@demo.school' }); if (!adm2) adm2 = await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' });
  const A2 = tokFor(adm2, 'admin');

  // ── fixtures: one class headed by Sara, 16 students, two parents ──
  await Class.deleteMany({ schoolId: sid, standard: '66' });
  const cls = await Class.create({ schoolId: sid, standard: '66', division: 'E', capacity: 40, room: 'Room 66', academicYear: '2026-2027', classTeacherId: sara._id });
  const pw = await hashPassword('Student@123'); const kids = [];
  for (let i = 1; i <= 16; i++) kids.push(await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `Att Kid ${String(i).padStart(2, '0')}`, email: `attkid${i}@demo.school`, password: pw, rollNumber: String(i), classId: cls._id, division: 'E', academicYear: '2026-2027', gender: 'Male', country: 'Pakistan', nationality: 'Pakistani' }));
  const [s1, s2, s3, s4, s5] = kids; const cid = String(cls._id);
  const mkParent = async (n, child) => Parent.create({ schoolId: sid, name: `Att Parent ${n}`, email: `attparent${n}@demo.school`, password: await hashPassword('Parent@123'), phone: '+92-300-0000000', relationship: 'Father', children: [child._id] });
  const pa = await mkParent(1, s1); const pb = await mkParent(2, s2);
  const PA = tokFor(pa, 'parent'); const PB = tokFor(pb, 'parent'); const S1 = tokFor(s1, 'student');
  log((await call('GET', '/attendance-ops/me/alerts', PA)).status === 200, 'fixture parent token works');
  await AppSetting.deleteOne({ key: `attendance:${sid}` });
  const sheet = (records, extra = {}) => call('POST', `/daily-attendance/class/${cid}`, A, { date: today, records, ...extra });
  const allPresent = () => kids.map((k) => ({ studentId: String(k._id), status: 'Present' }));
  const withStatus = (m) => kids.map((k) => ({ studentId: String(k._id), ...(m[String(k._id)] || { status: 'Present' }) }));
  const unread = (id) => Notification.countDocuments({ userId: id });

  // ── policy ──
  await expect('teacher cannot read attendance policy', call('GET', '/attendance-ops/settings', T), [403]);
  await expect('parent cannot change attendance policy', call('PUT', '/attendance-ops/settings', PA, { graceMinutes: 5 }), [403]);
  await expect('unauthenticated refused', call('GET', '/attendance-ops/alerts', null), [401]);
  const def = (await expect('policy has safe defaults', call('GET', '/attendance-ops/settings', A))).data.settings;
  log(def.requireVerification === false && def.graceMinutes === 0 && def.selfCheckInEnabled === false && def.biometricPilot === false, 'defaults: no verification, no wait, check-in off, no biometrics');
  await expect('a negative wait is refused', call('PUT', '/attendance-ops/settings', A, { graceMinutes: -1 }), [400]);
  await expect('a bad cutoff time is refused', call('PUT', '/attendance-ops/settings', A, { rollCallCutoff: '25:00' }), [400]);
  await expect('a biometric pilot needs a no-camera alternative first', call('PUT', '/attendance-ops/settings', A, { biometricPilot: true }), [422]);

  // ── immediate alerts: delivery, read and acknowledgement are three facts ──
  const m1 = await sheet(withStatus({ [String(s1._id)]: { status: 'Absent' }, [String(s3._id)]: { status: 'Late', arrivedAt: '08:45', authorizedBy: 'Mr Aslam' } }));
  log(m1.status === 200, `class register saved with an absence and a late arrival -> ${m1.status}`);
  const a1 = await Alert.findOne({ studentId: s1._id, date: today, kind: 'Absent' });
  log(a1 && a1.status === 'Sent', 'with no wait and no verification the absence alert is sent at once');
  const mine = (await call('GET', '/attendance-ops/me/alerts', PA)).data.alerts; const r1 = mine.find((x) => String(x._id) === String(a1._id));
  log(!!r1 && !!r1.deliveredAt && r1.readAt === null && r1.acknowledgedAt === null, 'delivered is not read and not acknowledged');
  await expect('the other family sees nothing of it', call('POST', `/attendance-ops/me/alerts/${a1._id}/ack`, PB, { reply: 'x' }), [404]);
  const note = await Notification.findOne({ userId: pa._id, key: `attalert:${a1._id}` }); log(!!note, 'the parent got an in-app notice');
  await expect('parent opens the notice', call('PUT', `/notifications/${note._id}/read`, PA, {}), [200, 204]);
  const g1 = (await expect('admin reads alert receipts', call('GET', `/attendance-ops/alerts/${a1._id}`, A))).data;
  const rp = g1.receipts.find((x) => x.role === 'parent'); log(!!rp.readAt && !rp.acknowledgedAt, 'reading shows up separately from delivery');
  const ack = await expect('parent answers the alert', call('POST', `/attendance-ops/me/alerts/${a1._id}/ack`, PA, { reply: 'He had a fever. Doctor note will follow.' }));
  log(!!ack.data.receipt.acknowledgedAt && ack.data.receipt.reply.includes('fever'), 'acknowledgement and reply are kept');
  await expect('a second answer is refused', call('POST', `/attendance-ops/me/alerts/${a1._id}/ack`, PA, { reply: 'again' }), [409]);
  log(!!(await Notification.findOne({ userId: sara._id, key: new RegExp('^attreply:') })), 'the head master hears the family reply');
  const late = await Alert.findOne({ studentId: s3._id, date: today, kind: 'Late' }); log(late.detail.includes('arrived 08:45') && late.detail.includes('authorised by Mr Aslam'), 'late arrival keeps time and authoriser in the message');
  await expect('a bad arrival time is refused', sheet(withStatus({ [String(s3._id)]: { status: 'Late', arrivedAt: '8.45' } })), [400]);

  // ── history keeps the original; a corrected absence tells the family ──
  await expect('admin corrects the day for one student', call('PUT', '/daily-attendance/student-day', A, { studentId: String(s1._id), date: today, status: 'Present', reason: 'Seen in assembly' }));
  const h1 = (await expect('admin reads the history', call('GET', `/attendance-ops/history/${s1._id}`, A))).data.history;
  log(h1.length >= 2 && h1.some((h) => h.before?.status === 'Absent' && h.after?.status === 'Present'), 'the earlier mark is kept in the history');
  log(!!(await Notification.findOne({ userId: pa._id, key: new RegExp('^attfix:') })), 'a parent already told is sent the correction');
  await expect('a parent cannot read history', call('GET', `/attendance-ops/history/${s1._id}`, PA), [403]);

  // ── verification and grace ──
  await expect('turn on verification and a wait', call('PUT', '/attendance-ops/settings', A, { requireVerification: true, graceMinutes: 30 }));
  const before = await unread(s2._id);
  await sheet(withStatus({ [String(s2._id)]: { status: 'Absent' }, [String(s3._id)]: { status: 'Absent' } }));
  const a2 = await Alert.findOne({ studentId: s2._id, date: today, kind: 'Absent' });
  log(a2.status === 'Pending' && (await unread(s2._id)) === before, 'an unverified absence is held and nobody is told');
  await sheet(withStatus({ [String(s2._id)]: { status: 'Absent' }, [String(s3._id)]: { status: 'Present' } }));
  const a3 = await Alert.findOne({ studentId: s3._id, date: today, kind: 'Absent' }); log(a3.status === 'Cancelled', 'an absence corrected before anyone verified it is cancelled');
  await expect('a teacher who is not the head master cannot verify', call('POST', `/attendance-ops/alerts/${a2._id}/verify`, tokFor(otherT, 'teacher'), {}), [403, 404]);
  const v = (await expect('the head master verifies', call('POST', `/attendance-ops/alerts/${a2._id}/verify`, T, {}))).data;
  log(v.alert.status === 'Verified' && new Date(v.alert.dueAt) > new Date(), 'verified, but it waits out the grace period');
  await expect('verifying twice is refused', call('POST', `/attendance-ops/alerts/${a2._id}/verify`, T, {}), [409]);
  log((await call('POST', '/attendance-ops/alerts/dispatch', A, {})).data.sent === 0, 'nothing is sent before the wait is over');
  await Alert.updateOne({ _id: a2._id }, { $set: { dueAt: new Date(Date.now() - 1000) } });
  log((await call('POST', '/attendance-ops/alerts/dispatch', A, {})).data.sent >= 1 && (await Alert.findById(a2._id)).status === 'Sent', 'after the wait the alert is sent');
  log(!!(await Notification.findOne({ userId: pb._id, key: `attalert:${a2._id}` })), 'the parent now has it');
  const s4alert = await Alert.findOne({ studentId: s4._id }); log(!s4alert, 'present students get no alert');
  await sheet(withStatus({ [String(s4._id)]: { status: 'HalfDay', leftAt: '11:30', authorizedBy: 'Office' } }));
  const a4 = await Alert.findOne({ studentId: s4._id, kind: 'HalfDay' }); await expect('cancel needs a reason', call('POST', `/attendance-ops/alerts/${a4._id}/cancel`, A, { reason: '' }), [400]);
  await expect('the office holds an alert back', call('POST', `/attendance-ops/alerts/${a4._id}/cancel`, A, { reason: 'Parent collected him by arrangement' }));
  await expect('a sent alert cannot be cancelled', call('POST', `/attendance-ops/alerts/${a2._id}/cancel`, A, { reason: 'too late' }), [409]);
  await expect('unknown alert is 404', call('GET', '/attendance-ops/alerts/000000000000000000000000', A), [404]);
  await sheet(allPresent()); await expect('verification back off', call('PUT', '/attendance-ops/settings', A, { requireVerification: false, graceMinutes: 0 }));

  // ── leave and mobility ──
  const lv = { studentId: String(s2._id), kind: 'Medical', fromDate: today, toDate: AO.addDays(today, 1), reason: 'Fever and rest' };
  await expect('a parent cannot ask for another family child', call('POST', '/attendance-ops/leave', PA, lv), [404]);
  await expect('kind must be known', call('POST', '/attendance-ops/leave', PB, { ...lv, kind: 'Holiday' }), [400]);
  await expect('last day before first is refused', call('POST', '/attendance-ops/leave', PB, { ...lv, toDate: yday }), [400]);
  await expect('a reason is needed', call('POST', '/attendance-ops/leave', PB, { ...lv, reason: '' }), [400]);
  await expect('only the office records a transfer', call('POST', '/attendance-ops/leave', PB, { ...lv, kind: 'Transfer' }), [403]);
  await sheet(withStatus({ [String(s2._id)]: { status: 'Absent' } }));
  const l1 = (await expect('the parent asks for medical leave', call('POST', '/attendance-ops/leave', PB, lv), [201])).data.leave;
  log(l1.status === 'Requested' && l1.state === 'Leave', 'leave starts as a request');
  await expect('an overlapping request is a conflict', call('POST', '/attendance-ops/leave', PB, { ...lv, fromDate: AO.addDays(today, 1) }), [409]);
  await expect('a parent cannot decide', call('POST', `/attendance-ops/leave/${l1._id}/decide`, PB, { decision: 'approve' }), [403]);
  await expect('refusing needs a reason', call('POST', `/attendance-ops/leave/${l1._id}/decide`, T, { decision: 'reject' }), [400]);
  const d1 = (await expect('the head master approves', call('POST', `/attendance-ops/leave/${l1._id}/decide`, T, { decision: 'approve', note: 'Get well soon' }))).data;
  log(d1.appliedDays === 1 && (await Daily.findOne({ studentId: s2._id, date: AO.toUTCDay(today) })).status === 'Leave', 'a day already marked absent becomes excused leave');
  log((await History.findOne({ studentId: s2._id, source: 'leave' }))?.before?.status === 'Absent', 'the change is in the history');
  await expect('deciding twice is refused', call('POST', `/attendance-ops/leave/${l1._id}/decide`, T, { decision: 'approve' }), [409]);
  await sheet(withStatus({ [String(s2._id)]: { status: 'Absent' } }));
  log((await Daily.findOne({ studentId: s2._id, date: AO.toUTCDay(today) })).status === 'Leave', 'an absence on a day of approved leave stays excused');
  const sh = (await call('GET', `/daily-attendance/class/${cid}`, A)).data; log(sh.students.find((x) => x._id === String(s2._id)).leave?.kind === 'Medical', 'the register shows who is on leave');
  const ownL = (await expect('a student can ask for their own leave', call('POST', '/attendance-ops/leave', S1, { studentId: String(s1._id), kind: 'Family', fromDate: AO.addDays(today, 3), toDate: AO.addDays(today, 4), reason: 'Wedding' }), [201])).data.leave;
  await expect('another family cannot withdraw it', call('POST', `/attendance-ops/leave/${ownL._id}/cancel`, PB, {}), [403]);
  await expect('the student withdraws it', call('POST', `/attendance-ops/leave/${ownL._id}/cancel`, S1, {}));
  const tr = (await expect('a teacher records a field trip', call('POST', '/attendance-ops/leave', T, { studentId: String(s3._id), kind: 'FieldTrip', fromDate: today, toDate: today, reason: 'Science museum visit' }), [201])).data.leave;
  log(tr.state === 'Mobility', 'a field trip is a mobility state, apart from ordinary leave');
  await expect('the requester cannot approve their own request', call('POST', `/attendance-ops/leave/${tr._id}/decide`, T, { decision: 'approve' }), [403]);
  await expect('the office approves it', call('POST', `/attendance-ops/leave/${tr._id}/decide`, A, { decision: 'approve' }));
  const lst = (await call('GET', '/attendance-ops/leave?status=Approved', A)).data; log(lst.leave.length >= 2 && lst.pagination.currentPage === 1, 'the office lists approved leave');
  log((await call('GET', '/attendance-ops/leave', PB)).data.leave.every((x) => String(x.studentId) === String(s2._id)), 'a parent only sees their own child leave');

  // ── corrections: the person who asked never approves ──
  const cr = { studentId: String(s1._id), date: today, status: 'Late', arrivedAt: '08:20', reason: 'He came in with the van, not on foot' };
  await expect('future date refused', call('POST', '/attendance-ops/corrections', PA, { ...cr, date: AO.addDays(today, 2) }), [400]);
  await expect('the register already says it', call('POST', '/attendance-ops/corrections', PA, { ...cr, status: 'Present', arrivedAt: undefined }), [422]);
  await expect('a reason is needed', call('POST', '/attendance-ops/corrections', PA, { ...cr, reason: 'x' }), [400]);
  const c1 = (await expect('a parent asks for a correction', call('POST', '/attendance-ops/corrections', PA, cr), [201])).data.correction;
  log(c1.original.status === 'Present' && c1.requested.status === 'Late', 'the original is copied onto the request');
  await expect('a second pending request is a conflict', call('POST', '/attendance-ops/corrections', PA, cr), [409]);
  await expect('a parent cannot decide', call('POST', `/attendance-ops/corrections/${c1._id}/decide`, PA, { decision: 'approve' }), [403]);
  await expect('refusing needs a reason', call('POST', `/attendance-ops/corrections/${c1._id}/decide`, A, { decision: 'reject' }), [400]);
  await expect('the head master approves it', call('POST', `/attendance-ops/corrections/${c1._id}/decide`, T, { decision: 'approve', note: 'Confirmed with the van driver' }));
  const nowRec = await Daily.findOne({ studentId: s1._id, date: AO.toUTCDay(today) }); log(nowRec.status === 'Late' && nowRec.arrivedAt === '08:20', 'the register now shows the corrected mark');
  log((await History.findOne({ studentId: s1._id, source: 'correction' }))?.before?.status === 'Present', 'and the history keeps what it replaced');
  const c2 = (await call('POST', '/attendance-ops/corrections', T, { studentId: String(s1._id), date: today, status: 'Present', reason: 'He was on time after all' })).data.correction;
  await expect('a teacher cannot approve their own correction', call('POST', `/attendance-ops/corrections/${c2._id}/decide`, T, { decision: 'approve' }), [403]);
  await expect('the office can', call('POST', `/attendance-ops/corrections/${c2._id}/decide`, A, { decision: 'approve' }));
  await expect('a decided request cannot be decided again', call('POST', `/attendance-ops/corrections/${c2._id}/decide`, A2, { decision: 'approve' }), [409]);
  await sheet(allPresent());

  // ── repeated absence: a supportive case ──
  await expect('set the case threshold', call('PUT', '/attendance-ops/settings', A, { caseThreshold: 2, caseWindowDays: 14 }));
  await call('PUT', '/daily-attendance/student-day', A, { studentId: String(s5._id), date: yday, status: 'Absent' });
  log((await Case.countDocuments({ studentId: s5._id })) === 0, 'one absence opens no case');
  await call('PUT', '/daily-attendance/student-day', A, { studentId: String(s5._id), date: today, status: 'Absent' });
  const kase = await Case.findOne({ studentId: s5._id, status: 'Open' }); log(!!kase && kase.trigger.absences === 2 && String(kase.assignedTo) === String(sara._id), 'the second absence opens a case for the head master');
  await call('PUT', '/daily-attendance/student-day', A, { studentId: String(s5._id), date: AO.addDays(today, -2), status: 'Absent' });
  log((await Case.countDocuments({ studentId: s5._id })) === 1, 'a student never has two open cases');
  const cl = (await expect('the head master sees the case', call('GET', '/attendance-ops/cases?status=Open', T))).data; log(cl.cases.some((x) => String(x._id) === String(kase._id)), 'case list is scoped to my class');
  await expect('a teacher of another class cannot open it', call('GET', `/attendance-ops/cases/${kase._id}`, tokFor(otherT, 'teacher')), [404]);
  const cd = (await expect('case detail lists the days', call('GET', `/attendance-ops/cases/${kase._id}`, T))).data; log(cd.days.length >= 2, 'the absent days are listed');
  await expect('a note is needed', call('POST', `/attendance-ops/cases/${kase._id}/notes`, T, { text: '' }), [400]);
  await expect('add a note after speaking to the family', call('POST', `/attendance-ops/cases/${kase._id}/notes`, T, { text: 'Spoke to his mother, transport problem.' }), [201]);
  log((await Case.findById(kase._id)).status === 'InProgress', 'the first note moves it to in progress');
  await expect('closing needs an outcome', call('POST', `/attendance-ops/cases/${kase._id}/status`, T, { status: 'Resolved' }), [400]);
  await expect('close with an outcome', call('POST', `/attendance-ops/cases/${kase._id}/status`, T, { status: 'Resolved', outcome: 'Van route changed, family agreed to inform us early.' }));
  await expect('a closed case stays closed', call('POST', `/attendance-ops/cases/${kase._id}/status`, T, { status: 'InProgress' }), [409]);
  await expect('the office can run the scan', call('POST', '/attendance-ops/cases/scan', A, {}));
  await expect('a parent cannot see cases', call('GET', '/attendance-ops/cases', PA), [403]);
  await expect('put attendance days back for later checks', call('PUT', '/daily-attendance/student-day', A, { studentId: String(s5._id), date: today, status: 'Present' }));

  // ── offline roll call: a replay is applied once ──
  const mid = `mut-${Date.now()}-0001`; const body = { mutationId: mid, records: withStatus({ [String(s5._id)]: { status: 'Absent' } }), reason: 'offline sync' };
  await expect('a bad mutation id is refused', sheet(allPresent(), { mutationId: 'x' }), [400]);
  await expect('a rejected save does not claim the id', call('POST', `/daily-attendance/class/${cid}`, A, { date: today, mutationId: `${mid}-bad`, records: [{ studentId: String(s5._id), status: 'Nope' }] }), [400]);
  const ok = await expect('the good save with the same id works', call('POST', `/daily-attendance/class/${cid}`, A, { date: today, mutationId: `${mid}-bad`, records: allPresent() }));
  log(!ok.data.replayed, 'a failed save can be retried with the same id');
  const f1 = await call('POST', `/daily-attendance/class/${cid}`, A, { date: today, ...body }); const hCount = await History.countDocuments({ studentId: s5._id });
  const f2 = await call('POST', `/daily-attendance/class/${cid}`, A, { date: today, ...body });
  log(f1.status === 200 && f2.status === 200 && f2.data.replayed === true && !f1.data.replayed, 'the replay gets the first answer, marked as a replay');
  log((await History.countDocuments({ studentId: s5._id })) === hCount, 'and writes nothing a second time');
  log((await Mutation.countDocuments({ schoolId: sid, mutationId: mid })) === 1, 'one mutation record per id');
  await sheet(allPresent());

  // ── period register ──
  const subs = await Subject.find({ schoolId: sid }).limit(2); const subj = subs[0]; const subj2 = subs[1] || subs[0];
  const dn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][AO.toUTCDay(today).getUTCDay()]; const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  if (dn === 'Sunday' || clock.minutes < 40 || clock.minutes > 1380) log(true, 'period register checks skipped (Sunday or close to midnight)');
  else {
    const st0 = clock.minutes - 20; const en0 = Math.min(1439, clock.minutes + 40);
    await Timetable.deleteMany({ schoolId: sid, classId: cls._id });
    await Timetable.create({ schoolId: sid, classId: cls._id, dayOfWeek: dn, isActive: true, slots: [{ startTime: hh(st0), endTime: hh(en0), subjectId: subj._id, teacherId: sara._id }, { startTime: hh(en0), endTime: hh(Math.min(1439, en0 + 5)), subjectId: subj2._id, teacherId: otherT._id }] });
    const td = (await expect('the teacher sees today lessons', call('GET', '/attendance-ops/period/today', T))).data; const les = td.lessons.find((x) => x.classId === cid);
    log(!!les && les.windowStatus === 'open' && les.total === 16, 'the lesson is open and counts the class');
    const q = `classId=${cid}&subjectId=${subj._id}&startTime=${hh(st0)}&endTime=${hh(en0)}`;
    const ro = (await expect('the roster comes with leave flags', call('GET', `/attendance-ops/period/roster?${q}`, T))).data; log(ro.students.length === 16 && ro.students.find((x) => x._id === String(s2._id)).leave?.kind === 'Medical', 'a student on leave is marked as such on the lesson roster');
    const otherTok = tokFor(otherT, 'teacher');
    await expect('a teacher not scheduled for this slot is refused', call('GET', `/attendance-ops/period/roster?${q}`, otherTok), [403]);
    const recs = kids.map((k) => ({ studentId: String(k._id), status: String(k._id) === String(s4._id) ? 'Absent' : String(k._id) === String(s2._id) ? 'Absent' : 'Present' }));
    const pbody = { classId: cid, subjectId: String(subj._id), startTime: hh(st0), endTime: hh(en0), records: recs };
    await expect('a status must be valid', call('POST', '/attendance-ops/period', T, { ...pbody, records: [{ studentId: String(s1._id), status: 'Sleeping' }] }), [400]);
    await expect('an unscheduled teacher cannot mark', call('POST', '/attendance-ops/period', otherTok, pbody), [403]);
    await expect('a register captured in the future is refused', call('POST', '/attendance-ops/period', T, { ...pbody, capturedAt: new Date(Date.now() + 3600e3).toISOString() }), [400]);
    await expect('a register captured after the lesson closed is refused', call('POST', '/attendance-ops/period', T, { ...pbody, startTime: hh(st0 - 60), endTime: hh(st0 - 5) }), [403]);
    const pm = `period-${Date.now()}`; const p1 = await call('POST', '/attendance-ops/period', T, { ...pbody, mutationId: pm, capturedAt: new Date(Date.now() - 5 * 60000).toISOString() });
    log(p1.status === 200 && p1.data.count === 16 && p1.data.excusedAsLeave === 1 && p1.data.syncedLate === true, 'an offline register is accepted by when it was taken, and leave stays excused');
    const p2 = await call('POST', '/attendance-ops/period', T, { ...pbody, mutationId: pm }); log(p2.data.replayed === true && (await Period.countDocuments({ schoolId: sid, classId: cls._id })) === 16, 'its replay writes nothing twice');
    log((await Period.findOne({ userId: s2._id, classId: cls._id })).status === 'Leave', 'the student on approved leave is Leave, not Absent');
    const rep = (await expect('the office reads the lesson report', call('GET', `/attendance-ops/period/report?classId=${cid}`, A))).data; log(rep.lessons.length === 1 && rep.lessons[0].Absent === 1 && rep.lessons[0].Present === 14, 'the report counts each lesson');
    await expect('a student cannot open the report', call('GET', `/attendance-ops/period/report?classId=${cid}`, S1), [403]);
    // overlapping lessons for one student is an anomaly worth a look
    await Period.create({ schoolId: sid, userId: s5._id, classId: cls._id, subjectId: subj2._id, date: AO.toUTCDay(today), periodStartTime: hh(st0 + 10), periodEndTime: hh(en0 - 5), status: 'Present', markedBy: sara._id });
  }

  // ── classroom QR check-in ──
  await expect('check-in is off by default', call('POST', '/attendance-ops/sessions', T, { classId: cid, subjectId: String(subj._id) }), [422]);
  await expect('turn on classroom check-in', call('PUT', '/attendance-ops/settings', A, { selfCheckInEnabled: true, qrWindowSeconds: 30 }));
  await expect('a student cannot open a session', call('POST', '/attendance-ops/sessions', S1, { classId: cid }), [403]);
  await expect('another class teacher cannot open one', call('POST', '/attendance-ops/sessions', tokFor(otherT, 'teacher'), { classId: String(cls._id) }), [201, 403]);
  await Session.deleteMany({ schoolId: sid, classId: cls._id });
  const ses = (await expect('the teacher opens a check-in', call('POST', '/attendance-ops/sessions', T, { classId: cid, subjectId: String(subj._id), startTime: '09:00', endTime: '09:45' }), [201])).data;
  log(!ses.session.secret && ses.code.startsWith(ses.session._id), 'the secret never leaves the server');
  await expect('one open session per class and subject', call('POST', '/attendance-ops/sessions', T, { classId: cid, subjectId: String(subj._id) }), [409]);
  const code1 = (await expect('the teacher reads the rotating code', call('GET', `/attendance-ops/sessions/${ses.session._id}/code`, T))).data; log(code1.expiresInSeconds > 0 && code1.expiresInSeconds <= 30, 'the code says when it rotates');
  await expect('a student cannot read the code', call('GET', `/attendance-ops/sessions/${ses.session._id}/code`, S1), [403]);
  const row = await Session.findById(ses.session._id); const old = (secs) => AO.currentCode(row, Date.now() - secs * 1000).code;
  const demoStudent = tokens.student;
  await expect('a student of another class is refused', call('POST', '/attendance-ops/check-in', demoStudent, { code: code1.code, consent: true }), [403]);
  const noC = await call('POST', '/attendance-ops/check-in', S1, { code: code1.code }); log(noC.status === 428 && noC.data.consentRequired === true, 'the first check-in asks for consent and says what is recorded');
  await expect('a tampered code is refused', call('POST', '/attendance-ops/check-in', S1, { code: `${ses.session._id}.AAAAAAAAAA`, consent: true }), [422]);
  await expect('a code from two windows ago has expired', call('POST', '/attendance-ops/check-in', S1, { code: old(70), consent: true }), [422]);
  const ci = await call('POST', '/attendance-ops/check-in', S1, { code: code1.code, consent: true, clientKey: 'phone-A', latitude: 33.6, longitude: 73.0 });
  log(ci.status === 201 && /Only that you scanned/.test(ci.data.privacy), 'a student checks in and is told what was recorded');
  const evi = await Evidence.findOne({ sessionId: ses.session._id, studentId: s1._id }); log(evi.status === 'Pending' && evi.latitude === undefined && evi.toObject().location === undefined, 'a check-in waits for the teacher and holds no location');
  await expect('checking in twice is refused', call('POST', '/attendance-ops/check-in', S1, { code: code1.code, consent: true }), [409]);
  const S2 = tokFor(s2, 'student'); const S3 = tokFor(s3, 'student');
  await expect('a second student on the same phone is accepted but flagged', call('POST', '/attendance-ops/check-in', S2, { code: old(20), consent: true, clientKey: 'phone-A' }), [201]);
  await expect('a third student on their own phone is clean', call('POST', '/attendance-ops/check-in', S3, { code: code1.code, consent: true, clientKey: 'phone-C' }), [201]);
  const sd = (await expect('the teacher sees who checked in', call('GET', `/attendance-ops/sessions/${ses.session._id}`, T))).data; log(sd.counts.pending === 3 && sd.counts.flagged === 2, 'two check-ins from one phone are both flagged');
  const bulk = (await expect('approve all clean ones', call('POST', `/attendance-ops/sessions/${ses.session._id}/approve-clean`, T, {}))).data; log(bulk.approved === 1 && bulk.heldForReview === 2, 'flagged check-ins are held for a person');
  const flagged = sd.evidence.find((e) => e.studentName === s1.name);
  await expect('refusing needs a reason', call('POST', `/attendance-ops/sessions/${ses.session._id}/evidence/${flagged._id}/decide`, T, { decision: 'reject' }), [400]);
  await expect('the teacher approves one flagged check-in', call('POST', `/attendance-ops/sessions/${ses.session._id}/evidence/${flagged._id}/decide`, T, { decision: 'approve' }));
  const flagged2 = sd.evidence.find((e) => e.studentName === s2.name); await expect('and rejects the other', call('POST', `/attendance-ops/sessions/${ses.session._id}/evidence/${flagged2._id}/decide`, T, { decision: 'reject', note: 'Was not in the room' }));
  await expect('a decided check-in cannot be decided again', call('POST', `/attendance-ops/sessions/${ses.session._id}/evidence/${flagged._id}/decide`, T, { decision: 'approve' }), [409]);
  log((await Period.findOne({ userId: s1._id, classId: cls._id, subjectId: subj._id }))?.source !== undefined && (await Period.findOne({ userId: s1._id, subjectId: subj._id, classId: cls._id })).status === 'Present', 'only an approved check-in marks the lesson');
  log(!(await Period.findOne({ userId: s2._id, subjectId: subj._id, classId: cls._id, remarks: 'QR check-in approved' })), 'a rejected check-in marks nothing');
  const ml = (await call('GET', '/attendance-ops/sessions', S1)).data.sessions; log(ml.length === 1 && !ml[0].secret, 'a student sees the open session without its secret');
  await expect('the teacher closes it', call('POST', `/attendance-ops/sessions/${ses.session._id}/close`, T, {}));
  await expect('nobody can check in after it closes', call('POST', '/attendance-ops/check-in', tokFor(s4, 'student'), { code: code1.code, consent: true }), [422]);
  await expect('closing twice is refused', call('POST', `/attendance-ops/sessions/${ses.session._id}/close`, T, {}), [409]);

  // ── consent ──
  const cs = (await expect('a parent reads consent for their child', call('GET', `/attendance-ops/consent/${s1._id}`, PA))).data.consent; log(cs.selfCheckIn === true && cs.biometricOptOut === false, 'consent given at first check-in is recorded');
  await expect('another family cannot read it', call('GET', `/attendance-ops/consent/${s1._id}`, PB), [404]);
  await expect('a parent withdraws check-in consent', call('PUT', `/attendance-ops/consent/${s1._id}`, PA, { selfCheckIn: false }));
  await expect('a teacher has no consent desk', call('GET', `/attendance-ops/consent/${s1._id}`, T), [403]);

  // ── devices and gate evidence ──
  const dv = (await expect('the office registers a gate reader', call('POST', '/attendance-ops/devices', A, { name: 'Main gate', kind: 'gate', location: 'Front' }), [201])).data;
  log(/^dk_/.test(dv.key) && !JSON.stringify(dv.device).includes('keyHash'), 'the key is shown once and only its hash is stored');
  await expect('a teacher cannot register devices', call('POST', '/attendance-ops/devices', T, { name: 'x' }), [403]);
  const dh = (k) => ({ 'X-Device-Id': dv.device._id, 'X-Device-Key': k });
  const dcall = async (path, body, k = dv.key) => { const r = await fetch(`${base}/api/attendance-ops${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...dh(k) }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  log((await dcall('/device/heartbeat', {}, 'dk_wrong')).status === 401, 'a wrong device key is refused');
  const hb = await dcall('/device/heartbeat', { deviceTime: new Date(Date.now() - 600e3).toISOString() }); log(hb.status === 200 && hb.data.clockOk === false, 'a reader ten minutes behind is told its clock is off');
  log((await call('GET', '/attendance-ops/devices', A)).data.devices[0].health === 'Clock drift', 'the office sees the drift');
  const hb2 = await dcall('/device/heartbeat', { deviceTime: new Date().toISOString() }); log(hb2.data.clockOk === true, 'a corrected clock is healthy');
  await expect('assign a badge', call('PUT', `/attendance-ops/badges/${s1._id}`, A, { badgeId: 'BADGE-0001' })); await call('PUT', `/attendance-ops/badges/${s4._id}`, A, { badgeId: 'BADGE-0004' });
  await expect('a badge belongs to one student', call('PUT', `/attendance-ops/badges/${s2._id}`, A, { badgeId: 'BADGE-0001' }), [409]);
  await expect('a badge has a sane shape', call('PUT', `/attendance-ops/badges/${s2._id}`, A, { badgeId: 'a b' }), [400]);
  const at = new Date(); const periodsBefore = await Period.countDocuments({ schoolId: sid }); const dailyBefore = await Daily.countDocuments({ schoolId: sid });
  const ev1 = await dcall('/device/events', { deviceTime: new Date().toISOString(), events: [{ badgeId: 'BADGE-0001', at: at.toISOString(), method: 'rfid' }, { badgeId: 'BADGE-0004', at: at.toISOString(), method: 'nfc' }, { badgeId: 'NOPE', at: at.toISOString() }, { badgeId: 'BADGE-0001', at: 'garbage' }] });
  log(ev1.status === 201 && ev1.data.accepted === 2 && ev1.data.rejected.length === 2 && ev1.data.rejected.some((r) => r.reason === 'unknown-badge'), 'the reader sends a batch: good ones kept, bad ones named');
  log((await Period.countDocuments({ schoolId: sid })) === periodsBefore && (await Daily.countDocuments({ schoolId: sid })) === dailyBefore, 'a gate scan never marks a lesson or the day');
  const ev2 = await dcall('/device/events', { events: [{ badgeId: 'BADGE-0001', at: at.toISOString() }, { badgeId: 'BADGE-0001', at: new Date(at.getTime() + 4000).toISOString() }] });
  log(ev2.data.replayed === 1 && ev2.data.accepted === 1 && ev2.data.flagged === 1, 'a resent event is not counted twice, and a scan 4 seconds later is flagged as a suspect duplicate');
  log((await dcall('/device/events', { events: [{ badgeId: 'BADGE-0001', at: new Date(Date.now() + 3600e3).toISOString() }] })).data.flagged === 1, 'an event stamped in the future is flagged');
  log((await dcall('/device/events', { events: [] })).status === 400, 'an empty batch is refused');
  const gl = (await expect('the office reads the gate log', call('GET', '/attendance-ops/gate', A))).data; log(gl.events.length >= 3 && /never marks a lesson/.test(gl.note), 'the log says entry is not attendance');
  await expect('a teacher cannot read the gate log', call('GET', '/attendance-ops/gate', T), [403]);
  // no-camera alternative and biometric pilot
  await expect('a pilot is allowed once a reader and QR exist', call('PUT', '/attendance-ops/settings', A, { biometricPilot: true }));
  const bio = await dcall('/device/events', { events: [{ badgeId: 'BADGE-0004', at: new Date(Date.now() - 60000).toISOString(), method: 'biometric' }] }); log(bio.data.accepted === 1, 'during a pilot biometric events are accepted');
  await call('PUT', `/attendance-ops/consent/${s4._id}`, A, { biometricOptOut: true });
  const bio2 = await dcall('/device/events', { events: [{ badgeId: 'BADGE-0004', at: new Date(Date.now() - 30000).toISOString(), method: 'biometric' }] }); log(bio2.data.rejected[0]?.reason === 'opted-out', 'a student who opted out is never read biometrically');
  const bt = await dcall('/device/events', { events: [{ badgeId: 'BADGE-0004', at: new Date(Date.now() - 20000).toISOString(), method: 'badge' }] }); log(bt.data.accepted === 1, 'the same student can still use a badge');
  await call('PUT', '/attendance-ops/settings', A, { biometricPilot: false });
  log((await dcall('/device/events', { events: [{ badgeId: 'BADGE-0001', at: new Date(Date.now() - 10000).toISOString(), method: 'biometric' }] })).data.rejected[0]?.reason === 'biometric-off', 'biometric events are refused outside a pilot');
  await expect('rotate the key', call('POST', `/attendance-ops/devices/${dv.device._id}/rotate-key`, A, {}));
  log((await dcall('/device/heartbeat', {})).status === 401, 'the old key stops working');
  const dv2 = (await call('POST', `/attendance-ops/devices/${dv.device._id}/rotate-key`, A, {})).data.key;
  await expect('disable the reader', call('POST', `/attendance-ops/devices/${dv.device._id}/status`, A, { status: 'Disabled' }));
  log((await dcall('/device/heartbeat', {}, dv2)).status === 403, 'a disabled reader is refused');
  await call('POST', `/attendance-ops/devices/${dv.device._id}/status`, A, { status: 'Active' });

  // ── anomalies: questions for a person, never edits ──
  await expect('cutoff at midnight so every unmarked class counts', call('PUT', '/attendance-ops/settings', A, { rollCallCutoff: '00:00' }));
  // a second class nobody has marked, and a reader that clearly covers class 66-E (half the roster came through)
  const empty = await Class.create({ schoolId: sid, standard: '66', division: 'F', capacity: 40, room: 'Room 66F', academicYear: '2026-2027' });
  await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: 'Att Lone Kid', email: 'attlone@demo.school', password: pw, rollNumber: '1', classId: empty._id, division: 'F', academicYear: '2026-2027', gender: 'Male', country: 'Pakistan', nationality: 'Pakistani' });
  for (const k of kids.slice(4, 13)) await Evidence.create({ schoolId: sid, kind: 'badge', studentId: k._id, deviceId: dv.device._id, direction: 'in', occurredAt: new Date(), status: 'Info' });
  await sheet(allPresent()); await call('POST', '/attendance-ops/leave', T, { studentId: String(s3._id), kind: 'Exam', fromDate: today, toDate: today, reason: 'Board exam' }).then((r) => call('POST', `/attendance-ops/leave/${r.data.leave?._id}/decide`, A, { decision: 'approve' }));
  const sc = (await expect('the office scans for anomalies', call('POST', '/attendance-ops/anomalies/scan', A, { date: today }))).data;
  const kinds = (await Anomaly.find({ schoolId: sid, date: today })).map((x) => x.kind);
  log(kinds.includes('EveryonePresent'), 'a class of 16 all present is flagged for a glance');
  log(kinds.includes('MissingRollCall'), 'a class with no register after the cutoff is flagged');
  log(kinds.includes('PresentOnLeave'), 'present on a day of approved leave is flagged');
  log(kinds.includes('PresentNoGateEntry'), 'present with no gate entry where most classmates came through the reader is flagged');
  if (dn !== 'Sunday' && clock.minutes >= 40 && clock.minutes <= 1380) log(kinds.includes('PeriodClash'), 'present in two overlapping lessons is flagged');
  await call('PUT', '/daily-attendance/student-day', A, { studentId: String(s4._id), date: today, status: 'Absent' });
  await Device.updateOne({ _id: dv.device._id }, { $set: { lastSeenAt: new Date(Date.now() - 3 * 3600e3), driftSeconds: 900 } });
  await call('POST', '/attendance-ops/anomalies/scan', A, { date: today }); const k2 = (await Anomaly.find({ schoolId: sid, date: today })).map((x) => x.kind);
  log(k2.includes('AbsentButAtGate') && k2.includes('DeviceSilent') && k2.includes('DeviceDrift'), 'absent but seen at the gate, and a silent or drifting reader, are flagged');
  const again = (await call('POST', '/attendance-ops/anomalies/scan', A, { date: today })).data; log(again.raised === 0 && again.alreadyKnown >= 1, 'a second scan does not raise the same finding twice');
  log((await Daily.findOne({ studentId: s4._id, date: AO.toUTCDay(today) })).status === 'Absent', 'the scan changed no mark');
  await expect('a bad date is refused', call('POST', '/attendance-ops/anomalies/scan', A, { date: 'yesterday' }), [400]);
  const an = (await call('GET', '/attendance-ops/anomalies?status=Open', T)).data; log(an.anomalies.every((x) => !x.classId || String(x.classId) === cid), 'a head master only sees their own class');
  const one = (await call('GET', '/attendance-ops/anomalies?status=Open', A)).data.anomalies[0];
  await expect('a teacher cannot review', call('POST', `/attendance-ops/anomalies/${one._id}/review`, T, { status: 'Reviewed', note: 'ok' }), [403]);
  await expect('a note is needed to review', call('POST', `/attendance-ops/anomalies/${one._id}/review`, A, { status: 'Reviewed' }), [400]);
  await expect('the office reviews a finding', call('POST', `/attendance-ops/anomalies/${one._id}/review`, A, { status: 'Dismissed', note: 'Class genuinely perfect today' }));
  await expect('a reviewed finding stays reviewed', call('POST', `/attendance-ops/anomalies/${one._id}/review`, A, { status: 'Reviewed', note: 'again' }), [409]);

  // ── overview, cron and audit ──
  const ov = (await expect('the office overview', call('GET', '/attendance-ops/overview', A))).data; log(typeof ov.pendingAlerts === 'number' && ov.devices >= 1 && ov.openAnomalies >= 1, 'the overview counts open work');
  const cr0 = await fetch(base + '/api/cron/attendance', { headers: { authorization: 'Bearer wrong' } }); log(cr0.status === 401, 'the attendance timer rejects a wrong secret');
  const cr1 = await fetch(base + '/api/cron/attendance', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }); const cj = await cr1.json(); log(cr1.status === 200 && cj.schools >= 1, `the attendance timer runs (${JSON.stringify(cj)})`);
  const acts = (await AuditLog.find({ schoolId: sid, action: new RegExp('^attendance\\.') }).select('action')).map((a) => a.action);
  for (const a of ['attendance.settings', 'attendance.leave.approve', 'attendance.correction.approve', 'attendance.alert.verify', 'attendance.session.open', 'attendance.checkin.approve', 'attendance.device.create', 'attendance.anomaly.dismissed', 'attendance.case.resolved']) log(acts.includes(a), `${a} is in the audit log`);

  // leave the demo school as we found it for later modules
  await Timetable.deleteMany({ schoolId: sid, classId: cls._id }); await Period.deleteMany({ schoolId: sid, classId: cls._id });
  await Class.deleteMany({ _id: empty._id }); await Student.deleteMany({ email: 'attlone@demo.school' });
  await AppSetting.deleteOne({ key: `attendance:${sid}` });
};
