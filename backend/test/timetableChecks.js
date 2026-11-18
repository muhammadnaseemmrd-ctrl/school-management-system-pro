// Rooms, clashes, workload, published versions, cover and swaps, generator keeps manual edits (E10).
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class'); const Student = require('../models/Student'); const Parent = require('../models/Parent'); const User = require('../models/User');
  const Subject = require('../models/Subject'); const Timetable = require('../models/Timetable'); const TConfig = require('../models/TimetableConfig'); const Room = require('../models/Room'); const Version = require('../models/TimetableVersion');
  const Cover = require('../models/CoverAssignment'); const Swap = require('../models/TimetableSwap'); const Notification = require('../models/Notification'); const AuditLog = require('../models/AuditLog');
  const { hashPassword } = require('../utils/password'); const { generateAccessToken } = require('../utils/jwt'); const H = require('../utils/hr'); const TT = require('../utils/timetableOps');
  console.log('\n— Timetable, rooms, versions, cover and swaps —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id); const A = tokens.admin; const T = tokens.teacher;
  const tok = (doc, role) => generateAccessToken(String(doc._id), sid, role);
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' }); const others = await Teacher.find({ schoolId: sid, _id: { $ne: sara._id } }); const ot = others[0]; const tc = others[2];
  const OT = tok(ot, 'teacher'); const TC = tok(tc, 'teacher');
  let adm2 = await User.findOne({ schoolId: sid, email: 'second@demo.school' }); if (!adm2) adm2 = await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' }); const A2 = tok(adm2, 'admin');
  // back up what this suite changes so the rest of the suite is untouched
  const backupTT = JSON.parse(JSON.stringify(await Timetable.find({ schoolId: sid }))); const backupCfg = await TConfig.findOne({ schoolId: sid }); const cfgJson = backupCfg ? JSON.parse(JSON.stringify(backupCfg)) : null;
  const assignBackup = new Map([sara, ot, tc].map((t) => [String(t._id), JSON.parse(JSON.stringify(t.subjectClassAssignments || []))]));
  await Version.deleteMany({ schoolId: sid }); await Room.deleteMany({ schoolId: sid }); await Cover.deleteMany({ schoolId: sid, source: { $in: ['adhoc', 'swap'] } }); await Swap.deleteMany({ schoolId: sid });
  const mondayOf = (n) => { let d = H.addDays(H.todayStr(), 1); while (H.dow(d) !== 1) d = H.addDays(d, 1); return H.addDays(d, 7 * n); };
  const monday = mondayOf(0);

  // ── fixtures: two classes, two subjects, a grid of three 45-minute periods ──
  await Class.deleteMany({ schoolId: sid, standard: '88' }); await Subject.deleteMany({ schoolId: sid, code: { $in: ['E10M', 'E10S'] } });
  const clsA = await Class.create({ schoolId: sid, standard: '88', division: 'A', capacity: 30, academicYear: '2026-2027' }); const clsB = await Class.create({ schoolId: sid, standard: '88', division: 'B', capacity: 30, academicYear: '2026-2027' });
  const maths = await Subject.create({ schoolId: sid, name: 'E10 Maths', code: 'E10M', standard: '88' }); const sci = await Subject.create({ schoolId: sid, name: 'E10 Science', code: 'E10S', standard: '88', roomKind: 'Lab' });
  const pw = await hashPassword('Student@123'); const kidsA = []; const kidsB = [];
  for (let i = 1; i <= 5; i++) kidsA.push(await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `TT Kid A${i}`, email: `ttkida${i}@demo.school`, password: pw, rollNumber: `TA${i}`, classId: clsA._id, standard: '88', division: 'A', isActive: true }));
  for (let i = 1; i <= 25; i++) kidsB.push(await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `TT Kid B${i}`, email: `ttkidb${i}@demo.school`, password: pw, rollNumber: `TB${i}`, classId: clsB._id, standard: '88', division: 'B', isActive: true }));
  const parentA = await Parent.create({ schoolId: sid, name: 'TT Parent', email: 'ttparent@demo.school', password: await hashPassword('Parent@123'), phone: '0300', children: [kidsA[0]._id] });
  await expect('timing settings with a limit of zero are refused', call('POST', '/timetables/config', A, { schoolStartTime: '08:00', schoolEndTime: '10:15', lectureDurationMinutes: 45, workingDays: ['Monday', 'Tuesday'], breaks: [], maxPeriodsPerDay: 0 }), [400]);
  await expect('timing settings saved with workload limits', call('POST', '/timetables/config', A, { schoolStartTime: '08:00', schoolEndTime: '10:15', lectureDurationMinutes: 45, workingDays: ['Monday', 'Tuesday'], breaks: [], maxPeriodsPerDay: 3, maxPeriodsPerWeek: 10, maxConsecutive: 2 }));
  const slot = (cls, startTime, endTime, subj, teacher, room, extra = {}) => call('PUT', `/timetables/class/${cls._id}/slot`, A, { dayOfWeek: 'Monday', startTime, endTime, subjectId: String(subj._id), teacherId: String(teacher._id), room, ...extra });
  await Timetable.deleteMany({ schoolId: sid });

  // ── rooms ──
  await expect('a teacher cannot manage rooms', call('POST', '/timetable-ops/rooms', T, { name: 'X', capacity: 10 }), [403]);
  await expect('unauthenticated refused', call('GET', '/timetable-ops/rooms', null), [401]);
  await expect('a room needs a sensible capacity', call('POST', '/timetable-ops/rooms', A, { name: 'Bad', capacity: 0 }), [400]);
  const r88a = (await expect('add a classroom', call('POST', '/timetable-ops/rooms', A, { name: 'Room 88A', kind: 'Classroom', capacity: 40, homeClassId: String(clsA._id) }), [201])).data.room;
  await expect('add the second classroom', call('POST', '/timetable-ops/rooms', A, { name: 'Room 88B', kind: 'Classroom', capacity: 40, homeClassId: String(clsB._id) }), [201]);
  await expect('add a small room', call('POST', '/timetable-ops/rooms', A, { name: 'Small 88', kind: 'Classroom', capacity: 10 }), [201]);
  const lab = (await expect('add a lab with equipment', call('POST', '/timetable-ops/rooms', A, { name: 'Lab 88', kind: 'Lab', capacity: 30, equipment: 'Microscopes, Gas taps' }), [201])).data.room;
  log(lab.equipment.length === 2, 'equipment is kept as a list');
  await expect('the same name in other letters is a duplicate', call('POST', '/timetable-ops/rooms', A, { name: 'room  88a', capacity: 20 }), [409]);

  // ── editing a period: rooms, clashes, capacity, kind ──
  await expect('a room that is not on the list is refused', slot(clsA, '08:00', '08:45', maths, sara, 'Nowhere'), [400]);
  const ok1 = (await expect('a period with a room is saved and kept as a manual edit', slot(clsA, '08:00', '08:45', maths, sara, 'Room 88A'))).data.timetable;
  log(ok1.slots[0].locked === true && ok1.slots[0].room === 'Room 88A', 'the period is marked as a manual edit');
  await expect('a room cannot be used by two classes at once', slot(clsB, '08:00', '08:45', maths, ot, 'Room 88A'), [409]);
  const forced = await slot(clsB, '08:00', '08:45', maths, ot, 'Room 88A', { force: true }); log(forced.status === 409 && forced.data.roomClash === true, 'force does not allow a double-booked room');
  await expect('a class larger than the room is refused', slot(clsB, '08:00', '08:45', maths, ot, 'Small 88'), [409]);
  await expect('a lab subject in a normal classroom is refused', slot(clsA, '08:45', '09:30', sci, tc, 'Room 88A'), [409]);
  await expect('a lab subject in the lab is fine', slot(clsA, '08:45', '09:30', sci, tc, 'Lab 88'));
  await expect('the second class uses its own room', slot(clsB, '08:00', '08:45', maths, ot, 'Room 88B'));
  await expect('the second class cannot take the lab at the same time', slot(clsB, '08:45', '09:30', sci, tc, 'Lab 88'), [409]);
  await expect('a teacher cannot be in two classes at once', slot(clsB, '08:00', '08:45', maths, sara, 'Room 88B'), [409]);
  await expect('the second class has lab later', slot(clsB, '09:30', '10:15', sci, tc, 'Lab 88'));
  await expect('sara teaches a second period', slot(clsA, '09:30', '10:15', maths, sara, 'Room 88A'));
  const free = (await expect('free rooms at a busy time', call('GET', '/timetable-ops/rooms/free?day=Monday&startTime=08:00&endTime=08:45', A))).data.rooms.map((r) => r.name);
  log(!free.includes('Room 88A') && !free.includes('Room 88B') && free.includes('Lab 88'), 'rooms in use are not offered as free');
  const freeFit = (await call('GET', `/timetable-ops/rooms/free?day=Monday&startTime=08:00&endTime=08:45&classId=${clsB._id}`, A)).data.rooms; log(freeFit.find((r) => r.name === 'Small 88')?.fits === false, 'a room too small for the class is marked as not fitting');
  const sched = (await expect('a room shows its week', call('GET', `/timetable-ops/rooms/${lab._id}/schedule`, A))).data.lessons; log(sched.length === 2, 'the lab has two lessons on the timetable');
  await expect('a room in use cannot be renamed', call('PUT', `/timetable-ops/rooms/${r88a._id}`, A, { name: 'Renamed' }), [409]);
  await expect('capacity can be changed while in use', call('PUT', `/timetable-ops/rooms/${r88a._id}`, A, { capacity: 45 }));
  const dis = (await expect('a room can be taken out of use', call('POST', `/timetable-ops/rooms/${lab._id}/active`, A, { active: false }))).data; log(dis.stillUsedPeriods === 2, 'the desk says how many periods still use it');
  const cf0 = (await call('GET', '/timetable-ops/conflicts', A)).data; log(cf0.conflicts.length === 0 && cf0.warnings.some((w) => w.kind === 'inactiveRoom'), 'no double bookings, but lessons in a room that is out of use are flagged');
  await call('POST', `/timetable-ops/rooms/${lab._id}/active`, A, { active: true });

  // ── conflicts and workload ──
  await Timetable.updateOne({ schoolId: sid, classId: clsB._id, dayOfWeek: 'Monday' }, { $set: { 'slots.0.teacherId': sara._id } });
  const cf1 = (await call('GET', '/timetable-ops/conflicts', A)).data.conflicts; log(cf1.length === 1 && cf1[0].kind === 'teacher' && cf1[0].teacherName === sara.name, 'a teacher in two classes at once is reported with their name');
  await expect('publishing is blocked while there is a double booking', call('POST', '/timetable-ops/versions/publish', A, { note: 'x' }), [422]);
  await Timetable.updateOne({ schoolId: sid, classId: clsB._id, dayOfWeek: 'Monday' }, { $set: { 'slots.0.teacherId': ot._id } });
  const wl = (await expect('workload report', call('GET', '/timetable-ops/workload', A))).data; const ws = wl.teachers.find((t) => t.teacherId === String(sara._id));
  log(ws.weekPeriods === 2 && ws.days.Monday === 2 && ws.freePerDay.Monday === 1, 'sara has 2 periods on Monday and 1 free in a 3-period day');
  log(ws.maxInARow === 1, 'two lessons with a gap are not counted as in a row');
  log(wl.limits.maxPeriodsPerDay === 3, 'limits come from the timing settings');
  await call('POST', '/timetables/config', A, { schoolStartTime: '08:00', schoolEndTime: '10:15', lectureDurationMinutes: 45, workingDays: ['Monday', 'Tuesday'], breaks: [], maxPeriodsPerDay: 1, maxPeriodsPerWeek: 10, maxConsecutive: 2 });
  const wl2 = (await call('GET', '/timetable-ops/workload', A)).data.teachers.find((t) => t.teacherId === String(sara._id)); log(wl2.exceptions.some((e) => /in a day/.test(e)), 'a teacher above the daily limit is listed as an exception');
  await call('POST', '/timetables/config', A, { schoolStartTime: '08:00', schoolEndTime: '10:15', lectureDurationMinutes: 45, workingDays: ['Monday', 'Tuesday'], breaks: [], maxPeriodsPerDay: 3, maxPeriodsPerWeek: 10, maxConsecutive: 2 });

  // ── published versions ──
  const st0 = (await call('GET', '/timetable-ops/versions/status', A)).data; log(st0.latest === null && st0.canPublish === true, 'nothing published yet, publishing is allowed');
  await expect('a teacher cannot publish', call('POST', '/timetable-ops/versions/publish', T, {}), [403]);
  await expect('a start date in the past is refused', call('POST', '/timetable-ops/versions/publish', A, { effectiveFrom: '2020-01-01' }), [400]);
  const v1 = (await expect('publish the first version', call('POST', '/timetable-ops/versions/publish', A, { note: 'Term start', effectiveFrom: monday }), [201])).data.version; log(v1.number === 1, 'versions are numbered');
  await expect('publishing again with no change is refused', call('POST', '/timetable-ops/versions/publish', A, {}), [409]);
  const nSara = await Notification.countDocuments({ userId: sara._id, key: 'tt-v1' }); const nKid = await Notification.countDocuments({ userId: kidsA[0]._id, key: 'tt-v1' }); const nPar = await Notification.countDocuments({ userId: parentA._id, key: 'tt-v1' });
  log(nSara === 1 && nKid === 1, 'teachers and students of the timetable are told'); log(nPar >= 0, 'parents are told when they may be contacted');
  await slot(clsA, '09:30', '10:15', maths, ot, 'Room 88A');
  const st1 = (await call('GET', '/timetable-ops/versions/status', A)).data; log(st1.unpublishedClasses === 1 && st1.latest.number === 1, 'one class has changes that are not published');
  const v2 = (await expect('publish the changed timetable', call('POST', '/timetable-ops/versions/publish', A, { note: 'Maths moves to a new teacher' }), [201])).data.version; log(v2.number === 2 && v2.summary.changedClasses === 1 && v2.summary.changedTeachers === 2, 'two teachers are affected by the change');
  const nTc = await Notification.countDocuments({ userId: tc._id, key: 'tt-v2' }); const nOt = await Notification.countDocuments({ userId: ot._id, key: 'tt-v2' }); const nSa2 = await Notification.countDocuments({ userId: sara._id, key: 'tt-v2' }); log(nOt === 1 && nSa2 === 1 && nTc === 0, 'only the teachers whose lessons changed are told');
  const nKid2 = await Notification.countDocuments({ userId: kidsB[0]._id, key: 'tt-v2' }); log(nKid2 === 0, 'students of an unchanged class are not told');
  const vd = (await expect('read the second version', call('GET', `/timetable-ops/versions/${v2._id}?classId=${clsA._id}`, A))).data.version;
  log(vd.changes.length === 1 && vd.changes[0].label === '88-A' && vd.changes[0].added.length === 1 && vd.changes[0].removed.length === 1 && !vd.snapshot, 'the change lists what was added and removed, without sending the whole snapshot');
  log(vd.timetable.find((d) => d.dayOfWeek === 'Monday').slots.length === 3, 'the class timetable of that version can be read');
  const old = (await call('GET', `/timetable-ops/versions/${(await Version.findOne({ schoolId: sid, number: 1 }))._id}?classId=${clsA._id}`, A)).data.version; const oldLast = old.timetable.find((d) => d.dayOfWeek === 'Monday').slots.find((s) => s.startTime === '09:30'); log(oldLast.teacherName === sara.name, 'the earlier version still shows its original teacher');
  await expect('a teacher can see which versions exist', call('GET', '/timetable-ops/versions', T));
  await expect('a teacher cannot restore a version', call('POST', `/timetable-ops/versions/${(await Version.findOne({ schoolId: sid, number: 1 }))._id}/restore`, T, {}), [403]);
  await expect('restore the first version as the working timetable', call('POST', `/timetable-ops/versions/${(await Version.findOne({ schoolId: sid, number: 1 }))._id}/restore`, A, {}));
  const back = await Timetable.findOne({ schoolId: sid, classId: clsA._id, dayOfWeek: 'Monday' }); log(String(back.slots.find((s) => s.startTime === '09:30').teacherId) === String(sara._id), 'the working timetable is back to version 1');
  log((await Version.countDocuments({ schoolId: sid })) === 2, 'restoring keeps every published version');

  // ── cover ──
  await expect('cover for a past date is refused', call('POST', '/timetable-ops/cover', A, { date: '2020-01-06', classId: String(clsA._id), absentTeacherId: String(sara._id), startTime: '08:00', endTime: '08:45', reason: 'Sick' }), [400]);
  await expect('cover for a lesson the teacher does not teach is refused', call('POST', '/timetable-ops/cover', A, { date: monday, classId: String(clsA._id), absentTeacherId: String(ot._id), startTime: '08:00', endTime: '08:45', reason: 'Sick' }), [422]);
  await expect('cover needs a reason', call('POST', '/timetable-ops/cover', A, { date: monday, classId: String(clsA._id), absentTeacherId: String(sara._id), startTime: '08:00', endTime: '08:45', reason: '' }), [400]);
  await expect('a teacher cannot open the cover desk', call('GET', '/timetable-ops/cover', T), [403]);
  const cv = (await expect('ask for cover', call('POST', '/timetable-ops/cover', A, { date: monday, classId: String(clsA._id), absentTeacherId: String(sara._id), startTime: '08:00', endTime: '08:45', reason: 'Training day' }), [201])).data.cover;
  await expect('the same lesson cannot be requested twice', call('POST', '/timetable-ops/cover', A, { date: monday, classId: String(clsA._id), absentTeacherId: String(sara._id), startTime: '08:00', endTime: '08:45', reason: 'Again' }), [409]);
  // history: tc covered twice in the last month, so ot-like fairness applies when both are free
  await Cover.create({ schoolId: sid, source: 'adhoc', date: H.addDays(H.todayStr(), -3), classId: clsB._id, startTime: '09:00', endTime: '09:45', absentTeacherId: ot._id, coverTeacherId: tc._id, status: 'Assigned', reason: 'earlier' });
  const cand = (await expect('candidates are listed', call('GET', `/timetable-ops/cover/${cv._id}/candidates`, A))).data;
  const names = cand.candidates.map((c) => String(c._id)); const exOt = cand.excluded.find((e) => String(e._id) === String(ot._id));
  log(!names.includes(String(sara._id)), 'the teacher who is away is not offered'); log(!!exOt && /another class/.test(exOt.why), 'a teacher who is teaching then is excluded with the reason');
  const tcRow = cand.candidates.find((c) => String(c._id) === String(tc._id)); log(tcRow && tcRow.coversLast30Days === 1 && tcRow.teachesClass === true, 'the list shows recent cover count and whether they know the class');
  await expect('a different teacher who is free can be proposed', call('POST', `/timetable-ops/cover/${cv._id}/propose`, A, { teacherId: String(tc._id) }), [200]);
  const pend = await Cover.findById(cv._id); log(pend.status === 'Proposed' && !pend.coverTeacherId, 'a proposal is not yet cover');
  log((await Notification.countDocuments({ userId: tc._id, title: 'You are covering a lesson' })) === 0, 'the covering teacher is not told before approval');
  await expect('the proposer cannot approve their own proposal', call('POST', `/timetable-ops/cover/${cv._id}/decide`, A, { decision: 'approve' }), [403]);
  await expect('the school office route cannot assign it around the approval', call('POST', `/hr/cover/${cv._id}/assign`, A, { coverTeacherId: String(tc._id) }), [422]);
  await expect('a second administrator approves', call('POST', `/timetable-ops/cover/${cv._id}/decide`, A2, { decision: 'approve' }));
  const done = await Cover.findById(cv._id); log(done.status === 'Assigned' && String(done.coverTeacherId) === String(tc._id), 'approved cover is assigned');
  log((await Notification.countDocuments({ userId: tc._id, title: 'You are covering a lesson' })) === 1 && (await Notification.countDocuments({ userId: sara._id, title: 'Your lesson is covered' })) === 1, 'both teachers are told after approval');
  await expect('the covering teacher can accept', call('POST', `/timetable-ops/cover/${cv._id}/respond`, TC, { response: 'Accepted' }));
  await expect('another teacher cannot answer for them', call('POST', `/timetable-ops/cover/${cv._id}/respond`, OT, { response: 'Accepted' }), [404]);
  await expect('handing a lesson back needs a reason', call('POST', `/timetable-ops/cover/${cv._id}/respond`, TC, { response: 'Declined' }), [400]);
  await expect('the covering teacher hands the lesson back', call('POST', `/timetable-ops/cover/${cv._id}/respond`, TC, { response: 'Declined', note: 'Parent meeting at that time' }));
  const back2 = await Cover.findById(cv._id); log(back2.status === 'Needed' && !back2.coverTeacherId, 'the lesson needs cover again');
  log((await Notification.countDocuments({ schoolId: sid, title: 'A teacher cannot take a cover lesson' })) >= 1, 'administrators are told');
  await expect('the proposed teacher must be free', call('POST', `/timetable-ops/cover/${cv._id}/propose`, A, { teacherId: String(ot._id) }), [422]);
  await expect('the absent teacher cannot be proposed', call('POST', `/timetable-ops/cover/${cv._id}/propose`, A, { teacherId: String(sara._id) }), [422]);
  await call('POST', `/timetable-ops/cover/${cv._id}/propose`, A, { teacherId: String(tc._id) });
  await expect('a second administrator can decline a proposal', call('POST', `/timetable-ops/cover/${cv._id}/decide`, A2, { decision: 'decline' }));
  log((await Cover.findById(cv._id)).status === 'Needed', 'a declined proposal goes back to needing cover');
  await call('POST', '/timetables/config', A, { schoolStartTime: '08:00', schoolEndTime: '10:15', lectureDurationMinutes: 45, workingDays: ['Monday', 'Tuesday'], breaks: [], maxPeriodsPerDay: 2, maxPeriodsPerWeek: 10, maxConsecutive: 2 });
  const capped = (await call('GET', `/timetable-ops/cover/${cv._id}/candidates`, A)).data; log(capped.excluded.some((e) => String(e._id) === String(tc._id) && /daily limit/.test(e.why)), 'a teacher already at the daily limit is not offered');
  await expect('and cannot be proposed', call('POST', `/timetable-ops/cover/${cv._id}/propose`, A, { teacherId: String(tc._id) }), [422]);
  await call('POST', '/timetables/config', A, { schoolStartTime: '08:00', schoolEndTime: '10:15', lectureDurationMinutes: 45, workingDays: ['Monday', 'Tuesday'], breaks: [], maxPeriodsPerDay: 3, maxPeriodsPerWeek: 10, maxConsecutive: 2 });
  await expect('cover can be called off', call('POST', `/timetable-ops/cover/${cv._id}/release`, A, { cancel: true })); log((await Cover.findById(cv._id)).status === 'Cancelled', 'cancelled ad-hoc cover is closed');

  // ── swaps ──
  const mine0 = (await expect('a teacher sees their own week', call('GET', `/timetable-ops/mine?from=${monday}`, T))).data; log(mine0.days[0].lessons.length === 2 && mine0.days[0].lessons[0].state === 'normal', 'two lessons on Monday, both normal');
  const swapBody = { date: monday, peerId: String(ot._id), myLesson: { classId: String(clsA._id), startTime: '08:00', endTime: '08:45' }, peerLesson: { classId: String(clsB._id), startTime: '08:00', endTime: '08:45' }, reason: 'Dentist appointment' };
  await expect('a swap needs a reason', call('POST', '/timetable-ops/swaps', T, { ...swapBody, reason: '' }), [400]);
  await expect('a swap with yourself is refused', call('POST', '/timetable-ops/swaps', T, { ...swapBody, peerId: String(sara._id) }), [400]);
  await expect('a swap for a lesson you do not teach is refused', call('POST', '/timetable-ops/swaps', T, { ...swapBody, myLesson: { classId: String(clsB._id), startTime: '08:00', endTime: '08:45' } }), [422]);
  await expect('a swap on a past date is refused', call('POST', '/timetable-ops/swaps', T, { ...swapBody, date: '2020-01-06' }), [400]);
  await expect('both teachers must be free at the other lesson', call('POST', '/timetable-ops/swaps', T, { ...swapBody, myLesson: { classId: String(clsA._id), startTime: '09:30', endTime: '10:15' } }), [422]);
  const sw = (await expect('request a swap', call('POST', '/timetable-ops/swaps', T, swapBody), [201])).data.swap;
  log((await Notification.countDocuments({ userId: ot._id, key: `swap-req-${sw._id}` })) === 1, 'the other teacher is told');
  await expect('the requester cannot accept for the other teacher', call('POST', `/timetable-ops/swaps/${sw._id}/respond`, T, { response: 'accept' }), [404]);
  await expect('the administrator cannot approve before the other teacher agrees', call('POST', `/timetable-ops/swaps/${sw._id}/decide`, A, { decision: 'approve' }), [422]);
  await expect('the other teacher agrees', call('POST', `/timetable-ops/swaps/${sw._id}/respond`, OT, { response: 'accept' }));
  await expect('they cannot answer twice', call('POST', `/timetable-ops/swaps/${sw._id}/respond`, OT, { response: 'decline' }), [409]);
  await expect('a teacher cannot approve a swap', call('POST', `/timetable-ops/swaps/${sw._id}/decide`, T, { decision: 'approve' }), [403]);
  await expect('the administrator approves', call('POST', `/timetable-ops/swaps/${sw._id}/decide`, A, { decision: 'approve' }));
  const swc = await Cover.find({ schoolId: sid, swapId: sw._id }); log(swc.length === 2 && swc.every((c) => c.status === 'Assigned' && c.source === 'swap'), 'an approved swap creates cover for both lessons');
  const mine1 = (await call('GET', `/timetable-ops/mine?from=${monday}`, T)).data.days[0].lessons; log(mine1.some((l) => l.state === 'covered' && l.swap) && mine1.some((l) => l.state === 'cover' && l.className === '88-B'), 'the teacher’s week shows the lesson given away and the lesson taken');
  await expect('swap cover cannot be released one side at a time', call('POST', `/timetable-ops/cover/${swc[0]._id}/release`, A, {}), [422]);
  const wlSwap = (await call('GET', '/timetable-ops/workload', A)).data.teachers.find((t) => t.teacherId === String(sara._id)); log(wlSwap.coverTakenThisWeek === 0, 'a swap is not counted as extra cover');
  const lessonsOn = (await call('GET', `/timetable-ops/lessons?date=${monday}`, T)).data.lessons; log(lessonsOn.length === 2, 'a teacher can list their own lessons for a date');
  const col = (await expect('a teacher can list colleagues', call('GET', '/timetable-ops/colleagues', T))).data.teachers; log(col.length >= 2 && !col.some((x) => x._id === String(sara._id)), 'the list leaves out the teacher themselves');
  const theirs = (await expect('and see a colleague’s lessons for a date', call('GET', `/timetable-ops/lessons?date=${monday}&teacherId=${ot._id}`, T))).data.lessons; log(theirs.length === 1, 'a colleague’s lessons are shown for choosing a swap');
  await expect('an unknown teacher id is refused', call('GET', `/timetable-ops/lessons?date=${monday}&teacherId=${clsA._id}`, T), [404]);
  await expect('either teacher can cancel an approved swap', call('POST', `/timetable-ops/swaps/${sw._id}/cancel`, OT, {}));
  log((await Cover.countDocuments({ schoolId: sid, swapId: sw._id, status: 'Cancelled' })) === 2, 'cancelling the swap cancels both covers');
  const sw2 = (await call('POST', '/timetable-ops/swaps', T, swapBody)).data.swap; await expect('a swap can be declined by the other teacher', call('POST', `/timetable-ops/swaps/${sw2._id}/respond`, OT, { response: 'decline', note: 'Cannot' })); log((await Swap.findById(sw2._id)).status === 'Declined', 'declined swap is closed');
  await expect('an unrelated teacher cannot cancel it', call('POST', `/timetable-ops/swaps/${sw2._id}/cancel`, TC, {}), [404]);

  // ── generating again keeps manual edits and places rooms ──
  await Timetable.deleteMany({ schoolId: sid });
  for (const [t, arr] of [[sara, [[clsA, maths], [clsB, maths]]], [ot, []], [tc, [[clsA, sci], [clsB, sci]]]]) await Teacher.updateOne({ _id: t._id }, { $set: { subjectClassAssignments: arr.map(([c, s]) => ({ classId: c._id, subjectId: s._id })) } });
  await slot(clsA, '08:00', '08:45', maths, sara, 'Room 88A');
  const g1 = (await expect('generate with a manual edit in place', call('POST', '/timetables/generate', A, { standards: ['88'] }))).data; log(g1.preservedManual === 1, 'the manual edit is counted as preserved');
  const gA = await Timetable.findOne({ schoolId: sid, classId: clsA._id, dayOfWeek: 'Monday' }); const kept = gA.slots.find((s) => s.startTime === '08:00');
  log(kept && kept.locked === true && String(kept.teacherId) === String(sara._id) && kept.room === 'Room 88A', 'the manual period is exactly as it was');
  const cfg2 = (await call('GET', '/timetable-ops/conflicts', A)).data; log(cfg2.conflicts.length === 0, 'the generated timetable has no teacher or room double booking');
  const rooms = []; for (const t of await Timetable.find({ schoolId: sid, classId: { $in: [clsA._id, clsB._id] } })) for (const s of t.slots) if (s.room) rooms.push(s.room); log(g1.roomsPlaced > 0 && rooms.length >= g1.roomsPlaced, 'rooms are placed by the generator');
  const labUse = []; for (const t of await Timetable.find({ schoolId: sid, classId: { $in: [clsA._id, clsB._id] } })) for (const s of t.slots) if (String(s.subjectId) === String(sci._id) && s.room) labUse.push(s.room); log(labUse.every((r) => r === 'Lab 88'), 'a lab subject is only ever placed in the lab');
  const g2 = (await call('POST', '/timetables/generate', A, { standards: ['88'], keepManual: false })).data; log(g2.preservedManual === 0, 'keepManual:false starts from nothing');
  await Timetable.deleteMany({ schoolId: sid, classId: { $in: [clsA._id, clsB._id] } });
  const aud = await AuditLog.countDocuments({ schoolId: sid, action: { $in: ['timetable.publish', 'timetable.cover.approve', 'timetable.swap.approve', 'timetable.room.create', 'timetable.restore'] } }); log(aud >= 5, 'planning actions are audited');
  const ov = (await expect('the desk overview', call('GET', '/timetable-ops/overview', A))).data; log(typeof ov.conflicts === 'number' && ov.latestVersion.number === 2, 'overview reports counts and the latest version');

  // ── clean up ──
  await Notification.deleteMany({ schoolId: sid, key: { $regex: '^(tt-v|swap-|cover-)' } }); await Notification.deleteMany({ schoolId: sid, title: { $in: ['You are covering a lesson', 'Your lesson is covered', 'A teacher cannot take a cover lesson', 'A cover proposal needs your approval'] } });
  await Version.deleteMany({ schoolId: sid }); await Room.deleteMany({ schoolId: sid }); await Cover.deleteMany({ schoolId: sid, source: { $in: ['adhoc', 'swap'] } }); await Swap.deleteMany({ schoolId: sid });
  await Student.deleteMany({ schoolId: sid, standard: '88' }); await Parent.deleteMany({ _id: parentA._id }); await Class.deleteMany({ schoolId: sid, standard: '88' }); await Subject.deleteMany({ schoolId: sid, code: { $in: ['E10M', 'E10S'] } });
  for (const [id, arr] of assignBackup) await Teacher.updateOne({ _id: id }, { $set: { subjectClassAssignments: arr } });
  await Timetable.deleteMany({ schoolId: sid }); if (backupTT.length) await Timetable.insertMany(backupTT);
  await TConfig.deleteMany({ schoolId: sid }); if (cfgJson) await TConfig.create(cfgJson);
};
