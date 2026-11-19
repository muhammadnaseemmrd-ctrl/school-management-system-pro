// Teacher Today and offline sync (E11): queued writes land once, clashes go to an inbox, nothing is silently overwritten.
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class'); const Student = require('../models/Student'); const Subject = require('../models/Subject'); const Exam = require('../models/Exam'); const Marks = require('../models/Marks');
  const DailyAttendance = require('../models/DailyAttendance'); const Draft = require('../models/TeacherDraft'); const Conflict = require('../models/SyncConflict'); const Mutation = require('../models/SyncMutation'); const Rev = require('../models/SyncRevision'); const Homework = require('../models/Homework'); const Notification = require('../models/Notification'); const AuditLog = require('../models/AuditLog');
  const { hashPassword } = require('../utils/password'); const { generateAccessToken } = require('../utils/jwt'); const H = require('../utils/hr');
  console.log('\n— Teacher Today and offline sync —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id); const A = tokens.admin; const T = tokens.teacher; const S = tokens.student;
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' }); const ot = (await Teacher.find({ schoolId: sid, _id: { $ne: sara._id } }))[0]; const OT = generateAccessToken(String(ot._id), sid, 'teacher');
  const backupAssign = JSON.parse(JSON.stringify(sara.subjectClassAssignments || []));
  await Class.deleteMany({ schoolId: sid, standard: '89' }); await Subject.deleteMany({ schoolId: sid, code: 'E11M' }); await Draft.deleteMany({ schoolId: sid }); await Conflict.deleteMany({ schoolId: sid }); await Mutation.deleteMany({ schoolId: sid }); await Rev.deleteMany({ schoolId: sid });
  const cls = await Class.create({ schoolId: sid, standard: '89', division: 'A', capacity: 30, academicYear: '2026-2027', classTeacherId: sara._id }); const subj = await Subject.create({ schoolId: sid, name: 'E11 Maths', code: 'E11M', standard: '89' });
  const pw = await hashPassword('Student@123'); const kids = [];
  for (let i = 1; i <= 4; i++) kids.push(await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `Sync Kid ${i}`, email: `synckid${i}@demo.school`, password: pw, rollNumber: `SY${i}`, classId: cls._id, standard: '89', division: 'A', isActive: true }));
  await Teacher.updateOne({ _id: sara._id }, { $set: { subjectClassAssignments: [...backupAssign, { classId: cls._id, subjectId: subj._id }] } });
  const exam = await Exam.create({ schoolId: sid, name: 'E11 Test', classId: cls._id, subjectId: subj._id, date: new Date(), totalMarks: 100, passingMarks: 35 });
  const today = H.todayStr(); const id = (p) => `${p}-${Math.random().toString(36).slice(2, 12)}`; const push = (tok, list, extra = {}) => call('POST', '/sync/push', tok, { mutations: list, deviceId: 'phone-1', ...extra });

  // ── access and validation ──
  await expect('push needs a sign-in', call('POST', '/sync/push', null, { mutations: [] }), [401]);
  await expect('a student cannot push', call('POST', '/sync/push', S, { mutations: [{}] }), [403]);
  await expect('an empty push is refused', push(T, []), [400]);
  await expect('too many at once is refused', push(T, Array.from({ length: 51 }, () => ({}))), [400]);
  const bad = (await expect('a bad id and an unknown kind are rejected per item', push(T, [{ mutationId: 'x', kind: 'draft' }, { mutationId: id('unk'), kind: 'nope' }]))).data.results;
  log(bad[0].status === 'Rejected' && bad[1].status === 'Rejected', 'both bad items are Rejected, nothing thrown');

  // ── drafts: made offline, applied once, edited on two devices ──
  const dId = id('drf'); const d1 = { mutationId: id('m'), kind: 'draft', entityKey: `draft:${dId}`, baseRevision: 0, capturedAt: new Date().toISOString(), payload: { kind: 'lessonNote', title: 'Fractions', body: 'Start with pizza', classId: String(cls._id), date: today } };
  const r1 = (await expect('a draft made offline is applied', push(T, [d1]))).data.results[0]; log(r1.status === 'Applied' && r1.revision === 1, 'revision 1');
  const rep = (await expect('the same queued draft sent again', push(T, [d1]))).data.results[0]; log(rep.duplicate === true && rep.status === 'Applied', 'the replay is answered as a duplicate, not applied again');
  log((await Draft.countDocuments({ schoolId: sid, teacherId: sara._id, localId: dId })) === 1, 'exactly one draft exists');
  const par = await Promise.all([1, 2, 3, 4].map(() => push(T, [{ ...d1, mutationId: 'parallel-same-id-0001', entityKey: `draft:${id('par')}` }])));
  log((await Mutation.countDocuments({ schoolId: sid, mutationId: 'parallel-same-id-0001' })) === 1 && par.every((x) => x.status === 200), 'four parallel sends of one id are claimed once');
  log((await Draft.countDocuments({ schoolId: sid, teacherId: sara._id })) === 2, 'parallel sends created one extra draft, not four');
  const e2 = (await push(T, [{ mutationId: id('m'), kind: 'draft', entityKey: `draft:${dId}`, baseRevision: 1, payload: { ...d1.payload, body: 'Start with pizza, then chocolate' } }])).data.results[0]; log(e2.status === 'Applied' && e2.revision === 2, 'a normal edit makes revision 2');
  const stale = (await expect('an edit made on another device from revision 1', push(T, [{ mutationId: id('m'), kind: 'draft', entityKey: `draft:${dId}`, baseRevision: 1, deviceId: 'tablet-1', payload: { ...d1.payload, body: 'Different plan' } }]))).data.results[0];
  log(stale.status === 'Conflicted' && stale.conflictIds.length === 1, 'it is a conflict, not a silent overwrite');
  log((await Draft.findOne({ schoolId: sid, teacherId: sara._id, localId: dId })).body === 'Start with pizza, then chocolate', 'the saved draft is untouched');
  const cl = (await expect('the teacher sees the conflict', call('GET', '/sync/conflicts', T))).data.conflicts; const c1 = cl.find((c) => c.kind === 'draft'); log(c1 && c1.mine.body === 'Different plan' && c1.server.body.includes('chocolate'), 'both versions are shown');
  await expect('another teacher cannot see or settle it', call('POST', `/sync/conflicts/${c1._id}/resolve`, OT, { resolution: 'mine' }), [404]);
  log(!(await call('GET', '/sync/conflicts', OT)).data.conflicts.some((c) => c._id === c1._id), 'another teacher does not list it');
  await expect('a resolution must be chosen', call('POST', `/sync/conflicts/${c1._id}/resolve`, T, { resolution: 'both' }), [400]);
  await expect('merge the two drafts', call('POST', `/sync/conflicts/${c1._id}/resolve`, T, { resolution: 'merged', value: { title: 'Fractions', body: 'Pizza first, then the other plan' } }));
  const dm = await Draft.findOne({ schoolId: sid, teacherId: sara._id, localId: dId }); log(dm.body === 'Pizza first, then the other plan' && dm.revision === 3, 'the merged text is saved as revision 3');
  await expect('settling it twice is refused', call('POST', `/sync/conflicts/${c1._id}/resolve`, T, { resolution: 'mine' }), [409]);
  const pull = (await expect('a second device pulls the drafts', call('GET', `/sync/pull?since=${new Date(Date.now() - 3600000).toISOString()}`, T))).data; log(pull.drafts.some((d) => d.localId === dId && d.revision === 3), 'the pull has the latest revision');
  await expect('a lesson note cannot be published', call('POST', `/sync/drafts/${dId}/publish`, T, {}), [422]);
  const hId = id('hw'); await push(T, [{ mutationId: id('m'), kind: 'draft', entityKey: `draft:${hId}`, payload: { kind: 'homework', title: 'Fractions sheet', body: 'Page 12', classId: String(cls._id) } }]);
  await expect('homework without a subject and due date is not published', call('POST', `/sync/drafts/${hId}/publish`, T, {}), [422]);
  await push(T, [{ mutationId: id('m'), kind: 'draft', entityKey: `draft:${hId}`, baseRevision: 1, payload: { kind: 'homework', title: 'Fractions sheet', body: 'Page 12', classId: String(cls._id), subjectId: String(subj._id), dueDate: H.addDays(today, 2) } }]);
  await expect('a complete homework draft is published', call('POST', `/sync/drafts/${hId}/publish`, T, {}));
  log((await Homework.countDocuments({ schoolId: sid, title: 'Fractions sheet' })) === 1, 'one homework exists');
  await expect('publishing twice is refused', call('POST', `/sync/drafts/${hId}/publish`, T, {}), [409]);
  const late = (await push(T, [{ mutationId: id('m'), kind: 'draft', entityKey: `draft:${hId}`, baseRevision: 2, payload: { kind: 'homework', title: 'Changed', classId: String(cls._id) } }])).data.results[0]; log(late.status === 'Rejected', 'a published draft cannot be changed by a late device');
  const dd = id('drf'); await push(T, [{ mutationId: id('m'), kind: 'draft', entityKey: `draft:${dd}`, payload: { kind: 'reminder', title: 'Bring chalk' } }]);
  await expect('discard a draft', call('POST', `/sync/drafts/${dd}/discard`, T, {})); log((await call('GET', '/sync/drafts', T)).data.drafts.every((d) => d.localId !== dd), 'it leaves the list');

  // ── daily register: three-way compare per student ──
  const recs = (st) => kids.map((k) => ({ studentId: String(k._id), status: st })); const regId = id('reg');
  const reg1 = { mutationId: regId, kind: 'attendance', entityKey: `att:${cls._id}:${today}`, payload: { classId: String(cls._id), date: today, records: recs('Present'), base: {} } };
  const a1 = (await expect('a register taken offline is applied', push(T, [reg1]))).data.results[0]; log(a1.status === 'Applied', 'applied');
  log((await DailyAttendance.countDocuments({ schoolId: sid, classId: cls._id })) === 4, 'four records');
  const a1r = (await push(T, [reg1])).data.results[0]; log(a1r.duplicate === true && (await DailyAttendance.countDocuments({ schoolId: sid, classId: cls._id })) === 4, 'a replay writes nothing new');
  await expect('the office changes one child meanwhile', call('POST', `/daily-attendance/class/${cls._id}`, A, { date: today, records: [{ studentId: String(kids[0]._id), status: 'Absent' }] }));
  const base = Object.fromEntries(kids.map((k) => [String(k._id), 'Present']));
  const stale2 = kids.map((k, i) => ({ studentId: String(k._id), status: i === 0 ? 'Late' : i === 1 ? 'Absent' : 'Present' }));
  const a2 = (await expect('a second device that did not see the change sends its register', push(T, [{ mutationId: id('m'), kind: 'attendance', payload: { classId: String(cls._id), date: today, records: stale2, base } }]))).data.results[0];
  log(a2.status === 'Partial' && a2.conflictIds.length === 1, 'one child clashes, the rest are applied');
  const st = Object.fromEntries((await DailyAttendance.find({ schoolId: sid, classId: cls._id })).map((r) => [String(r.studentId), r.status])); log(st[String(kids[0]._id)] === 'Absent' && st[String(kids[1]._id)] === 'Absent', 'the office mark stays and the other change is applied');
  const ac = (await call('GET', '/sync/conflicts', T)).data.conflicts.find((c) => c.kind === 'attendance'); log(ac && ac.mine.status === 'Late' && ac.server.status === 'Absent', 'the conflict shows Late against Absent');
  await expect('hand it to the school office', call('POST', `/sync/conflicts/${ac._id}/delegate`, T, { to: 'office' }));
  await expect('the owner cannot settle what the office holds', call('POST', `/sync/conflicts/${ac._id}/resolve`, T, { resolution: 'mine' }), [403]);
  await expect('delegating to nobody is refused', call('POST', `/sync/conflicts/${ac._id}/delegate`, OT, { to: 'office' }), [404]);
  log((await Notification.countDocuments({ schoolId: sid, key: `sync-delegate-${ac._id}` })) >= 1, 'the office is told');
  const adminList = (await call('GET', '/sync/conflicts', A)).data.conflicts; log(adminList.some((c) => c._id === ac._id), 'the office sees every conflict');
  await expect('the office keeps the Late', call('POST', `/sync/conflicts/${ac._id}/resolve`, A, { resolution: 'mine', note: 'Parent phoned at 8:10' }));
  log((await DailyAttendance.findOne({ schoolId: sid, classId: cls._id, studentId: kids[0]._id })).status === 'Late', 'the register now says Late');
  log((await Notification.countDocuments({ schoolId: sid, key: `sync-resolved-${ac._id}` })) === 1, 'the teacher is told it was settled');
  const done = (await call('GET', '/sync/conflicts?status=Resolved', A)).data.conflicts.find((c) => c._id === ac._id); log(done && done.resolutionNote === 'Parent phoned at 8:10' && done.resolvedByRole === 'admin', 'the decision, note and who made it are kept');
  const a3 = (await push(T, [{ mutationId: id('m'), kind: 'attendance', payload: { classId: String(cls._id), date: today, records: [{ studentId: String(kids[2]._id), status: 'Absent' }], base: { [String(kids[2]._id)]: 'Present' } } }])).data.results[0]; log(a3.status === 'Applied', 'a change from what the device saw is applied');
  const notHead = (await push(OT, [{ mutationId: id('m'), kind: 'attendance', payload: { classId: String(cls._id), date: today, records: recs('Present'), base: {} } }])).data.results[0]; log(notHead.status === 'Rejected', 'a teacher who is not the head master is rejected');
  const fut = (await push(T, [{ mutationId: id('m'), kind: 'attendance', payload: { classId: String(cls._id), date: H.addDays(today, 3), records: recs('Present'), base: {} } }])).data.results[0]; log(fut.status === 'Rejected', 'a future date is rejected');

  // ── lesson register is checked against the timetable ──
  const pr = (await push(OT, [{ mutationId: id('m'), kind: 'period', payload: { classId: String(cls._id), subjectId: String(subj._id), startTime: '09:00', endTime: '09:45', date: today, records: recs('Present'), base: {} } }])).data.results[0]; console.log('DBG', JSON.stringify(pr)); log(pr.status === 'Rejected' && /scheduled/i.test(pr.message), 'a lesson that is not scheduled is rejected');

  // ── marks ──
  const mk = (marks, base, extra = {}) => ({ mutationId: id('m'), kind: 'marks', payload: { examId: String(exam._id), studentId: String(kids[0]._id), subjectId: String(subj._id), marks, outOfMarks: 100, remarks: '', base, ...extra } });
  const m1 = mk(50, null); const mr1 = (await expect('a mark entered offline', push(T, [m1]))).data.results[0]; log(mr1.status === 'Applied' && mr1.revision === 1, 'applied as revision 1');
  log(pr.status === 'Rejected' && /scheduled/i.test(pr.message), 'a teacher who is not scheduled for the lesson is rejected');
  const pw2 = (await push(T, [{ mutationId: id('m'), kind: 'period', payload: { classId: String(cls._id), subjectId: String(subj._id), startTime: '00:05', endTime: '00:10', date: today, records: recs('Present'), base: {} } }])).data.results[0]; log(pw2.status === 'Rejected', 'a lesson window that has closed is rejected, not silently saved');
  log((await push(T, [mk(101, null)])).data.results[0].status === 'Rejected', 'marks above the total are rejected');
  log((await push(T, [mk(50, null, { studentId: String(ot._id) })])).data.results[0].status === 'Rejected', 'a student who is not in the exam class is rejected');
  const unassigned = (await push(OT, [mk(40, null)])).data.results[0]; log(unassigned.status === 'Rejected' && /assigned/i.test(unassigned.message), 'a teacher who does not teach it is refused by the same rule as a live save');
  await expect('the office corrects the mark', call('POST', '/marks/enter', A, { examId: String(exam._id), studentId: String(kids[0]._id), subjectId: String(subj._id), marks: 70, outOfMarks: 100, passStatus: 'Pass', remarks: 'recheck' }));
  const mc = (await expect('the teacher sends a change based on the old mark', push(T, [mk(55, { marks: 50, remarks: '' })]))).data.results[0]; log(mc.status === 'Conflicted', 'it clashes');
  log((await Marks.findOne({ schoolId: sid, examId: exam._id, studentId: kids[0]._id })).marks === 70, 'the office mark is untouched');
  const mcon = (await call('GET', '/sync/conflicts', T)).data.conflicts.find((c) => c.kind === 'marks'); log(mcon && mcon.mine.marks === 55 && mcon.server.marks === 70, 'both marks are shown');
  await expect('an out of range merge is refused and stays open', call('POST', `/sync/conflicts/${mcon._id}/resolve`, T, { resolution: 'merged', value: { marks: 500 } }), [422]);
  log((await Conflict.findById(mcon._id)).status === 'Open', 'the conflict is still open after a refused resolution');
  await expect('merge to 65', call('POST', `/sync/conflicts/${mcon._id}/resolve`, T, { resolution: 'merged', value: { marks: 65, remarks: 'agreed' } })); const mm = await Marks.findOne({ schoolId: sid, examId: exam._id, studentId: kids[0]._id }); log(mm.marks === 65 && mm.remarks === 'agreed', 'the agreed mark is saved');
  const same = (await push(T, [mk(65, { marks: 50, remarks: '' }, { remarks: 'agreed' })])).data.results[0]; log(same.status === 'Applied', 'sending what is already saved is not a conflict');

  // ── Teacher Today ──
  const td = (await expect('Teacher Today', call('GET', '/teacher-today', T))).data; log(td.date === today && Array.isArray(td.lessons) && td.counts && td.teacher.name, 'has the day, lessons and counts');
  log(td.rolls.some((r) => r.classId === String(cls._id) && r.total === 4 && r.state === 'done'), 'the head-master class shows the roll call as done');
  log(td.marksDue.some((m) => m.examId === String(exam._id) && m.entered === 1 && m.total === 4), 'marks still missing are listed (1 of 4)');
  log(td.drafts.some((d) => d.localId === dId) && td.counts.drafts >= 1, 'open drafts are listed');
  log(td.homeworkSoon.some((h) => h.title === 'Fractions sheet'), 'homework due soon is listed');
  await expect('an admin cannot open Teacher Today', call('GET', '/teacher-today', A), [403]);
  const pack = (await expect('the offline pack', call('GET', '/teacher-today/pack', T))).data; const pc = pack.classes.find((c) => c.classId === String(cls._id));
  log(pc && pc.students.length === 4 && Object.keys(pc.daily).length === 4, 'the pack has the roster and what is already marked');
  log(pack.exams.some((e) => e.examId === String(exam._id) && e.current[String(kids[0]._id)]?.marks === 65), 'the pack has the marks already saved');
  log(new Date(pack.validUntil) > new Date() && pack.drafts.length >= 1, 'the pack has an expiry and the drafts');

  // ── the office view ──
  const ov = (await expect('office overview', call('GET', '/sync/overview', A))).data; log(ov.counts.total >= 10 && ov.integrity > 0 && ov.devices.length >= 1, 'counts, integrity and devices are reported');
  await expect('a teacher cannot open the office overview', call('GET', '/sync/overview', T), [403]);
  const rj = (await call('GET', '/sync/rejections', A)).data.rejections; log(rj.length >= 3 && rj.every((r) => r.message), 'rejections are listed with the reason');
  const hist = (await call('GET', '/sync/mutations', T)).data.mutations; log(hist.length >= 10 && hist.every((m) => m.status !== 'Running'), 'the teacher can review what was sent');
  log((await AuditLog.countDocuments({ schoolId: sid, action: { $in: ['sync.applied', 'sync.partial', 'sync.conflicted', 'sync.conflict.resolve', 'sync.conflict.delegate', 'sync.draft.publish'] } })) >= 8, 'sync actions are audited');

  // ── clean up ──
  await Draft.deleteMany({ schoolId: sid }); await Conflict.deleteMany({ schoolId: sid }); await Mutation.deleteMany({ schoolId: sid }); await Rev.deleteMany({ schoolId: sid }); await Homework.deleteMany({ schoolId: sid, title: 'Fractions sheet' }); await Marks.deleteMany({ schoolId: sid, examId: exam._id }); await Exam.deleteMany({ _id: exam._id });
  await DailyAttendance.deleteMany({ schoolId: sid, classId: cls._id }); await Notification.deleteMany({ schoolId: sid, key: { $regex: '^sync-' } }); await Student.deleteMany({ schoolId: sid, standard: '89' }); await Class.deleteMany({ schoolId: sid, standard: '89' }); await Subject.deleteMany({ schoolId: sid, code: 'E11M' });
  await Teacher.updateOne({ _id: sara._id }, { $set: { subjectClassAssignments: backupAssign } });
};
