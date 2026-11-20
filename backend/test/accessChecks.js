// Tenant, campus and consent isolation (E01)
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Class = require('../models/Class'); const Student = require('../models/Student');
  const Teacher = require('../models/Teacher'); const Parent = require('../models/Parent'); const Subject = require('../models/Subject'); const Exam = require('../models/Exam'); const AuditLog = require('../models/AuditLog');
  const Campus = require('../models/Campus'); const Consent = require('../models/Consent'); const Organization = require('../models/Organization'); const PermissionGrant = require('../models/PermissionGrant');
  const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const P = require('../utils/permissions'); const CONS = require('../utils/consent');
  console.log('\n— Tenant, campus and consent isolation —');
  const pw = await hashPassword('Acc@12345');
  const mk = async (code) => {
    const s = await School.create({ name: `${code} Academy`, code, email: `${code.toLowerCase()}@acc.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0 });
    const a = await User.create({ schoolId: s._id, name: `${code} Admin`, email: `admin@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a2 = await User.create({ schoolId: s._id, name: `${code} Second Admin`, email: `admin2@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const sub = await Subject.create({ schoolId: s._id, name: `${code} Maths`, code: `${code}M`, standard: '1' });
    const c1 = await Class.create({ schoolId: s._id, standard: '1', division: 'A', capacity: 30 }); const c2 = await Class.create({ schoolId: s._id, standard: '2', division: 'A', capacity: 30 });
    const mkSt = (n, cls, i) => Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: n, email: `${n.toLowerCase().replace(/\W+/g, '.')}@${code.toLowerCase()}.test`, password: pw, role: 'student', admissionNumber: `${code}-${i}`, gender: 'Female', dateOfBirth: new Date('2014-05-05T00:00:00Z'), classId: cls._id, division: 'A', guardian: { name: 'G', mobileNumber: '03005550000' } });
    const st1 = await mkSt(`${code} Mainkid`, c1, 1); const st2 = await mkSt(`${code} Northkid`, c2, 2);
    await Class.updateOne({ _id: c1._id }, { $set: { studentCount: 1 } }); await Class.updateOne({ _id: c2._id }, { $set: { studentCount: 1 } });
    const t = await Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} Teacher`, email: `teacher@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const par = await Parent.create({ schoolId: s._id, name: `${code} Parent`, email: `parent@${code.toLowerCase()}.test`, password: pw, phone: '+92-300-0000000', relationship: 'Father', children: [st1._id] });
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, a, a2, sub, c1, c2, st1, st2, t, par, A: tok(a, 'admin'), A2: tok(a2, 'admin'), T: tok(t, 'teacher'), P: tok(par, 'parent'), S1: tok(st1, 'student') };
  };
  const X = await mk('ACC001'); const Y = await mk('ACC002'); const SA = tokens.superadmin;
  const G = (p, t) => call('GET', p, t); const PO = (p, b, t) => call('POST', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {}); const PA = (p, b, t) => call('PATCH', p, t, b || {}); const DE = (p, t) => call('DELETE', p, t);
  const leaks = (r, ...words) => words.some((w) => JSON.stringify(r.data || '').includes(w));

  // ── 1. the school comes from the session, never from the form ──
  const upd = await expect('an admin edits a student of their own school', PU(`/students/${X.st1._id}`, { name: 'ACC001 Mainkid Edited', schoolId: String(Y.s._id) }, X.A), [200]);
  const afterSt = await Student.findById(X.st1._id); log(String(afterSt.schoolId) === String(X.s._id) && afterSt.name === 'ACC001 Mainkid Edited', 'a student edit cannot move the student into another school');
  await expect('editing a student of another school is not found', PU(`/students/${Y.st1._id}`, { name: 'Hijacked' }, X.A), [404]);
  log((await Student.findById(Y.st1._id)).name === 'ACC002 Mainkid', 'the other school student is unchanged');
  await expect('an admin edits a class of their own school', PU(`/classes/${X.c1._id}`, { room: 'R9', schoolId: String(Y.s._id), campusId: String(new mg.Types.ObjectId()), studentCount: 99 }, X.A), [200]);
  const afterCl = await Class.findById(X.c1._id); log(String(afterCl.schoolId) === String(X.s._id) && afterCl.room === 'R9' && !afterCl.campusId && afterCl.studentCount === 1, 'a class edit cannot change the school, the campus or the head count');
  await expect('editing a class of another school is not found', PU(`/classes/${Y.c1._id}`, { room: 'Hijacked' }, X.A), [404]);
  await expect('an admin edits a teacher of their own school', PU(`/teachers/${X.t._id}`, { phone: '0300', schoolId: String(Y.s._id) }, X.A), [200]);
  log(String((await Teacher.findById(X.t._id)).schoolId) === String(X.s._id), 'a teacher edit cannot move the teacher into another school');
  await expect('a teacher of another school is not found', PU(`/teachers/${Y.t._id}`, { phone: '1' }, X.A), [404]);
  const ex = await Exam.create({ schoolId: X.s._id, name: 'X exam', classId: X.c1._id, subjectId: X.sub._id, date: new Date(), totalMarks: 100, passingMarks: 35 });
  await expect('an exam edit works', PU(`/marks/exams/${ex._id}`, { name: 'X exam 2', schoolId: String(Y.s._id) }, X.A), [200]);
  log(String((await Exam.findById(ex._id)).schoolId) === String(X.s._id), 'an exam edit cannot move the exam into another school');
  await expect('a class of another school cannot be given to a teacher', PO(`/teachers/${X.t._id}/assign-class`, { classId: String(Y.c1._id) }, X.A), [404]);
  await expect('a subject of another school cannot be given to a teacher', PO(`/teachers/${X.t._id}/assign-subject`, { subjectId: String(Y.sub._id) }, X.A), [404]);
  await expect('their own class can be given to a teacher', PO(`/teachers/${X.t._id}/assign-class`, { classId: String(X.c1._id) }, X.A), [200]);
  const made = await call('POST', '/students', X.A, { name: 'ACC001 Newkid', email: 'newkid@acc001.test', password: 'Kid@12345', classId: String(X.c1._id), schoolId: String(Y.s._id), admissionNumber: 'ACC001-9', gender: 'Male', dateOfBirth: '2015-01-01', guardian: { name: 'G', mobileNumber: '03005550000' } });
  const newKid = made.status < 300 ? await Student.findOne({ email: 'newkid@acc001.test' }) : null; log(made.status < 300 && newKid && String(newKid.schoolId) === String(X.s._id), `a new student is always made in the signed-in school (${made.status} ${JSON.stringify(made.data).slice(0, 100)})`);

  // ── 2. cross-tenant fuzz: school X reaches for school Y records by id, on every route that takes one ──
  const gY = await PermissionGrant.create({ schoolId: Y.s._id, granteeId: Y.t._id, granteeModel: 'Teacher', granteeName: 'Y teacher', action: 'care.counsel', source: 'grant', validFrom: new Date(), validTo: new Date(Date.now() + 864e5), reason: 'cover', grantedBy: Y.a._id });
  const yCampus = await Campus.create({ schoolId: Y.s._id, name: 'Y North', code: 'YN' }); const yOrg = String(new mg.Types.ObjectId());
  const probes = [
    ['read a student', () => G(`/students/${Y.st1._id}`, X.A)], ['delete a student', () => DE(`/students/${Y.st1._id}`, X.A)], ['read a class', () => G(`/classes/${Y.c1._id}`, X.A)], ['list class students', () => G(`/classes/${Y.c1._id}/students`, X.A)],
    ['delete a class', () => DE(`/classes/${Y.c1._id}`, X.A)], ['read a teacher', () => G(`/teachers/${Y.t._id}`, X.A)], ['revoke a grant', () => PO(`/permissions/grants/${gY._id}/revoke`, { reason: 'nope nope' }, X.A)],
    ['grant to a person', () => PO('/permissions/grants', { action: 'care.counsel', granteeId: String(Y.t._id), granteeRole: 'teacher', validTo: new Date(Date.now() + 864e5).toISOString(), reason: 'trying it' }, X.A)],
    ['grant for a class', () => PO('/permissions/grants', { action: 'academics.attendance.mark', granteeId: String(X.t._id), granteeRole: 'teacher', classId: String(Y.c1._id), validTo: new Date(Date.now() + 864e5).toISOString(), reason: 'trying it' }, X.A)],
    ['edit a campus', () => PA(`/campuses/${yCampus._id}`, { name: 'Mine now' }, X.A)], ['move classes to a campus', () => PO(`/campuses/${yCampus._id}/classes`, { classIds: [String(X.c1._id)] }, X.A)],
    ['move a class into my campus', () => PO('/campuses/not-an-id/classes', { classIds: [String(Y.c1._id)] }, X.A)], ['add an admin of another school to a campus', () => PO('/campuses/members', { userId: String(Y.a._id), campusId: String(yCampus._id) }, X.A)],
    ['record a consent', () => PO('/consents', { subjectType: 'student', subjectId: String(Y.st1._id), purpose: 'photo_media', givenByName: 'Someone', method: 'paper' }, X.A)], ['withdraw a consent', () => PO('/consents/withdraw', { subjectType: 'student', subjectId: String(Y.st1._id), purpose: 'photo_media' }, X.A)],
    ['read a consent history', () => G(`/consents/history?subjectType=student&subjectId=${Y.st1._id}&purpose=photo_media`, X.A)], ['check a consent', () => G(`/consents/check?subjectType=student&subjectId=${Y.st1._id}&purpose=photo_media`, X.A)],
    ['a parent answers for a child of another school', () => PO('/consents/mine', { subjectType: 'student', subjectId: String(Y.st1._id), purpose: 'photo_media' }, X.P)], ['a parent reads a child of another school', () => G(`/students/${Y.st1._id}`, X.P)],
  ];
  let reached = 0; const reachedList = [];
  for (const [label, fn] of probes) { const r = await fn(); const bad = r.status < 300 || leaks(r, 'ACC002'); if (bad) { reached += 1; reachedList.push(`${label} ${r.status}`); } }
  log(reached === 0, `none of ${probes.length} cross-school attempts reaches another school's records${reached ? ': ' + reachedList.join('; ') : ''}`);
  log((await Student.findById(Y.st1._id)) && (await Class.findById(Y.c1._id)) && !(await PermissionGrant.findById(gY._id)).revokedAt && String((await Campus.findById(yCampus._id)).name) === 'Y North', 'and nothing in the other school changed');
  const lists = [await G('/students?limit=100', X.A), await G('/classes?limit=100', X.A), await G('/teachers', X.A), await G('/permissions/grants', X.A), await G('/consents', X.A), await G('/campuses', X.A), await G('/campuses/classes', X.A), await G('/permissions/people', X.A)];
  log(lists.every((r) => r.status === 200) && !lists.some((r) => leaks(r, 'ACC002')), 'every list a school admin can open is free of the other school\'s records');
  // the same school, two accounts in one organization: grouping must not open anything
  const org = await expect('the owner makes an organization', PO('/organizations', { name: 'Acc Group', contactEmail: 'owner@acc.test' }, SA), [201]); const oId = org.data.organization._id;
  await expect('a school admin cannot manage organizations', G('/organizations', X.A), [403]); await expect('a teacher cannot either', G('/organizations', X.T), [403]); await expect('nobody signed in cannot either', G('/organizations', null), [401]);
  await expect('the same name is refused', PO('/organizations', { name: 'Acc Group' }, SA), [409]); await expect('a name is needed', PO('/organizations', { name: ' ' }, SA), [400]);
  await expect('the first school joins', PO(`/organizations/${oId}/schools`, { schoolId: String(X.s._id) }, SA), [200]); await expect('the second school joins', PO(`/organizations/${oId}/schools`, { schoolId: String(Y.s._id) }, SA), [200]);
  const org2 = await expect('a second organization', PO('/organizations', { name: 'Other Group' }, SA), [201]); await expect('a school already in a group cannot be taken by another', PO(`/organizations/${org2.data.organization._id}/schools`, { schoolId: String(X.s._id) }, SA), [409]);
  await expect('an unknown school is not found', PO(`/organizations/${oId}/schools`, { schoolId: String(new mg.Types.ObjectId()) }, SA), [404]);
  const og = await expect('the organization shows its schools', G(`/organizations/${oId}`, SA), [200]); log(og.data.organization.schoolCount === 2 && !('students' in og.data.organization), 'two schools are listed, with no learner data');
  const un = await expect('schools without a group can be listed', G('/organizations/unassigned-schools', SA), [200]); log(!un.data.schools.some((s) => String(s._id) === String(X.s._id)), 'a school in a group is no longer in the unassigned list');
  const again = []; for (const [label, fn] of probes.slice(0, 8)) { const r = await fn(); if (r.status < 300 || leaks(r, 'ACC002')) again.push(label); }
  log(again.length === 0, 'two schools in the same organization still cannot reach each other\'s records');
  const ov0 = await G('/campuses', X.A); log(ov0.data.organization?.name === 'Acc Group', 'a school sees which organization it belongs to');
  await expect('a school leaves', DE(`/organizations/${oId}/schools/${Y.s._id}`, SA), [200]); await expect('leaving twice is not found', DE(`/organizations/${oId}/schools/${Y.s._id}`, SA), [404]);
  await expect('an organization can be suspended', PA(`/organizations/${oId}`, { status: 'suspended' }, SA), [200]); await expect('a suspended organization takes no new school', PO(`/organizations/${oId}/schools`, { schoolId: String(Y.s._id) }, SA), [409]);
  await expect('a bad status is refused', PA(`/organizations/${oId}`, { status: 'gone' }, SA), [400]);

  // ── 3. campuses ──
  await expect('nobody signed in cannot open campuses', G('/campuses', null), [401]); await expect('a teacher is refused', G('/campuses', X.T), [403]); await expect('a parent is refused', G('/campuses', X.P), [403]);
  const ov = await expect('an admin opens campuses', G('/campuses', X.A), [200]); const main = ov.data.campuses.find((c) => c.isDefault);
  log(ov.data.campuses.length === 1 && main.name === 'Main campus' && main.classes === 2 && main.students === 3 && ov.data.me.schoolWide, 'every school starts with one default campus holding all its classes');
  const nth = await expect('a campus is created', PO('/campuses', { name: 'North campus', code: 'north', address: 'Block 4' }, X.A), [201]); const north = nth.data.campus;
  log(north.code === 'NORTH' && north.status === 'active' && !north.isDefault, 'the code is tidied and the campus starts active');
  await expect('the same code is refused', PO('/campuses', { name: 'Another', code: 'NORTH' }, X.A), [409]); await expect('a name is needed', PO('/campuses', { name: '' }, X.A), [400]);
  await expect('a campus is renamed', PA(`/campuses/${north._id}`, { name: 'North campus (new)', phone: '051-1' }, X.A), [200]);
  await expect('the default campus cannot be closed', PA(`/campuses/${main._id}`, { status: 'closed' }, X.A), [409]); await expect('a bad status is refused', PA(`/campuses/${north._id}`, { status: 'x' }, X.A), [400]); await expect('nothing to change is refused', PA(`/campuses/${north._id}`, {}, X.A), [400]);
  await expect('no classes, no move', PO(`/campuses/${north._id}/classes`, { classIds: [] }, X.A), [400]);
  const mv = await expect('a class moves to the new campus', PO(`/campuses/${north._id}/classes`, { classIds: [String(X.c2._id)] }, X.A), [200]); log(mv.data.moved === 1 && String((await Class.findById(X.c2._id)).campusId) === String(north._id), 'the class now sits on the new campus');
  const mv2 = await PO(`/campuses/${north._id}/classes`, { classIds: [String(X.c2._id)] }, X.A); log(mv2.status === 200 && mv2.data.moved === 0, 'moving it again changes nothing');
  await expect('a campus with classes cannot be closed', PA(`/campuses/${north._id}`, { status: 'closed' }, X.A), [409]);
  const ov2 = await G('/campuses', X.A); const n2 = ov2.data.campuses.find((c) => c._id === north._id); const m2 = ov2.data.campuses.find((c) => c.isDefault); log(n2.classes === 1 && n2.students === 1 && m2.classes === 1, 'the counts follow the move');
  const spare = await expect('a spare campus is made and closed', PO('/campuses', { name: 'Spare', code: 'SPARE' }, X.A), [201]); await expect('an empty campus can be closed', PA(`/campuses/${spare.data.campus._id}`, { status: 'closed' }, X.A), [200]);
  await expect('a closed campus takes no classes', PO(`/campuses/${spare.data.campus._id}/classes`, { classIds: [String(X.c1._id)] }, X.A), [409]);
  await expect('a campus can reopen', PA(`/campuses/${spare.data.campus._id}`, { status: 'active' }, X.A), [200]);

  // ── 4. a campus administrator sees only their campus ──
  await expect('a campus admin is added', PO('/campuses/members', { userId: String(X.a2._id), campusId: north._id }, X.A), [201]);
  await expect('adding the same one twice is refused', PO('/campuses/members', { userId: String(X.a2._id), campusId: north._id }, X.A), [409]);
  await expect('the last school-wide admin cannot be limited', PO('/campuses/members', { userId: String(X.a._id), campusId: north._id }, X.A), [409]);
  await expect('only admins can be limited', PO('/campuses/members', { userId: String(X.t._id), campusId: north._id }, X.A), [404]);
  const mem = await G('/campuses/members', X.A); log(mem.data.admins.find((a) => String(a._id) === String(X.a2._id)).memberships.length === 1 && mem.data.admins.find((a) => String(a._id) === String(X.a._id)).schoolWide, 'the member list shows who is school-wide and who is limited');
  const cl = await expect('the campus admin lists classes', G('/classes', X.A2), [200]); log(cl.data.classes.length === 1 && cl.data.classes[0].standard === '2', 'only the classes of their campus are listed');
  await expect('a class of another campus is not found', G(`/classes/${X.c1._id}`, X.A2), [404]); await expect('their own class opens', G(`/classes/${X.c2._id}`, X.A2), [200]);
  await expect('the students of another campus cannot be listed', G(`/classes/${X.c1._id}/students`, X.A2), [404]);
  const sl = await expect('the campus admin lists students', G('/students?limit=100', X.A2), [200]); log(sl.data.students.length === 1 && sl.data.students[0].name.includes('Northkid'), 'only the students of their campus are listed');
  await expect('asking for the other campus class is refused', G(`/students?classId=${X.c1._id}`, X.A2), [403]); await expect('a student of another campus is refused', G(`/students/${X.st1._id}`, X.A2), [403]); await expect('a student of their campus opens', G(`/students/${X.st2._id}`, X.A2), [200]);
  await expect('editing a student of another campus is not found', PU(`/students/${X.st1._id}`, { name: 'Moved' }, X.A2), [404]); await expect('deleting one is not found', DE(`/students/${X.st1._id}`, X.A2), [404]);
  await expect('moving a student into another campus class is refused', PU(`/students/${X.st2._id}`, { classId: String(X.c1._id) }, X.A2), [403]);
  await expect('editing a student of their campus works', PU(`/students/${X.st2._id}`, { phone: '0300111' }, X.A2), [200]);
  await expect('a class cannot be edited on another campus', PU(`/classes/${X.c1._id}`, { room: 'Z' }, X.A2), [404]); await expect('a class cannot be deleted on another campus', DE(`/classes/${X.c1._id}`, X.A2), [404]);
  await expect('a whole standard cannot be removed by a campus admin', DE('/classes/standard/2', X.A2), [403]); await expect('bulk class setup is refused too', PO('/classes/bulk-setup', {}, X.A2), [403]);
  const nc = await expect('a new class lands on their campus', PO('/classes', { standard: '3', division: 'A' }, X.A2), [201]); log(String(nc.data.class.campusId) === String(north._id), 'it is placed on their only campus without asking');
  await expect('a class cannot be created on another campus', PO('/classes', { standard: '4', division: 'A', campusId: String(main._id) }, X.A2), [403]);
  await expect('a campus admin cannot move a class out', PO(`/campuses/${main._id}/classes`, { classIds: [String(X.c2._id)] }, X.A2), [403]);
  await expect('a campus admin cannot create a campus', PO('/campuses', { name: 'Mine', code: 'MINE' }, X.A2), [403]); await expect('a campus admin cannot manage members', G('/campuses/members', X.A2), [403]);
  await expect('a campus admin cannot rename a campus', PA(`/campuses/${north._id}`, { name: 'x' }, X.A2), [403]);
  const ovC = await G('/campuses', X.A2); log(ovC.data.campuses.length === 1 && ovC.data.me.schoolWide === false, 'they see only their own campus, and are told they are limited');
  const cc = await G('/campuses/classes', X.A2); log(cc.data.classes.length === 2 && cc.data.classes.every((c) => String(c.campusId) === String(north._id)), 'the class picker shows only their classes');
  // permissions follow the same edge
  const U2 = { role: 'admin', userId: String(X.a2._id), schoolId: String(X.s._id) }; const U1 = { role: 'admin', userId: String(X.a._id), schoolId: String(X.s._id) };
  log((await P.can(U2, 'academics.attendance.mark', { classId: X.c2._id })).allowed && !(await P.can(U2, 'academics.attendance.mark', { classId: X.c1._id })).allowed, 'a campus admin may take attendance for their campus only');
  log((await P.can(U1, 'academics.attendance.mark', { classId: X.c1._id })).allowed && (await P.can(U1, 'academics.attendance.mark', { classId: X.c2._id })).allowed, 'a school-wide admin may for every campus');
  log(!(await P.can(U2, 'care.case.work', { campusId: main._id })).allowed && (await P.can(U2, 'care.case.work', { campusId: north._id })).allowed, 'a campus admin\'s role default stops at their campus edge');
  // grants tied to a campus
  const until = new Date(Date.now() + 5 * 864e5).toISOString();
  const g1 = await expect('a campus-limited grant is made', PO('/permissions/grants', { action: 'care.counsel', granteeId: String(X.t._id), granteeRole: 'teacher', campusId: north._id, validTo: until, reason: 'Counsels at North' }, X.A), [201]);
  log(g1.data.grant.campusId === north._id && g1.data.grant.campusName.startsWith('North'), 'the grant shows its campus');
  const TU = { role: 'teacher', userId: String(X.t._id), schoolId: String(X.s._id)};
  log((await P.can(TU, 'care.counsel', { campusId: north._id })).allowed && (await P.can(TU, 'care.counsel', { classId: X.c2._id })).allowed, 'it works for the campus and for classes on it');
  log(!(await P.can(TU, 'care.counsel', { campusId: main._id })).allowed && !(await P.can(TU, 'care.counsel', { classId: X.c1._id })).allowed && !(await P.can(TU, 'care.counsel')).allowed, 'it does not work elsewhere, or with no campus in view');
  await expect('a class on another campus cannot be paired with this campus', PO('/permissions/grants', { action: 'academics.attendance.mark', granteeId: String(X.t._id), granteeRole: 'teacher', classId: String(X.c1._id), campusId: north._id, validTo: until, reason: 'mismatch here' }, X.A), [422]);
  await expect('a campus admin cannot grant for the whole school', PO('/permissions/grants', { action: 'care.counsel', granteeId: String(X.t._id), granteeRole: 'teacher', validTo: until, reason: 'whole school' }, X.A2), [403]);
  await expect('a campus admin cannot grant for another campus class', PO('/permissions/grants', { action: 'academics.attendance.mark', granteeId: String(X.t._id), granteeRole: 'teacher', classId: String(X.c1._id), validTo: until, reason: 'main school' }, X.A2), [403]);
  const g2 = await expect('a campus admin grants inside their campus', PO('/permissions/grants', { action: 'academics.attendance.mark', granteeId: String(X.t._id), granteeRole: 'teacher', classId: String(X.c2._id), validTo: until, reason: 'cover North' }, X.A2), [201]); log(g2.data.grant.campusName.startsWith('North'), 'the campus is filled in from the class');
  const gAll = await expect('a school-wide admin makes a whole-school grant', PO('/permissions/grants', { action: 'care.health.manage', granteeId: String(X.a2._id), granteeRole: 'admin', validTo: until, reason: 'nurse cover' }, X.A), [201]);
  const gl = await G('/permissions/grants', X.A2); log(gl.data.grants.length === 2 && gl.data.grants.every((g) => g.campusId === north._id), 'a campus admin sees only the grants of their campus');
  await expect('and cannot take back one for the whole school', PO(`/permissions/grants/${gAll.data.grant._id}/revoke`, { reason: 'not mine' }, X.A2), [404]);
  await expect('but can take back one in their campus', PO(`/permissions/grants/${g2.data.grant._id}/revoke`, { reason: 'back now' }, X.A2), [200]);
  const bg = await expect('emergency access still works for a campus admin and is told to the others', PO('/permissions/break-glass', { action: 'safeguarding.case.read', reason: 'A child may be at risk at the gate today', minutes: 15 }, X.A2), [201]);
  log(!!(await AuditLog.findOne({ schoolId: X.s._id, action: 'permission.break-glass' })), 'break-glass is audited');
  // taking the limit away
  const mm = (await G('/campuses/members', X.A)).data.admins.find((a) => String(a._id) === String(X.a2._id)).memberships[0];
  await expect('the limit is taken away', DE(`/campuses/members/${mm._id}`, X.A), [200]); await expect('taking it away twice is not found', DE(`/campuses/members/${mm._id}`, X.A), [404]);
  const wide = await G('/classes', X.A2); log(wide.data.classes.length >= 3, 'the admin is school-wide again and sees every class');
  await PO('/campuses/members', { userId: String(X.a2._id), campusId: north._id }, X.A);          // limited again for the consent checks below

  // ── 5. consent register ──
  const pr = await expect('the wording on offer is listed', G('/consents/purposes', X.A), [200]); log(pr.data.purposes.length >= 6 && pr.data.purposes.every((p) => p.version && p.detail), 'each purpose has a version and plain wording');
  await expect('a parent can read the wording too', G('/consents/purposes', X.P), [200]); await expect('nobody signed in cannot', G('/consents/purposes', null), [401]);
  await expect('a teacher cannot open the register', G('/consents', X.T), [403]); await expect('a parent cannot open the register', G('/consents', X.P), [403]); await expect('a student cannot answer', PO('/consents/mine', { purpose: 'photo_media', subjectId: String(X.st1._id) }, X.S1), [403]);
  const base1 = { subjectType: 'student', subjectId: String(X.st1._id), purpose: 'photo_media', givenByName: 'Mr Khan', givenByRelation: 'father', method: 'paper', evidenceNote: 'Form 14' };
  await expect('an unknown purpose is refused', PO('/consents', { ...base1, purpose: 'nope' }, X.A), [400]); await expect('the portal cannot be claimed by the office', PO('/consents', { ...base1, method: 'portal' }, X.A), [400]);
  await expect('a purpose about teachers is not about children', PO('/consents', { ...base1, purpose: 'staff_directory' }, X.A), [400]); await expect('the person who agreed must be named', PO('/consents', { ...base1, givenByName: '' }, X.A), [400]);
  await expect('an end date in the past is refused', PO('/consents', { ...base1, expiresAt: '2020-01-01' }, X.A), [400]); await expect('an unknown child is not found', PO('/consents', { ...base1, subjectId: String(new mg.Types.ObjectId()) }, X.A), [404]);
  const c0 = await G(`/consents/check?subjectType=student&subjectId=${X.st1._id}&purpose=photo_media`, X.A); log(c0.data.allowed === false && c0.data.state === 'none', 'with nothing recorded the answer is no');
  log((await CONS.hasConsent(X.s._id, X.st1._id, 'photo_media')) === false, 'other modules asking get no when nothing is recorded');
  const r1 = await expect('the office records a consent from a paper form', PO('/consents', base1, X.A), [201]); log(r1.data.consent.state === 'granted' && r1.data.consent.version === '2026-1' && r1.data.consent.method === 'paper' && r1.data.consent.recordedByName, 'it keeps the wording version, how it was given and who recorded it');
  const c1 = await G(`/consents/check?subjectType=student&subjectId=${X.st1._id}&purpose=photo_media`, X.A); log(c1.data.allowed === true && c1.data.version === '2026-1', 'now the answer is yes');
  log((await CONS.hasConsent(X.s._id, X.st1._id, 'photo_media')) === true, 'and other modules get yes');
  await expect('recording again renews it', PO('/consents', { ...base1, evidenceNote: 'Form 22' }, X.A), [201]);
  const h1 = await G(`/consents/history?subjectType=student&subjectId=${X.st1._id}&purpose=photo_media`, X.A); log(h1.data.history.length === 2 && h1.data.history.filter((h) => h.isCurrent).length === 1 && h1.data.history[0].evidenceNote === 'Form 22', 'the old record is kept and only the newest is current');
  const w1 = await expect('the office records a withdrawal', PO('/consents/withdraw', { subjectType: 'student', subjectId: String(X.st1._id), purpose: 'photo_media', reason: 'Parent phoned', method: 'phone' }, X.A), [200]); log(w1.data.consent.state === 'withdrawn' && w1.data.consent.reason === 'Parent phoned', 'withdrawal is a new row with its reason');
  await expect('withdrawing twice is refused', PO('/consents/withdraw', { subjectType: 'student', subjectId: String(X.st1._id), purpose: 'photo_media' }, X.A), [409]);
  const c2 = await G(`/consents/check?subjectType=student&subjectId=${X.st1._id}&purpose=photo_media`, X.A); log(c2.data.allowed === false && c2.data.state === 'withdrawn', 'after withdrawal the answer is no again');
  const h2 = await G(`/consents/history?subjectType=student&subjectId=${X.st1._id}&purpose=photo_media`, X.A); log(h2.data.history.length === 3, 'three rows of history are kept');
  let dupErr = null; try { await Consent.create({ schoolId: X.s._id, subjectType: 'student', subjectId: X.st1._id, purpose: 'photo_media', status: 'granted', currentKey: `${X.s._id}:student:${X.st1._id}:photo_media` }); } catch (e) { dupErr = e; }
  log(!!dupErr, 'the database itself refuses a second current row for the same person and purpose');
  await expect('a consent that ends is recorded', PO('/consents', { ...base1, purpose: 'trip_participation', expiresAt: new Date(Date.now() + 864e5).toISOString() }, X.A), [201]);
  await Consent.updateOne({ schoolId: X.s._id, purpose: 'trip_participation', isCurrent: true }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const ce = await G(`/consents/check?subjectType=student&subjectId=${X.st1._id}&purpose=trip_participation`, X.A); log(ce.data.allowed === false && ce.data.state === 'expired', 'once the end date passes it counts as expired');
  // parents answer for their own children, through the portal
  const mine = await expect('a parent sees their child and themselves', G('/consents/mine', X.P), [200]); log(mine.data.canAnswer && mine.data.people.length === 2 && mine.data.people[0].answers.length >= 5, 'the parent sees what is asked for the child and for themselves');
  log(!mine.data.people.some((p) => leaks({ data: p }, 'ACC002')) && mine.data.people.filter((p) => p.type === 'student').length === 1, 'and only their own child');
  const pg1 = await expect('a parent agrees for their child', PO('/consents/mine', { subjectType: 'student', subjectId: String(X.st1._id), purpose: 'ai_tools' }, X.P), [201]); log(pg1.data.consent.method === 'portal' && pg1.data.consent.givenByRelation === 'parent', 'it is recorded as given through the portal by the parent');
  await expect('a parent cannot answer for another child of the school', PO('/consents/mine', { subjectType: 'student', subjectId: String(X.st2._id), purpose: 'ai_tools' }, X.P), [404]);
  await expect('a parent cannot answer for another parent', PO('/consents/mine', { subjectType: 'parent', subjectId: String(Y.par._id), purpose: 'news_messages' }, X.P), [403]);
  await expect('a parent agrees for themselves', PO('/consents/mine', { subjectType: 'parent', subjectId: String(X.par._id), purpose: 'news_messages' }, X.P), [201]);
  await expect('a child purpose cannot be answered for a parent', PO('/consents/mine', { subjectType: 'parent', subjectId: String(X.par._id), purpose: 'ai_tools' }, X.P), [400]);
  await expect('a parent withdraws', PO('/consents/mine/withdraw', { subjectType: 'student', subjectId: String(X.st1._id), purpose: 'ai_tools', reason: 'Changed mind' }, X.P), [200]);
  await expect('a parent cannot withdraw for another child', PO('/consents/mine/withdraw', { subjectType: 'student', subjectId: String(X.st2._id), purpose: 'ai_tools' }, X.P), [404]);
  const sv = await expect('a student can see what is recorded', G('/consents/mine', X.S1), [200]); log(sv.data.canAnswer === false && sv.data.people.length === 1, 'but only for themselves, and cannot answer');
  const sm = await G('/consents/summary', X.A); const ph = sm.data.purposes.find((p) => p.key === 'photo_media'); log(ph.withdrawn === 1 && ph.granted === 0 && ph.unanswered === 2 && sm.data.students === 3,  'the summary counts given, withdrawn and unanswered');
  const pn = await expect('children with no answer can be listed', G('/consents/pending?purpose=photo_media', X.A), [200]); log(pn.data.total === 2 && pn.data.students.every((s) => s._id !== String(X.st1._id)), 'a child who answered is not chased');
  await expect('a parent purpose cannot be chased by child', G('/consents/pending?purpose=news_messages', X.A), [400]);
  const lst = await G('/consents?purpose=photo_media', X.A); log(lst.data.consents.length === 1 && lst.data.consents[0].state === 'withdrawn', 'the register lists the newest row only');
  const lh = await G('/consents?purpose=photo_media&history=1', X.A); log(lh.data.consents.length === 3, 'or every row when asked');
  // a campus admin sees only consents of their campus (Mainkid is on Main, Northkid on North)
  await expect('the office records for a North child', PO('/consents', { ...base1, subjectId: String(X.st2._id) }, X.A), [201]);
  const sc2 = await G('/consents', X.A2); log(sc2.data.consents.length === 1 && sc2.data.consents[0].subjectName.includes('Northkid'), 'a campus admin sees only the consents of their campus');
  await expect('and cannot record for a child of another campus', PO('/consents', base1, X.A2), [404]); await expect('or read their history', G(`/consents/history?subjectType=student&subjectId=${X.st1._id}&purpose=photo_media`, X.A2), [404]);
  await expect('or record staff consent', PO('/consents', { subjectType: 'teacher', subjectId: String(X.t._id), purpose: 'staff_directory', givenByName: 'Teacher', method: 'paper' }, X.A2), [403]);
  const smC = await G('/consents/summary', X.A2); log(smC.data.students === 1 && smC.data.purposes.find((p) => p.key === 'photo_media').granted === 1 && smC.data.purposes.find((p) => p.key === 'photo_media').unanswered === 0,  'the summary is limited to the campus too');
  await expect('school-wide admin records staff consent', PO('/consents', { subjectType: 'teacher', subjectId: String(X.t._id), purpose: 'staff_directory', givenByName: 'Teacher', method: 'in-person' }, X.A), [201]);

  // ── 6. indexes and audit ──
  const q = await require('../lib/pgdoc').db.get().query('SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema()'); const idx = (M) => q.rows.filter((r) => r.tablename === mg.model(M).table).length;
  log(idx('Campus') >= 4 && idx('CampusMembership') >= 4 && idx('Consent') >= 7 && idx('Organization') >= 3 && idx('PermissionGrant') >= 5, `the new tables are indexed (campus ${idx('Campus')}, membership ${idx('CampusMembership')}, consent ${idx('Consent')}, organization ${idx('Organization')}, grants ${idx('PermissionGrant')})`);
  const acts = (await AuditLog.find({ schoolId: X.s._id })).map((a) => a.action); const want = ['campus.create', 'campus.update', 'campus.assign-classes', 'campus.member-add', 'campus.member-remove', 'consent.grant', 'consent.withdraw', 'permission.grant', 'permission.revoke'];
  log(want.every((w) => acts.includes(w)) && !!(await AuditLog.findOne({ action: 'organization.attach' })), `every change here is written to the audit trail (${want.filter((w) => !acts.includes(w)).join(',') || 'all present'})`);
};
