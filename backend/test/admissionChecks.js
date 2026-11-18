// Admissions CRM (E04): pipeline, duplicates, seats and waitlist, enrollment.
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Class = require('../models/Class'); const Student = require('../models/Student'); const Parent = require('../models/Parent');
  const Inquiry = require('../models/AdmissionInquiry'); const App = require('../models/AdmissionApplication'); const Capacity = require('../models/AdmissionCapacity');
  const GuardianLink = require('../models/GuardianLink'); const AuditLog = require('../models/AuditLog'); const Notification = require('../models/Notification'); const User = require('../models/User');
  const A = tokens.admin; const base = `http://localhost:${process.env.TEST_PORT || ''}`;
  console.log('\n— Admissions CRM —');

  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id);
  await Promise.all([Inquiry.deleteMany({ schoolId: sid }), App.deleteMany({ schoolId: sid }), Capacity.deleteMany({ schoolId: sid })]);
  const cls = (await Class.find({ schoolId: sid }))[0]; const grade = cls.standard; const YEAR = '2030-2031';
  const dob = '2020-03-04';

  // who may use it
  await expect('teacher cannot list applications', call('GET', '/admissions/applications', tokens.teacher), [401, 403]);
  await expect('parent cannot create an inquiry', call('POST', '/admissions/inquiries', tokens.parent, { contactName: 'x', phone: '0300' }), [401, 403]);
  await expect('unauthenticated refused', call('GET', '/admissions/summary', null), [401]);

  // inquiries
  await expect('inquiry needs a name', call('POST', '/admissions/inquiries', A, { phone: '0300' }), [400]);
  await expect('inquiry needs a way to reply', call('POST', '/admissions/inquiries', A, { contactName: 'Mr Zahid' }), [400]);
  await expect('inquiry email is checked', call('POST', '/admissions/inquiries', A, { contactName: 'Mr Zahid', email: 'nope' }), [400]);
  const inq = (await expect('office records an inquiry', call('POST', '/admissions/inquiries', A, { contactName: 'Mr Zahid Khan', phone: '0300-1112223', email: 'zahid@family.test', source: 'phone', nextFollowUpOn: '2020-01-01' }), [201])).data.inquiry;
  const pub = await call('POST', '/public/schools/DEMO01/inquiry', null, { contactName: 'Website Family', email: 'web@family.test', note: 'Fees for grade 1?' });
  log(pub.status === 201 && (await Inquiry.findOne({ schoolId: sid, source: 'website' })), 'the website form creates an inquiry with source "website"');
  await expect('website form for an unknown school', call('POST', '/public/schools/NOPE99/inquiry', null, { contactName: 'x', phone: '1' }), [404]);
  const before = await Inquiry.countDocuments({ schoolId: sid });
  await call('POST', '/public/schools/DEMO01/inquiry', null, { contactName: 'Bot', phone: '1', website: 'http://spam' });
  log((await Inquiry.countDocuments({ schoolId: sid })) === before, 'a filled honeypot field is silently dropped');
  log((await Notification.countDocuments({ title: 'New admission inquiry' })) >= 1, 'admins are told about a website inquiry');
  await expect('closing an inquiry needs a reason', call('PUT', `/admissions/inquiries/${(await Inquiry.findOne({ source: 'website', schoolId: sid }))._id}`, A, { status: 'Closed' }), [400]);

  // applications
  await expect('application needs a child name', call('POST', '/admissions/applications', A, { inquiryId: inq._id, gradeSought: grade }), [400]);
  await expect('application needs a grade', call('POST', '/admissions/applications', A, { inquiryId: inq._id, child: { name: 'Zayd Khan' } }), [400]);
  await expect('date of birth cannot be in the future', call('POST', '/admissions/applications', A, { inquiryId: inq._id, gradeSought: grade, child: { name: 'Zayd Khan', dateOfBirth: '2099-01-01' } }), [400]);
  await expect('unknown inquiry', call('POST', '/admissions/applications', A, { inquiryId: '000000000000000000000000', gradeSought: grade, child: { name: 'Zayd Khan' } }), [404]);
  const mk = (o) => call('POST', '/admissions/applications', A, { academicYear: YEAR, gradeSought: grade, ...o });
  const a1 = (await expect('application for the first child', mk({ inquiryId: inq._id, child: { name: 'Zayd Khan', dateOfBirth: dob, gender: 'Male' }, guardian: { name: 'Zahid Khan', phone: '0300-1112223', email: 'zahid@family.test', relationship: 'Father' } }), [201])).data.application;
  const a2 = (await expect('a sibling shares the same inquiry', mk({ inquiryId: inq._id, child: { name: 'Maryam Khan', dateOfBirth: '2019-02-02', gender: 'Female' } }), [201])).data.application;
  log(String(a1.inquiryId) === String(a2.inquiryId) && a1.inquiryId, 'every application keeps its source inquiry, and siblings share one');
  log((await Inquiry.findById(inq._id)).status === 'Applied', 'the inquiry is marked as applied');
  await expect('a closed inquiry cannot take applications', call('PUT', `/admissions/inquiries/${inq._id}`, A, { status: 'Closed', closedReason: 'x' }), [422]);
  const direct = (await expect('an application without an inquiry creates its own source', mk({ source: 'walk-in', child: { name: 'Hamza Ali', dateOfBirth: '2020-05-05' }, guardian: { name: 'Ali Raza', phone: '0311-5550001' } }), [201])).data.application;
  log(!!(await Inquiry.findById(direct.inquiryId)), 'the new source inquiry exists');

  // duplicates
  const dupApp = (await expect('same child again', mk({ child: { name: 'zayd  KHAN', dateOfBirth: dob }, guardian: { name: 'Z', phone: '0300 1112223' } }), [201]));
  log(dupApp.data.possibleDuplicates >= 1 && dupApp.data.application.duplicateFlags[0].kind === 'application', 'the same name and birth date is flagged as a possible duplicate');
  const stu = await Student.findOne({ schoolId: sid }); await Student.updateOne({ _id: stu._id }, { $set: { phone: '0322-9998887' } });
  const dupStu = (await mk({ child: { name: stu.name }, guardian: { name: 'Someone', phone: '0322 9998887' } })).data;
  log(dupStu.application.duplicateFlags.some((d) => d.kind === 'student'), 'a current student with the same name and phone is flagged');
  const other = (await mk({ child: { name: 'Totally Different', dateOfBirth: '2020-09-09' }, guardian: { name: 'N', phone: '0333-0000000' } })).data;
  log(other.possibleDuplicates === 0, 'an unrelated child is not flagged');
  const d1 = dupApp.data.application; const flag = d1.duplicateFlags[0];
  await expect('resolving needs a note', call('POST', `/admissions/applications/${d1._id}/duplicates`, A, { kind: flag.kind, refId: flag.refId, resolution: 'duplicate' }), [400]);
  await expect('resolution must be valid', call('POST', `/admissions/applications/${d1._id}/duplicates`, A, { kind: flag.kind, refId: flag.refId, resolution: 'maybe', note: 'abc' }), [400]);
  const merged = (await expect('a person confirms it is the same child', call('POST', `/admissions/applications/${d1._id}/duplicates`, A, { kind: flag.kind, refId: flag.refId, resolution: 'duplicate', note: 'Checked B-Form numbers, same child' }))).data.application;
  log(merged.stage === 'Withdrawn' && String(merged.mergedIntoId) === String(a1._id), 'a confirmed duplicate is withdrawn and points to the original');
  await expect('the same match cannot be decided twice', call('POST', `/admissions/applications/${d1._id}/duplicates`, A, { kind: flag.kind, refId: flag.refId, resolution: 'not-duplicate', note: 'abc' }), [422]);
  const s2 = dupStu.application; const sf = s2.duplicateFlags.find((d) => d.kind === 'student');
  const cleared = (await call('POST', `/admissions/applications/${s2._id}/duplicates`, A, { kind: 'student', refId: sf.refId, resolution: 'not-duplicate', note: 'Different family, same name' })).data.application;
  log(cleared.stage === 'New' && cleared.duplicateFlags[0].resolution === 'not-duplicate', 'a "different child" decision clears the flag and keeps the application');
  const dd = (await mk({ child: { name: 'Maryam Khan', dateOfBirth: '2019-02-02' }, guardian: { name: 'Z', phone: '0300-1112223' } })).data.application;
  await call('POST', `/admissions/applications/${dd._id}/stage`, A, { stage: 'Interview' });
  for (const k of (await call('GET', `/admissions/applications/${dd._id}`, A)).data.application.checklist.filter((c) => c.required).map((c) => c.key)) await call('POST', `/admissions/applications/${dd._id}/checklist/${k}`, A, { verified: true });
  const blockedDup = await call('POST', `/admissions/applications/${dd._id}/stage`, A, { stage: 'Offered' });
  log(blockedDup.status === 422 && /duplicate/i.test(blockedDup.data.message), 'a pending duplicate blocks an offer until a person decides');
  await call('POST', `/admissions/applications/${dd._id}/duplicates`, A, { kind: 'application', refId: String(a2._id), resolution: 'duplicate', note: 'Same child entered twice' });

  // seats
  await expect('seats must be a whole number', call('PUT', '/admissions/capacity', A, { academicYear: YEAR, gradeSought: grade, seats: 1.5 }), [400]);
  await expect('seats are set for a grade', call('PUT', '/admissions/capacity', A, { academicYear: YEAR, gradeSought: grade, seats: 1 }));
  const cap = (await call('GET', `/admissions/capacity?year=${YEAR}`, A)).data.grades.find((g) => g.grade === grade);
  log(cap.seats === 1 && cap.available === 1, 'the seat count is shown');

  // stages
  const st = (id, body) => call('POST', `/admissions/applications/${id}/stage`, A, body);
  await expect('cannot jump from New to Offered', st(a1._id, { stage: 'Offered' }), [422]);
  await expect('Enrolled is only reachable through Enroll', st(a1._id, { stage: 'Enrolled' }), [400]);
  await expect('unknown stage', st(a1._id, { stage: 'Banana' }), [400]);
  await expect('an interview needs a sensible time', st(a1._id, { stage: 'Interview', interviewAt: '2001-01-01' }), [400]);
  await expect('move to interview', st(a1._id, { stage: 'Interview', interviewAt: new Date(Date.now() + 864e5).toISOString() }));
  const offerBlocked = await st(a1._id, { stage: 'Offered' });
  log(offerBlocked.status === 422 && /Birth certificate/.test(offerBlocked.data.message), 'an offer is refused until required documents are verified');
  const keys = (await call('GET', `/admissions/applications/${a1._id}`, A)).data.application.checklist.filter((c) => c.required).map((c) => c.key);
  for (const k of keys) await expect(`verify ${k}`, call('POST', `/admissions/applications/${a1._id}/checklist/${k}`, A, { verified: true }));
  await expect('unknown checklist item', call('POST', `/admissions/applications/${a1._id}/checklist/zzz`, A, {}), [404]);
  await expect('a custom document can be added', call('POST', `/admissions/applications/${a1._id}/checklist/new`, A, { label: 'Vaccination card', required: false }));
  const det = (await call('GET', `/admissions/applications/${a1._id}`, A)).data;
  await expect('a stale screen gets a 409', st(a1._id, { stage: 'Offered', version: '2020-01-01T00:00:00.000Z' }), [409]);
  const offered = await expect('offer made, seat reserved', st(a1._id, { stage: 'Offered', version: det.application.version }));
  log(offered.data.application.seatReserved === true, 'the seat is held');
  log((await call('GET', `/admissions/capacity?year=${YEAR}`, A)).data.grades.find((g) => g.grade === grade).available === 0, 'no seats are left');

  // a2 and the sibling's friends: waitlist order
  const w = async (id) => { await st(id, { stage: 'Interview' }); const ks = (await call('GET', `/admissions/applications/${id}`, A)).data.application.checklist.filter((c) => c.required).map((c) => c.key); for (const k of ks) await call('POST', `/admissions/applications/${id}/checklist/${k}`, A, { verified: true }); };
  await w(a2._id); await w(direct._id);
  const full = await st(a2._id, { stage: 'Offered' });
  log(full.status === 422 && /no free seat/i.test(full.data.message), 'with no seat free the offer is refused and the waitlist is suggested');
  await expect('first child joins the waitlist', st(a2._id, { stage: 'Waitlisted' }));
  await new Promise((r) => setTimeout(r, 20));
  await expect('second child joins the waitlist', st(direct._id, { stage: 'Waitlisted' }));
  const q = (await call('GET', `/admissions/applications/${direct._id}`, A)).data.seats;
  log(q.queuePosition === 2 && q.waiting === 2, 'the queue position is shown');
  await expect('rejecting needs a reason', st(a1._id, { stage: 'Rejected' }), [400]);
  const wd = (await expect('the holder withdraws', st(a1._id, { stage: 'Withdrawn', note: 'Family moved to another city' }))).data;
  log(wd.nextInLine === 'Maryam Khan', 'the next child in the waitlist queue is named');
  log((await Notification.countDocuments({ title: new RegExp(`seat opened in grade ${grade}`) })) >= 1, 'admins are told a seat opened');
  const skip = await st(direct._id, { stage: 'Offered' });
  log(skip.status === 422 && /waiting longer/.test(skip.data.message), 'the queue cannot be skipped without a reason');
  await expect('the queue can be skipped with a recorded reason', st(direct._id, { stage: 'Offered', skipQueueReason: 'Sibling already enrolled' }));
  await expect('a held seat cannot be shrunk away', call('PUT', '/admissions/capacity', A, { academicYear: YEAR, gradeSought: grade, seats: 0 }), [422]);
  await expect('the grade cannot change while holding a seat', call('PUT', `/admissions/applications/${direct._id}`, A, { gradeSought: '99' }), [422]);

  // accept and enroll
  await expect('cannot enroll before acceptance', call('POST', `/admissions/applications/${direct._id}/enroll`, A, {}), [422]);
  await expect('family accepts', st(direct._id, { stage: 'Accepted', note: 'Parent confirmed by phone' }));
  await call('PUT', `/admissions/applications/${direct._id}`, A, { guardian: { email: 'ali.raza@family.test' } });   // rejected while Accepted? no: still open
  const studentsBefore = await Student.countDocuments({ schoolId: sid });
  const en = await expect('enroll creates the student, guardian and rights in one step', call('POST', `/admissions/applications/${direct._id}/enroll`, A, { classId: String(cls._id) }), [201]);
  log(en.data.student.admissionNumber === '2030-0001' && !!en.data.student.temporaryPassword, 'an admission number and a first password are issued');
  log((await Student.countDocuments({ schoolId: sid })) === studentsBefore + 1, 'one student was created');
  const stuNew = await Student.findOne({ _id: en.data.student._id });
  log(String(stuNew.classId) === String(cls._id) && stuNew.name === 'Hamza Ali', 'the student is in the chosen class');
  const par = await Parent.findOne({ schoolId: sid, email: 'ali.raza@family.test' });
  log(!!par && par.children.map(String).includes(String(stuNew._id)), 'a parent account was created and linked');
  const gl = await GuardianLink.findOne({ schoolId: sid, studentId: stuNew._id });
  log(!!gl && gl.isPrimary === true && String(gl.parentId) === String(par._id), 'guardian rights exist from the first day');
  const lg = await call('POST', '/auth/login', null, { email: en.data.student.email, password: en.data.student.temporaryPassword, schoolCode: 'DEMO01' });
  log(lg.status === 200, 'the new student can sign in');
  const again = await call('POST', `/admissions/applications/${direct._id}/enroll`, A, {});
  log(again.status === 200 && again.data.alreadyEnrolled && (await Student.countDocuments({ schoolId: sid })) === studentsBefore + 1, 'pressing Enroll twice never creates a second student');
  await expect('an enrolled application cannot be edited', call('PUT', `/admissions/applications/${direct._id}`, A, { interviewNote: 'x' }), [422]);

  // follow-ups and pipeline
  await call('POST', '/admissions/inquiries', A, { contactName: 'Late Caller', phone: '0344-1', nextFollowUpOn: '2020-02-02' });
  const sm = (await call('GET', '/admissions/summary', A)).data;
  log(sm.stages.Enrolled === 1 && sm.stages.Withdrawn >= 2 && sm.followUpsDue.some((f) => f.kind === 'inquiry' && f.name === 'Late Caller'), 'the pipeline counts and overdue follow-ups are shown');
  const list = (await call('GET', `/admissions/applications?open=1&search=maryam`, A)).data;
  log(list.applications.length === 1 && list.applications[0].child.name === 'Maryam Khan', 'search and the open filter work');

  // tenant isolation
  await expect('owner creates another school', call('POST', '/superadmin/schools', tokens.superadmin, { name: 'Adm Test School', code: 'ADM02', email: 'a@school.test', phone: '0514444444', adminName: 'A Admin', adminEmail: 'aadmin@school.test', adminPassword: 'Admin@12345' }), [201]);
  const lb = await call('POST', '/auth/login', null, { email: 'aadmin@school.test', password: 'Admin@12345', schoolCode: 'ADM02' }); const B = lb.data.token || lb.data.accessToken;
  log((await call('GET', '/admissions/applications', B)).data.applications.length === 0, 'another school sees none of these applications');
  await expect('another school cannot read one', call('GET', `/admissions/applications/${a2._id}`, B), [404]);
  await expect('another school cannot change its stage', call('POST', `/admissions/applications/${a2._id}/stage`, B, { stage: 'Rejected', note: 'hack' }), [404]);
  await expect('another school cannot enroll it', call('POST', `/admissions/applications/${a2._id}/enroll`, B, {}), [404]);
  await expect('another school cannot apply on our inquiry', call('POST', '/admissions/applications', B, { inquiryId: inq._id, gradeSought: '1', child: { name: 'Mallory' } }), [404]);
  const dupAcross = (await call('POST', '/admissions/applications', B, { gradeSought: '1', child: { name: 'Zayd Khan', dateOfBirth: dob }, guardian: { name: 'Z', phone: '0300 1112223' } }));
  log(dupAcross.data.possibleDuplicates === 0, 'duplicate checks never look across schools');
  await expect('owner removes it', call('DELETE', `/superadmin/schools/${(await School.findOne({ code: 'ADM02' }))._id}`, tokens.superadmin, { confirmCode: 'ADM02' }));

  const acts = (await AuditLog.find({ schoolId: sid, action: /^admissions\./ })).map((x) => x.action);
  log(['admissions.inquiry.create', 'admissions.application.create', 'admissions.stage', 'admissions.checklist', 'admissions.duplicate.resolve', 'admissions.capacity', 'admissions.enroll'].every((x) => acts.includes(x)), 'every admissions change is audited');
  await Parent.deleteMany({ schoolId: sid, email: 'ali.raza@family.test' });
};
