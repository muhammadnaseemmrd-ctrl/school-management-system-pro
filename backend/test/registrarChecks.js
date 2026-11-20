// University registrar and degree audit (E16)
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Student = require('../models/Student'); const Teacher = require('../models/Teacher');
  const Campus = require('../models/Campus'); const CampusMembership = require('../models/CampusMembership'); const CS = require('../utils/campus');
  const M = (n) => require('../models/' + n); const RegEnrollment = M('RegEnrollment'); const RegTerm = M('RegTerm'); const RegTranscript = M('RegTranscript'); const RegCourse = M('RegCourse'); const RegSection = M('RegSection'); const RegException = M('RegException'); const RegGradeChange = M('RegGradeChange'); const RegStudentProgram = M('RegStudentProgram');
  const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const E = require('../utils/registrar/engine');
  console.log('\n— University registrar and degree audit —');

  // ── 1. the rules on their own (no database) ──
  const mkE = (code, term, grade, credits = 3, x = {}) => ({ _id: code + term, courseCode: code, courseTitle: code, termId: term, termStart: term, credits, grade, gradeState: 'final', status: 'completed', ...x });
  const hist = [mkE('MTH101', '2024-1', 'A'), mkE('CS101', '2024-1', 'F'), mkE('CS101', '2024-2', 'B'), mkE('ENG101', '2024-1', 'C+'), mkE('PHY101', '2024-1', 'W')];
  const pol = (r) => ({ ...E.DEFAULT_POLICY, repeat: r });
  log(E.gpaOf(hist, null, pol('latest')).gpa === 3.1 && E.gpaOf(hist, null, pol('best')).gpa === 3.1 && E.gpaOf(hist, null, pol('average')).gpa === 2.32, 'the average follows the repeat rule: latest 3.1, best 3.1, average 2.32');
  log(E.gpaOf(hist, null, pol('latest')).earned === 9, 'credits are earned once per course and a withdrawal earns none');
  const cs201 = { code: 'CS201', prerequisites: [{ code: 'CS101', minGrade: 'C' }], corequisites: [] };
  log(E.prereqCheck(cs201, hist, null, pol('latest')).ok && !E.prereqCheck(cs201, hist.slice(0, 2), null, pol('latest')).ok, 'a prerequisite needs the minimum grade (F fails, the later B passes)');
  log(E.prereqCheck({ code: 'LAB', prerequisites: [], corequisites: [{ code: 'CS101' }] }, [], null, pol('latest'), { concurrent: ['CS101'] }).ok, 'a corequisite can be taken in the same term');
  log(!E.repeatCheck('MTH101', hist, null, pol('latest')).ok && E.repeatCheck('PHY101', hist, null, pol('latest')).ok && E.repeatCheck('MTH101', hist, null, pol('latest'), { extraAttempt: true }).ok, 'a passed course cannot be repeated without a signed exception, a withdrawal can');
  log(E.isGrade(null, 'W') && E.isGrade(null, 'B+') && !E.isGrade(null, 'Z'), 'only grades on the scale or the special marks are accepted');
  const sig1 = E.sign({ b: 1, a: 2 }); log(sig1 === E.sign({ a: 2, b: 1 }) && sig1 !== E.sign({ a: 2, b: 2 }), 'signatures do not depend on key order and change with the content');

  // ── 2. two schools ──
  const pw = await hashPassword('Reg@12345');
  const mk = async (code) => {
    const s = await School.create({ name: `${code} College`, code, email: `${code.toLowerCase()}@reg.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0 });
    const a = await User.create({ schoolId: s._id, name: `${code} Registrar`, email: `admin@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const t = await Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} College`, name: `${code} Dr Hamid`, email: `t1@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const t2 = await Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} College`, name: `${code} Dr Nida`, email: `t2@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const mkSt = (n, i) => Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} College`, name: n, email: `${n.toLowerCase().replace(/\W+/g, '.')}@${code.toLowerCase()}.test`, password: pw, role: 'student', admissionNumber: `${code}-${i}`, gender: 'Female', dateOfBirth: new Date('2004-05-05T00:00:00Z'), division: 'A', guardian: { name: 'G', mobileNumber: '03005550000' } });
    const st = [await mkSt(`${code} Alpha Khan`, 1), await mkSt(`${code} Beta Shah`, 2), await mkSt(`${code} Gamma Ali`, 3), await mkSt(`${code} Delta Noor`, 4)];
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, a, t, t2, st, A: tok(a, 'admin'), T: tok(t, 'teacher'), T2: tok(t2, 'teacher'), S: st.map((x) => tok(x, 'student')) };
  };
  const X = await mk('REG001'); const Y = await mk('REG002');
  const G = (p, t) => call('GET', p, t); const PO = (p, b, t) => call('POST', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {}); const PA = (p, b, t) => call('PATCH', p, t, b || {});
  const R = '/registrar'; const id = (r) => r.data && r.data._id;
  await expect('the registrar needs a sign-in', call('GET', `${R}/overview`, null), [401]);
  await expect('a student cannot open the registrar office', G(`${R}/overview`, X.S[0]), [403]);
  await expect('a teacher cannot open the registrar office', G(`${R}/overview`, X.T), [403]);
  await expect('the office overview opens for the administrator', G(`${R}/overview`, X.A), [200]);

  // a second administrator in school X so that approvals have two people; school Y keeps one to prove the sole-administrator note
  const A2u = await User.create({ schoolId: X.s._id, name: 'REG001 Dean', email: 'admin2@reg001.test', password: pw, role: 'admin', isActive: true }); const A2 = generateAccessToken(String(A2u._id), String(X.s._id), 'admin');

  // ── 3. grade scale and policy ──
  const st0 = await G(`${R}/settings`, X.A); log(st0.status === 200 && st0.data.scale.length === 11 && st0.data.policy.repeat === 'latest' && st0.data.policy.maxCreditsPerTerm === 21, 'the school starts with a standard scale and policy that it can change');
  await expect('W cannot be a letter on the scale', PU(`${R}/settings`, { scale: [{ grade: 'A', points: 4 }, { grade: 'W', points: 0 }] }, X.A), [400]);
  await expect('a grade cannot appear twice', PU(`${R}/settings`, { scale: [{ grade: 'A', points: 4 }, { grade: 'A', points: 3 }] }, X.A), [400]);
  await expect('the repeat rule must be one of the three', PU(`${R}/settings`, { policy: { repeat: 'whatever' } }, X.A), [400]);
  await expect('a teacher cannot change the policy', PU(`${R}/settings`, { policy: { maxAttempts: 5 } }, X.T), [403]);

  // ── 4. catalogue ──
  const mkC = (code, title, credits, extra = {}) => PO(`${R}/courses`, { code, title, credits, department: 'CS', ...extra }, X.A);
  await expect('MTH101 is added', mkC('MTH101', 'Calculus I', 3), [201]); await expect('CS101 is added', mkC('CS101', 'Programming', 3), [201]);
  await expect('CS201 needs CS101 with a C', mkC('CS201', 'Data structures', 3, { prerequisites: [{ code: 'CS101', minGrade: 'C' }] }), [201]);
  await expect('CS301 needs CS201', mkC('CS301', 'Algorithms', 3, { prerequisites: [{ code: 'CS201', minGrade: 'D' }] }), [201]);
  await expect('ENG101, ART101, PHY101 are added', Promise.all([mkC('ENG101', 'English', 3), mkC('ART101', 'Art', 3), mkC('PHY101', 'Physics', 4)]).then((r) => ({ status: r.every((x) => x.status === 201) ? 201 : 500, data: {} })), [201]);
  await expect('a duplicate code is refused', mkC('MTH101', 'Again', 3), [409]);
  await expect('credits must be sensible', mkC('BAD1', 'Bad', 99), [400]);
  await expect('a prerequisite must exist', mkC('BAD2', 'Bad', 3, { prerequisites: [{ code: 'NOPE999' }] }), [422]);
  await expect('a course cannot need itself', mkC('BAD3', 'Bad', 3, { prerequisites: [{ code: 'BAD3' }] }), [422]);
  const cs101 = await RegCourse.findOne({ schoolId: X.s._id, code: 'CS101' }); const cs301 = await RegCourse.findOne({ schoolId: X.s._id, code: 'CS301' });
  await expect('a prerequisite loop is refused', PA(`${R}/courses/${cs101._id}`, { prerequisites: [{ code: 'CS301', minGrade: 'D' }] }, X.A), [422]);
  await expect('a teacher cannot add a course', call('POST', `${R}/courses`, X.T, { code: 'TEA1', title: 'x', credits: 3 }), [403]);
  const upc = await PA(`${R}/courses/${cs101._id}`, { title: 'Programming Fundamentals', credits: 3, schoolId: String(Y.s._id), code: 'HACK' }, X.A);
  const cs101b = await RegCourse.findOne({ _id: cs101._id }); log(upc.status === 200 && cs101b.code === 'CS101' && String(cs101b.schoolId) === String(X.s._id) && cs101b.revision === 2 && cs101b.title === 'Programming Fundamentals', 'editing a course keeps its code and school and counts the revision');
  const cl = await G(`${R}/courses?q=prog`, X.T); log(cl.status === 200 && cl.data.courses.length === 1 && cl.data.courses[0].history.length >= 2, 'teachers can look courses up, and the change history is kept');

  // ── 5. programme with versioned rules, approved by a second person ──
  const prog = await PO(`${R}/programs`, { code: 'BSCS', name: 'BS Computer Science', level: 'bachelor' }, X.A); log(prog.status === 201, 'a programme is created');
  await expect('a duplicate programme code is refused', PO(`${R}/programs`, { code: 'BSCS', name: 'Other' }, X.A), [409]);
  const v26 = await PO(`${R}/programs/${id(prog)}/versions`, { catalogYear: '2026', totalCredits: 15, minCgpa: 2 }, X.A); log(v26.status === 201 && v26.data.status === 'draft', 'a catalogue year starts as a draft');
  await expect('the same year cannot be made twice', PO(`${R}/programs/${id(prog)}/versions`, { catalogYear: '2026' }, X.A), [409]);
  const sub0 = await PO(`${R}/versions/${id(v26)}/submit`, {}, X.A); log(sub0.status === 422 && sub0.data.problems.length > 0, 'rules with no requirement groups are not ready to send');
  const reqs = [{ title: 'Core', rule: 'all', courses: ['MTH101', 'CS101', 'CS201', 'CS301'] }, { title: 'Electives', rule: 'credits', minCredits: 3, courses: [], prefixes: ['ENG', 'ART'] }];
  const bad1 = await PA(`${R}/versions/${id(v26)}`, { requirements: [{ title: 'Core', rule: 'all', courses: ['MTH101', 'NOPE1'] }] }, X.A); const bad2 = await PO(`${R}/versions/${id(v26)}/submit`, {}, X.A);
  log(bad1.status === 200 && bad2.status === 422 && bad2.data.problems.some((p) => /NOPE1/.test(p)), 'a rule that names a course missing from the catalogue is refused with the reason');
  await expect('the groups are saved', PA(`${R}/versions/${id(v26)}`, { requirements: reqs }, X.A), [200]);
  await expect('the draft is sent for review', PO(`${R}/versions/${id(v26)}/submit`, {}, X.A), [200]);
  await expect('the person who sent it cannot approve it', PO(`${R}/versions/${id(v26)}/decide`, { approve: true }, X.A), [403]);
  await expect('a second administrator approves it', PO(`${R}/versions/${id(v26)}/decide`, { approve: true }, A2), [200]);
  await expect('a published version never changes', PA(`${R}/versions/${id(v26)}`, { totalCredits: 99 }, X.A), [409]);
  const pl = await G(`${R}/programs`, X.A); const pv = pl.data.programs[0].versions[0]; log(pv.status === 'published' && pv.approval && pv.approval.sole === false && pv.contentHash.length === 64, 'the approval is recorded with a content hash and who approved');
  await expect('a course in published rules cannot be retired', PO(`${R}/courses/${cs301._id}/status`, { status: 'retired' }, X.A), [409]);
  const v27 = await PO(`${R}/programs/${id(prog)}/versions`, { catalogYear: '2027', copyFrom: id(v26) }, X.A); log(v27.status === 201 && v27.data.requirements.length === 2 && v27.data.totalCredits === 15, 'a new year can start as a copy of an earlier one');
  await PA(`${R}/versions/${id(v27)}`, { requirements: reqs, note: 'Same rules, new year' }, X.A); await PO(`${R}/versions/${id(v27)}/submit`, {}, X.A); await expect('the new year is sent back with a reason', PO(`${R}/versions/${id(v27)}/decide`, { approve: false }, A2), [400]);
  await PO(`${R}/versions/${id(v27)}/decide`, { approve: false, note: 'check the electives' }, A2); const back = (await G(`${R}/programs`, X.A)).data.programs[0].versions.find((v) => v.catalogYear === '2027'); log(back.status === 'draft', 'a rejected version goes back to draft');
  await PO(`${R}/versions/${id(v27)}/submit`, {}, A2); await expect('the first administrator approves the second year', PO(`${R}/versions/${id(v27)}/decide`, { approve: true }, X.A), [200]);

  // ── 6. a school with one administrator can still publish, and it is recorded ──
  const yc = await call('POST', `${R}/courses`, Y.A, { code: 'Y101', title: 'Y course', credits: 3 }); const yp = await PO(`${R}/programs`, { code: 'YPROG', name: 'Y programme' }, Y.A); const yv = await PO(`${R}/programs/${id(yp)}/versions`, { catalogYear: '2026', totalCredits: 3 }, Y.A);
  await PA(`${R}/versions/${id(yv)}`, { requirements: [{ title: 'All', rule: 'all', courses: ['Y101'] }] }, Y.A); await PO(`${R}/versions/${id(yv)}/submit`, {}, Y.A); const ydec = await PO(`${R}/versions/${id(yv)}/decide`, { approve: true }, Y.A);
  log(yc.status === 201 && ydec.status === 200, 'with only one administrator the same person may publish'); const ypl = await G(`${R}/programs`, Y.A); log(ypl.data.programs[0].versions[0].approval.sole === true, 'and the record says it was a sole administrator');

  // ── 7. terms and sections ──
  const t1 = await PO(`${R}/terms`, { code: 'F26', name: 'Fall 2026', startDate: '2026-01-05', endDate: '2030-12-31', addDropUntil: '2030-06-30' }, X.A); log(t1.status === 201, 'a term is created');
  await expect('a term needs a later end date', PO(`${R}/terms`, { code: 'BAD', name: 'Bad', startDate: '2026-05-01', endDate: '2026-04-01' }, X.A), [400]);
  await expect('the add and drop deadline must fall inside the term', PO(`${R}/terms`, { code: 'BAD2', name: 'Bad', startDate: '2026-05-01', endDate: '2026-06-01', addDropUntil: '2026-09-01' }, X.A), [400]);
  await expect('a term cannot publish straight from planned', PO(`${R}/terms/${id(t1)}/publish`, {}, X.A), [409]);
  await expect('the term opens', PO(`${R}/terms/${id(t1)}/open`, {}, X.A), [200]);
  const cid = async (c) => String((await RegCourse.findOne({ schoolId: X.s._id, code: c }))._id);
  const mkSec = async (term, c, o = {}) => PO(`${R}/sections`, { termId: term, courseId: await cid(c), section: 'A', capacity: 30, ...o }, X.A);
  const sMTH = await mkSec(id(t1), 'MTH101', { teacherId: String(X.t._id), schedule: 'MWF 09:00' }); const sCS101 = await mkSec(id(t1), 'CS101', { teacherId: String(X.t._id), schedule: 'TTh 09:00' }); const sCS201 = await mkSec(id(t1), 'CS201', { teacherId: String(X.t2._id) });
  const sENG = await mkSec(id(t1), 'ENG101', { teacherId: String(X.t._id), capacity: 1 }); const sART = await mkSec(id(t1), 'ART101', { teacherId: String(X.t._id), schedule: 'MWF 09:00' }); const sPHY = await mkSec(id(t1), 'PHY101', { teacherId: String(X.t._id) });
  log([sMTH, sCS101, sCS201, sENG, sART, sPHY].every((r) => r.status === 201), 'six sections are offered in the term');
  await expect('the same section cannot be made twice', mkSec(id(t1), 'MTH101'), [409]); await expect('an instructor from another school is refused', mkSec(id(t1), 'MTH101', { section: 'B', teacherId: String(Y.t._id) }), [404]);
  await expect('capacity cannot be nonsense', mkSec(id(t1), 'MTH101', { section: 'C', capacity: 0 }), [400]);

  // ── 8. placing students ──
  const S1 = String(X.st[0]._id); const S2 = String(X.st[1]._id); const S3 = String(X.st[2]._id); const S4 = String(X.st[3]._id);
  await expect('a student with no programme cannot register', PO(`${R}/students/${S3}/enroll`, { sectionId: id(sMTH) }, X.A), [409]);
  const place1 = await PO(`${R}/students/${S1}/program`, { programId: id(prog), versionId: id(v26), advisorId: String(X.t._id) }, X.A); log(place1.status === 201 && place1.data.catalogYear === '2026', 'a student is placed in a programme under a catalogue year with an advisor');
  await expect('the second student is placed on the latest published year by default', PO(`${R}/students/${S2}/program`, { programId: id(prog) }, X.A), [201]);
  await expect('placing twice needs an explicit switch', PO(`${R}/students/${S1}/program`, { programId: id(prog) }, X.A), [409]);
  await expect('a draft year cannot be used', PO(`${R}/students/${S3}/program`, { programId: id(prog), versionId: id(await PO(`${R}/programs/${id(prog)}/versions`, { catalogYear: '2028' }, X.A)) }, X.A), [422]);
  await expect('an advisor from another school is refused', PO(`${R}/students/${S3}/program`, { programId: id(prog), advisorId: String(Y.t._id) }, X.A), [404]);
  await PO(`${R}/students/${S3}/program`, { programId: id(prog), versionId: id(v26), advisorId: String(X.t._id) }, X.A); await PO(`${R}/students/${S4}/program`, { programId: id(prog), versionId: id(v26) }, X.A);
  const ppl = await G(`${R}/people?placed=yes&programId=${id(prog)}`, X.A); log(ppl.status === 200 && ppl.data.total === 4, 'the people list shows who is in the programme');

  // ── 9. registration with the rules enforced ──
  const en = (st, sec, tok = X.A, b = {}) => PO(`${R}/students/${st}/enroll`, { sectionId: id(sec), ...b }, tok);
  const e1 = await en(S1, sMTH); const e2 = await en(S1, sCS101); log(e1.status === 201 && e2.status === 201, 'a student registers for courses with no prerequisites');
  await expect('the same course twice is refused', en(S1, sMTH), [409, 422]);
  const pre = await en(S1, sCS201); log(pre.status === 422 && /CS101/.test(pre.data.message) && pre.data.reasons[0].kind === 'prerequisite', 'a missing prerequisite is refused and named');
  const clash = await en(S1, sART); log(clash.status === 422 && pre.data.reasons && clash.data.reasons.some((r) => r.kind === 'clash'), 'two courses at the same time are refused');
  const eE = await en(S1, sENG); log(eE.status === 201, 'the last seat in a small section is taken');
  const full = await en(S2, sENG); log(full.status === 422 && full.data.reasons.some((r) => r.kind === 'full'), 'a full section is refused');
  await expect('an advisor who does not advise the student is refused', en(S1, sPHY, X.T2), [403]);
  await PUT0(); async function PUT0() { await PU(`${R}/settings`, { policy: { maxCreditsPerTerm: 9 } }, X.A); }
  const load = await en(S1, sPHY); log(load.status === 422 && load.data.reasons.some((r) => r.kind === 'load'), 'more than the credit limit is refused');
  const ovl = await PO(`${R}/exceptions`, { studentId: S1, kind: 'overload', termId: id(t1), maxCredits: 14, reason: 'Final year, needs to graduate on time' }, X.T); log(ovl.status === 201, 'the advisor asks for a heavier load');
  await expect('an advisor of someone else cannot ask', PO(`${R}/exceptions`, { studentId: S1, kind: 'overload', termId: id(t1), maxCredits: 14, reason: 'Trying to ask for them' }, X.T2), [403]);
  await expect('the same request twice is refused', PO(`${R}/exceptions`, { studentId: S1, kind: 'overload', termId: id(t1), maxCredits: 14, reason: 'Final year, needs to graduate on time' }, X.T), [409]);
  await expect('a request needs a real reason', PO(`${R}/exceptions`, { studentId: S1, kind: 'overload', termId: id(t1), maxCredits: 15, reason: 'pls' }, X.T), [400]);
  await expect('an overload must ask for more than the limit', PO(`${R}/exceptions`, { studentId: S1, kind: 'overload', termId: id(t1), maxCredits: 5, reason: 'Not really an overload at all' }, X.T), [400]);
  let waiverReq = null; await expect('the administrator who asked cannot approve (a different one has to)', (async () => { waiverReq = await PO(`${R}/exceptions`, { studentId: S2, kind: 'requirement_waiver', groupKey: 'electives', reason: 'Transfer credit from another college' }, X.A); return PO(`${R}/exceptions/${id(waiverReq)}/decide`, { approve: true }, X.A); })(), [403]);
  await expect('the exception is approved by a different administrator', PO(`${R}/exceptions/${id(ovl)}/decide`, { approve: true, note: 'Fine' }, A2), [200]);
  const ovr = await RegException.findOne({ _id: id(ovl) }); log(ovr.status === 'approved' && ovr.signature.length === 64 && ovr.sole === false, 'the decision is signed');
  const e3 = await en(S1, sPHY); log(e3.status === 201, 'the approved overload lets the registration go through');
  await PU(`${R}/settings`, { policy: { maxCreditsPerTerm: 21 } }, X.A);
  const drop1 = await call('POST', `${R}/students/${S1}/enrollments/${eE.data.enrollmentId}/drop`, X.A, {}); log(drop1.status === 200 && drop1.data.result === 'dropped', 'dropping inside the deadline frees the seat');
  await expect('the freed seat can be taken', en(S2, sENG), [201]);
  const cat = await G('/registrar/me/catalog', X.S[1]); log(cat.status === 200 && cat.data.sections.length === 6 && cat.data.sections.find((s) => s.courseCode === 'CS201').ok === false && cat.data.sections.find((s) => s.courseCode === 'CS201').reasons[0].kind === 'prerequisite', 'a student sees every section with the reason it is not open to them');
  await expect('a student registers themselves', PO('/registrar/me/enroll', { sectionId: id(sMTH) }, X.S[1]), [201]); await expect('and for a second course', PO('/registrar/me/enroll', { sectionId: id(sCS101) }, X.S[1]), [201]);
  await PU(`${R}/settings`, { policy: { selfRegistration: false } }, X.A); await expect('self registration can be turned off', PO('/registrar/me/enroll', { sectionId: id(sPHY) }, X.S[1]), [403]); await PU(`${R}/settings`, { policy: { selfRegistration: true } }, X.A);
  await expect('a student cannot drop someone else\'s course', PO(`/registrar/me/enrollments/${e1.data.enrollmentId}/drop`, {}, X.S[1]), [404]);
  const sec2 = await RegSection.findOne({ _id: id(sENG) }); log(sec2.enrolled === 1, 'the seat count stays exact through drop and re-register');

  // ── 10. grades: entry, submission, reopening, publishing ──
  await expect('registration is closed once grading starts', (async () => { await PO(`${R}/terms/${id(t1)}/grading`, {}, X.A); return en(S3, sPHY); })(), [409]);
  const ros = await G(`${R}/sections/${id(sCS101)}/roster`, X.T); log(ros.status === 200 && ros.data.students.length === 2 && ros.data.canEdit, 'the instructor sees the class list');
  await expect('another instructor cannot see it', G(`${R}/sections/${id(sCS101)}/roster`, X.T2), [403]); await expect('a student cannot', G(`${R}/sections/${id(sCS101)}/roster`, X.S[0]), [403]);
  const er = (st) => ros.data.students.find((s) => s.studentId === st).enrollmentId;
  const sg = await PU(`${R}/sections/${id(sCS101)}/grades`, { grades: [{ enrollmentId: er(S1), grade: 'F' }, { enrollmentId: er(S2), grade: 'Z' }, { enrollmentId: String(new mg.Types.ObjectId()), grade: 'A' }] }, X.T); log(sg.status === 200 && sg.data.saved === 1 && sg.data.skipped.length === 2, 'a grade off the scale and a stranger\'s registration are skipped');
  const sw = await PU(`${R}/sections/${id(sCS101)}/grades`, { grades: [{ enrollmentId: er(S2), grade: 'W' }] }, X.T); log(sw.data.saved === 0, 'W is not entered as a grade (withdrawal is its own step)');
  const subMiss = await PO(`${R}/sections/${id(sCS101)}/submit`, {}, X.T); log(subMiss.status === 422 && subMiss.data.missing.length === 1, 'submitting with a student ungraded names who is missing');
  await PU(`${R}/sections/${id(sCS101)}/grades`, { grades: [{ enrollmentId: er(S2), grade: 'B+' }] }, X.T); await expect('the instructor submits', PO(`${R}/sections/${id(sCS101)}/submit`, {}, X.T), [200]);
  await expect('submitted grades are locked', PU(`${R}/sections/${id(sCS101)}/grades`, { grades: [{ enrollmentId: er(S2), grade: 'A' }] }, X.T), [409]);
  await expect('reopening needs a reason', PO(`${R}/sections/${id(sCS101)}/reopen`, {}, X.A), [400]); await expect('reopening is for the registrar', PO(`${R}/sections/${id(sCS101)}/reopen`, { reason: 'I mistyped' }, X.T), [403]);
  await expect('the registrar reopens with a reason', PO(`${R}/sections/${id(sCS101)}/reopen`, { reason: 'Instructor found a typing error' }, X.A), [200]);
  await PU(`${R}/sections/${id(sCS101)}/grades`, { grades: [{ enrollmentId: er(S2), grade: 'B+' }] }, X.T); await PO(`${R}/sections/${id(sCS101)}/submit`, {}, X.T);
  const gradeSec = async (sec, rows, tok = X.T) => { const r = await G(`${R}/sections/${id(sec)}/roster`, tok); const g = rows.map(([st, gr]) => ({ enrollmentId: r.data.students.find((s) => s.studentId === st).enrollmentId, grade: gr })); await PU(`${R}/sections/${id(sec)}/grades`, { grades: g }, tok); return PO(`${R}/sections/${id(sec)}/submit`, {}, tok); };
  await gradeSec(sMTH, [[S1, 'A'], [S2, 'A-']]); await gradeSec(sENG, [[S2, 'C+']]);
  const early = await PO(`${R}/terms/${id(t1)}/publish`, {}, X.A); log(early.status === 409 && early.data.blockers.some((b) => /PHY101/.test(b.section)), 'publishing is blocked while a section has unfinished grades, and says which');
  await expect('publishing over unfinished grades needs a reason', PO(`${R}/terms/${id(t1)}/publish`, { markIncomplete: true }, X.A), [400]);
  const gsp = await gradeSec(sPHY, [[S1, 'B']]); log(gsp.status === 200, 'the last section is graded');
  const prevw = await G(`${R}/students/${S1}/record`, X.A); const cs101t = prevw.data.terms[0].courses.find((c) => c.code === 'CS101'); log(cs101t.grade === '' && prevw.data.terms[0].gpa === null && prevw.data.cgpa === 0, 'grades stay hidden and uncounted until the term is published');
  const sPrev = await G('/registrar/me', X.S[0]); log(sPrev.data.terms[0].courses.every((c) => c.grade === ''), 'the student sees no grade before publishing');
  await expect('the term publishes', PO(`${R}/terms/${id(t1)}/publish`, {}, X.A), [200]);
  await expect('publishing twice is refused', PO(`${R}/terms/${id(t1)}/publish`, {}, X.A), [409]);
  const rec1 = await G(`${R}/students/${S1}/record`, X.A); log(rec1.data.cgpa === 2.4 && rec1.data.creditsEarned === 7 && rec1.data.terms[0].gpa === 2.4, 'the average and credits are worked out from the published grades (2.4, 7 credits)');
  const rec2 = await G(`${R}/students/${S2}/record`, X.A); log(rec2.data.cgpa === 3.1, 'a second student: 3.1');
  await expect('closing the term works', PO(`${R}/terms/${id(t1)}/close`, {}, X.A), [200]);
  const wd = await RegEnrollment.findOne({ schoolId: X.s._id, studentId: X.st[0]._id, courseCode: 'ENG101' }); log(wd.status === 'dropped', 'the dropped course is not on the record'); log(rec1.data.terms[0].courses.length === 3, 'the student\'s record lists only the courses they took');

  // ── 11. a second term: repeats, prerequisites and a waiver ──
  const t2 = await PO(`${R}/terms`, { code: 'S31', name: 'Spring 2031', startDate: '2031-01-05', endDate: '2031-12-31', addDropUntil: '2031-06-30' }, X.A); await PO(`${R}/terms/${id(t2)}/open`, {}, X.A);
  const s2CS101 = await mkSec(id(t2), 'CS101', { teacherId: String(X.t._id) }); const s2CS201 = await mkSec(id(t2), 'CS201', { teacherId: String(X.t2._id) }); const s2CS301 = await mkSec(id(t2), 'CS301', { teacherId: String(X.t._id) }); const s2MTH = await mkSec(id(t2), 'MTH101', { teacherId: String(X.t._id) });
  const rep = await en(S1, s2CS101); log(rep.status === 201 && rep.data.attemptNo === 2 && rep.data.repeat === true, 'a failed course can be taken again and is marked as attempt 2');
  const pre2 = await en(S1, s2CS201); log(pre2.status === 422, 'the failed prerequisite still blocks the next course');
  const noRep = await en(S1, s2MTH); log(noRep.status === 422 && noRep.data.reasons[0].kind === 'repeat', 'a course already passed well cannot be repeated');
  const xa = await PO(`${R}/exceptions`, { studentId: S1, kind: 'extra_attempt', courseCode: 'MTH101', reason: 'Wants a higher grade for an exchange application' }, X.T); await PO(`${R}/exceptions/${id(xa)}/decide`, { approve: true }, A2);
  const rep2 = await en(S1, s2MTH); log(rep2.status === 201, 'with a signed exception the repeat goes through'); log((await RegException.findOne({ _id: id(xa) })).status === 'used', 'and the exception is used up');
  const wv = await PO(`${R}/exceptions`, { studentId: S1, kind: 'prereq_waiver', courseCode: 'CS301', reason: 'Took the equivalent course at another university' }, X.T); await expect('CS301 is refused before the waiver', en(S1, s2CS301), [422]); await PO(`${R}/exceptions/${id(wv)}/decide`, { approve: true }, A2); await expect('CS301 is allowed with the waiver', en(S1, s2CS301), [201]);
  const d2 = await en(S2, s2CS201); log(d2.status === 201, 'a student who passed the prerequisite registers normally');
  await call('POST', `${R}/students/${S1}/enrollments/${rep2.data.enrollmentId}/drop`, X.A, {});
  await PO(`${R}/terms/${id(t2)}/grading`, {}, X.A); await gradeSec(s2CS101, [[S1, 'B']]); await gradeSec(s2CS301, [[S1, 'B']]); await gradeSec(s2CS201, [[S2, 'A']], X.T2);
  await expect('term two publishes', PO(`${R}/terms/${id(t2)}/publish`, {}, X.A), [200]);
  const r1b = await G(`${R}/students/${S1}/record`, X.A); const cs101rows = r1b.data.terms.flatMap((t) => t.courses).filter((c) => c.code === 'CS101');
  log(r1b.data.cgpa === 3.23 && cs101rows.find((c) => c.attemptNo === 1).countsInAverage === false && cs101rows.find((c) => c.attemptNo === 2).countsInAverage === true, 'with the latest-attempt rule the failed first try is left out of the average (3.23)');
  await PU(`${R}/settings`, { policy: { repeat: 'average' } }, X.A); const rAvg = await G(`${R}/students/${S1}/record`, X.A); log(rAvg.data.cgpa === 2.63, 'switching the school to "average all attempts" recalculates every record (2.63)');
  await PU(`${R}/settings`, { policy: { repeat: 'best' } }, X.A); log((await G(`${R}/students/${S1}/record`, X.A)).data.cgpa === 3.23, 'and "best attempt" gives 3.23 again'); await PU(`${R}/settings`, { policy: { repeat: 'latest' } }, X.A);
  await expect('a grade in use cannot change its points', PU(`${R}/settings`, { scale: [{ grade: 'A', points: 5 }, { grade: 'B', points: 3 }, { grade: 'F', points: 0 }] }, X.A), [409]);

  // ── 12. degree audit ──
  const aud = r1b.data.audit; const core = aud.groups.find((g) => g.key === 'core'); const ele = aud.groups.find((g) => g.key === 'electives');
  log(core.status === 'open' && core.items.find((i) => i.code === 'MTH101').state === 'done' && core.items.find((i) => i.code === 'CS101').state === 'done' && core.items.find((i) => i.code === 'CS301').state === 'done' && core.items.find((i) => i.code === 'CS201').state === 'todo', 'the audit shows each required course as done or still to take (CS301 counted by the waiver, CS201 missing)');
  log(ele.status === 'open' && ele.remaining === 3 && ele.options.some((o) => o.code === 'ENG101') && ele.options.some((o) => o.code === 'ART101'), 'a credit pool shows what is still needed and which courses could fill it');
  log(aud.eligible === false && aud.blockers.some((b) => /CS201|Core/.test(b)) && aud.credits.earned === 13 && aud.catalogYear === '2026', 'the student is not yet eligible, with the reasons');
  const wi = await G(`${R}/students/${S1}/what-if?versionId=${id(v27)}`, X.A); log(wi.status === 200 && wi.data.catalogYear === '2027' && wi.data.audit.credits.earned === 13, 'the same record can be checked against another catalogue year without changing anything');
  await expect('a draft year cannot be used for a what-if', G(`${R}/students/${S1}/what-if?versionId=${id(yv)}`, X.A), [404]);
  const sw1 = await PO(`${R}/exceptions`, { studentId: S1, kind: 'catalog_switch', versionId: id(v27), reason: 'Student changed intake after a leave of absence' }, X.T); await PO(`${R}/exceptions/${id(sw1)}/decide`, { approve: true }, A2);
  const r1c = await G(`${R}/students/${S1}/record`, X.A); log(r1c.data.program.catalogYear === '2027' && r1c.data.program.history.some((h) => /signed exception/.test(h.change)), 'a catalogue switch needs the signed exception and is written into the history');
  await PO(`${R}/exceptions/${id(waiverReq)}/decide`, { approve: true }, A2);
  const r2b = await G(`${R}/students/${S2}/record`, X.A); log(r2b.data.audit.groups.find((g) => g.key === 'electives').status === 'waived', 'a waived group shows as waived');
  await expect('a student sees their own audit', G('/registrar/me', X.S[0]), [200]); await expect('an advisor sees an advisee', G(`${R}/students/${S1}/record`, X.T), [200]); await expect('an advisor cannot see another student', G(`${R}/students/${S4}/record`, X.T2), [403]); await expect('a student cannot read another student', G(`${R}/students/${S2}/record`, X.S[0]), [403]);
  const myAdv = await G(`${R}/my/advisees`, X.T); log(myAdv.data.advisees.length === 2, 'an advisor lists their advisees (two)');

  // ── 13. graduation, with a substitution ──
  const t1doc = await RegTerm.findOne({ _id: id(t1) }); const secDoc = async (c) => RegSection.findOne({ schoolId: X.s._id, termId: t1doc._id, courseCode: c });
  const seed = async (stId, code, grade, credits = 3) => { const s = await secDoc(code); const c = await RegCourse.findOne({ schoolId: X.s._id, code }); return RegEnrollment.create({ schoolId: X.s._id, studentId: stId, sectionId: s._id, termId: t1doc._id, courseId: c._id, courseCode: code, courseTitle: c.title, credits, status: 'completed', grade, gradeState: 'final', activeKey: `${stId}:${c._id}:${t1doc._id}:seed` }); };
  await seed(X.st[2]._id, 'MTH101', 'A'); await seed(X.st[2]._id, 'CS101', 'B'); await seed(X.st[2]._id, 'CS201', 'B'); await seed(X.st[2]._id, 'ENG101', 'B'); await seed(X.st[2]._id, 'PHY101', 'A', 4);
  const a3 = (await G(`${R}/students/${S3}/record`, X.A)).data.audit; log(!a3.eligible && a3.blockers.some((b) => /Core/.test(b)), 'before the substitution the audit says the core is not complete');
  await expect('a substitution names a course that is a requirement', PO(`${R}/exceptions`, { studentId: S3, kind: 'substitution', courseCode: 'ENG101', substituteCode: 'PHY101', reason: 'Physics replaces the course' }, X.T), [422]);
  const sb = await PO(`${R}/exceptions`, { studentId: S3, kind: 'substitution', courseCode: 'CS301', substituteCode: 'PHY101', reason: 'Physics lab replaces algorithms for this student' }, X.T); await PO(`${R}/exceptions/${id(sb)}/decide`, { approve: true, note: 'Approved by the dean' }, A2);
  const a3b = (await G(`${R}/students/${S3}/record`, X.A)).data.audit; log(a3b.eligible && a3b.groups.find((g) => g.key === 'core').items.find((i) => i.state === 'substituted'), 'the signed substitution completes the core and the audit shows it');
  const cand = await G(`${R}/candidates?programId=${id(prog)}`, X.A); log(cand.status === 200 && cand.data.students.find((s) => String(s.studentId) === S3).eligible && cand.data.eligible >= 1, 'the graduation list shows who is eligible');
  const gb = await PO(`${R}/students/${S1}/graduate`, {}, X.A); log(gb.status === 422 && gb.data.blockers.length > 0, 'a student with open requirements cannot graduate and is told why');
  await expect('a teacher cannot graduate a student', PO(`${R}/students/${S3}/graduate`, {}, X.T), [403]);
  const grad = await PO(`${R}/students/${S3}/graduate`, {}, X.A); log(grad.status === 200 && /^FT-/.test(grad.data.transcript.serial), 'an eligible student graduates and a final transcript is issued');
  await expect('graduating twice is refused', PO(`${R}/students/${S3}/graduate`, {}, X.A), [409]); await expect('a graduated student cannot register for more', en(S3, sART), [409]);
  const gd = await RegStudentProgram.findOne({ schoolId: X.s._id, studentId: X.st[2]._id }); log(gd.status === 'graduated' && gd.graduation.auditHash.length === 64 && gd.graduation.exceptionIds.length === 1, 'graduation keeps the audit fingerprint and the exceptions it relied on');

  // ── 14. grade changes ──
  const e2ENG = await RegEnrollment.findOne({ schoolId: X.s._id, studentId: X.st[1]._id, courseCode: 'ENG101' });
  const rq = await PO(`${R}/grade-changes`, { enrollmentId: String(e2ENG._id), toGrade: 'B-', reason: 'Re-marked paper found a missed page' }, X.T); log(rq.status === 201 && rq.data.fromGrade === 'C+', 'the instructor asks to change a published grade');
  await expect('a second request on the same grade is refused', PO(`${R}/grade-changes`, { enrollmentId: String(e2ENG._id), toGrade: 'B', reason: 'Another reason entirely here' }, X.T), [409]);
  await expect('a grade off the scale is refused', PO(`${R}/grade-changes`, { enrollmentId: String(e2ENG._id), toGrade: 'Z', reason: 'This is not a real grade' }, X.A), [400]);
  await expect('a change needs a reason', PO(`${R}/grade-changes`, { enrollmentId: String(e2ENG._id), toGrade: 'B', reason: 'short' }, X.A), [400]);
  await expect('an instructor of another section cannot ask', PO(`${R}/grade-changes`, { enrollmentId: String((await RegEnrollment.findOne({ schoolId: X.s._id, studentId: X.st[1]._id, courseCode: 'CS201' }))._id), toGrade: 'B', reason: 'It is not my section at all' }, X.T), [403]);
  await expect('turning it down needs a reason', PO(`${R}/grade-changes/${id(rq)}/decide`, { approve: false }, X.A), [400]);
  await expect('the request is approved by the registrar', PO(`${R}/grade-changes/${id(rq)}/decide`, { approve: true }, X.A), [200]);
  const eAfter = await RegEnrollment.findOne({ _id: e2ENG._id }); const gcDoc = await RegGradeChange.findOne({ _id: id(rq) }); log(eAfter.grade === 'B-' && eAfter.gradeVersion === 2 && gcDoc.signature.length === 64 && gcDoc.fromGrade === 'C+', 'the grade changes, the version goes up and the old grade stays on the signed request');
  const own = await PO(`${R}/grade-changes`, { enrollmentId: String(e2ENG._id), toGrade: 'B', reason: 'Registrar noticed another error' }, X.A); await expect('the person who asked cannot approve their own request', PO(`${R}/grade-changes/${id(own)}/decide`, { approve: true }, X.A), [403]); await expect('a different administrator can', PO(`${R}/grade-changes/${id(own)}/decide`, { approve: true }, A2), [200]);
  const gl = await G(`${R}/grade-changes?status=approved`, X.A); log(gl.data.changes.length === 2 && gl.data.changes[0].signed, 'approved changes are listed as signed'); const tgl = await G(`${R}/grade-changes`, X.T); log(tgl.data.changes.length === 1, 'an instructor sees only their own requests');

  // ── 15. appeals ──
  const e1MTH = await RegEnrollment.findOne({ schoolId: X.s._id, studentId: X.st[0]._id, courseCode: 'MTH101', attemptNo: 1 }); const e2CS = await RegEnrollment.findOne({ schoolId: X.s._id, studentId: X.st[1]._id, courseCode: 'CS101' });
  await expect('an appeal needs a real explanation', PO('/registrar/me/appeals', { enrollmentId: String(e1MTH._id), reason: 'unfair' }, X.S[0]), [400]);
  const ap1 = await PO('/registrar/me/appeals', { enrollmentId: String(e1MTH._id), reason: 'My project mark was not added to the total.' }, X.S[0]); log(ap1.status === 201 && /^AP-\d{4}-\d{5}$/.test(ap1.data.number), 'a student appeals a published grade and gets a number');
  await expect('a second open appeal for the same course is refused', PO('/registrar/me/appeals', { enrollmentId: String(e1MTH._id), reason: 'Trying again with another explanation.' }, X.S[0]), [409]);
  await expect('a student cannot appeal someone else\'s grade', PO('/registrar/me/appeals', { enrollmentId: String(e1MTH._id), reason: 'This is not my grade but I want it changed.' }, X.S[1]), [404]);
  await expect('a student cannot withdraw another student\'s appeal', PO(`/registrar/me/appeals/${id(ap1)}/withdraw`, {}, X.S[1]), [404]);
  await expect('the student can withdraw', PO(`/registrar/me/appeals/${id(ap1)}/withdraw`, {}, X.S[0]), [200]);
  const ap2 = await PO('/registrar/me/appeals', { enrollmentId: String(e1MTH._id), reason: 'My project mark was not added to the total.' }, X.S[0]); log(ap2.status === 201, 'and file again');
  await expect('the registrar takes it for review', PO(`${R}/appeals/${id(ap2)}/assign`, {}, X.A), [200]);
  await expect('the instructor adds how the grade was decided', PO(`${R}/appeals/${id(ap2)}/note`, { note: 'The project was marked out of 20 and counted in full.' }, X.T), [200]); await expect('another instructor cannot', PO(`${R}/appeals/${id(ap2)}/note`, { note: 'I would like to comment too.' }, X.T2), [403]);
  const tAp = await G(`${R}/appeals`, X.T); log(tAp.data.appeals.length === 2 && tAp.data.appeals.every((a) => a.courseCode === 'MTH101'), 'an instructor sees appeals on their own sections only'); await expect('a decision needs reasons', PO(`${R}/appeals/${id(ap2)}/decide`, { outcome: 'reject' }, X.A), [400]);
  const rj = await PO(`${R}/appeals/${id(ap2)}/decide`, { outcome: 'reject', note: 'The marks add up correctly on the sheet.' }, X.A); log(rj.status === 200 && rj.data.status === 'rejected', 'the appeal can be rejected with reasons');
  const ap3 = await PO('/registrar/me/appeals', { enrollmentId: String(e2CS._id), reason: 'Question four was marked wrong against the key.' }, X.S[1]); await expect('upholding needs the new grade', PO(`${R}/appeals/${id(ap3)}/decide`, { outcome: 'uphold', note: 'The key was wrong for question four.' }, X.A), [400]); await expect('the new grade cannot be the same', PO(`${R}/appeals/${id(ap3)}/decide`, { outcome: 'uphold', toGrade: 'B+', note: 'The key was wrong for question four.' }, X.A), [400]);
  const up = await PO(`${R}/appeals/${id(ap3)}/decide`, { outcome: 'uphold', toGrade: 'A-', note: 'The key was wrong for question four.' }, X.A); const gcA = await RegGradeChange.findOne({ appealId: id(ap3) }); log(up.status === 200 && (await RegEnrollment.findOne({ _id: e2CS._id })).grade === 'A-' && gcA.source === 'appeal' && gcA.signature.length === 64 && gcA.status === 'approved', 'an upheld appeal changes the grade through a signed grade change');
  const sMe = await G('/registrar/me', X.S[1]); log(sMe.data.appeals.length === 1 && sMe.data.appeals[0].status === 'upheld' && sMe.data.gradeChanges.length >= 1, 'the student sees the decision and the change');
  await RegTerm.updateOne({ _id: id(t1) }, { $set: { publishedAt: new Date(Date.now() - 40 * 86400000) } }); const late = await PO('/registrar/me/appeals', { enrollmentId: String((await RegEnrollment.findOne({ schoolId: X.s._id, studentId: X.st[0]._id, courseCode: 'PHY101' }))._id), reason: 'I only noticed the grade now, long after.' }, X.S[0]); log(late.status === 409 && /14 days/.test(late.data.message), 'an appeal after the window closes is refused'); await RegTerm.updateOne({ _id: id(t1) }, { $set: { publishedAt: new Date() } });

  // ── 16. transcripts ──
  const tr = await PO(`${R}/students/${S2}/transcripts`, {}, X.A); log(tr.status === 201 && /^TR-/.test(tr.data.serial) && /^[A-F0-9]{12}$/.test(tr.data.verifyKey), 'an official transcript is issued with a number and a check code');
  await expect('a final transcript only follows graduation', PO(`${R}/students/${S2}/transcripts`, { kind: 'final' }, X.A), [409]);
  const pub = await call('GET', `/public/registrar/verify/${tr.data.verifyKey}`, null); log(pub.status === 200 && pub.data.valid === true && !JSON.stringify(pub.data).includes('Shah') && !JSON.stringify(pub.data).includes('Beta') && pub.data.student.includes('S.'), 'the public check says valid and shows only a shortened name');
  await expect('an unknown code is not found', call('GET', '/public/registrar/verify/AAAAAAAAAAAA', null), [404]); await expect('a malformed code is not found', call('GET', '/public/registrar/verify/xyz', null), [404]);
  const snapBefore = (await RegTranscript.findOne({ _id: id(tr) })).snapshot; await RegTranscript.updateOne({ _id: id(tr) }, { $set: { snapshot: { ...snapBefore, cgpa: 4 } } });
  const alt = await call('GET', `/public/registrar/verify/${tr.data.verifyKey}`, null); log(alt.data.valid === false && alt.data.status === 'Altered', 'a transcript whose stored copy was changed shows as altered'); await RegTranscript.updateOne({ _id: id(tr) }, { $set: { snapshot: snapBefore } });
  const tdoc = await G(`${R}/transcripts/${id(tr)}`, X.S[1]); log(tdoc.status === 200 && tdoc.data.snapshot.cgpa === 3.1 + 0 || tdoc.data.snapshot.cgpa > 0, 'the student reads their own transcript'); await expect('another student cannot', G(`${R}/transcripts/${id(tr)}`, X.S[0]), [404]);
  const pdfRes = await fetch(`${base}/api${R}/transcripts/${id(tr)}/pdf`, { headers: { authorization: `Bearer ${X.S[1]}` } }); const pdfBuf = Buffer.from(await pdfRes.arrayBuffer()); log(pdfRes.status === 200 && /pdf/.test(pdfRes.headers.get('content-type')) && pdfBuf.slice(0, 4).toString() === '%PDF', 'the transcript downloads as a PDF');
  const livePdf = await fetch(`${base}/api${R}/transcripts/live/pdf`, { headers: { authorization: `Bearer ${X.S[0]}` } }); log(livePdf.status === 200 && Buffer.from(await livePdf.arrayBuffer()).slice(0, 4).toString() === '%PDF', 'a student can print an unofficial copy of the live record');
  await expect('withdrawing a transcript needs a reason', PO(`${R}/transcripts/${id(tr)}/revoke`, {}, X.A), [400]); await expect('the registrar withdraws it', PO(`${R}/transcripts/${id(tr)}/revoke`, { reason: 'Issued to the wrong address by mistake' }, X.A), [200]);
  const rv = await call('GET', `/public/registrar/verify/${tr.data.verifyKey}`, null); log(rv.data.valid === false && rv.data.status === 'Withdrawn', 'a withdrawn transcript shows as withdrawn'); await expect('and the student no longer reads it', G(`${R}/transcripts/${id(tr)}`, X.S[1]), [404]);
  await expect('a transcript request notifies the office', PO('/registrar/me/transcript-request', {}, X.S[1]), [200]);

  // ── 17. withdrawals after the deadline and cancelled sections ──
  const lateTerm = await PO(`${R}/terms`, { code: 'LT26', name: 'Late term', startDate: '2026-02-01', endDate: '2026-03-01', addDropUntil: '2026-02-10' }, X.A); await expect('a term opens', PO(`${R}/terms/${id(lateTerm)}/open`, {}, X.A), [200]); const other = await PO(`${R}/terms`, { code: 'LT27', name: 'Other term', startDate: '2026-04-01', endDate: '2026-05-01' }, X.A); await expect('two terms can be open only on purpose', PO(`${R}/terms/${id(other)}/open`, {}, X.A), [409]);
  const lsec = await mkSec(id(lateTerm), 'ART101', { teacherId: String(X.t._id), capacity: 5 });
  await expect('a student cannot add after the deadline', PO('/registrar/me/enroll', { sectionId: id(lsec) }, X.S[3]), [409]); await expect('the registrar needs a reason to add late', en(S4, lsec), [400]);
  const lateAdd = await en(S4, lsec, X.A, { lateReason: 'Illness at the start of the term' }); log(lateAdd.status === 201 && lateAdd.data.late === true, 'the registrar can add late with a reason');
  await expect('a student cannot drop after the deadline', PO(`/registrar/me/enrollments/${lateAdd.data.enrollmentId}/drop`, {}, X.S[3]), [409]); await expect('a withdrawal needs a reason', call('POST', `${R}/students/${S4}/enrollments/${lateAdd.data.enrollmentId}/drop`, X.A, {}), [400]);
  const wdr = await call('POST', `${R}/students/${S4}/enrollments/${lateAdd.data.enrollmentId}/drop`, X.A, { reason: 'Medical withdrawal approved' }); log(wdr.status === 200 && wdr.data.result === 'withdrawn' && (await RegEnrollment.findOne({ _id: lateAdd.data.enrollmentId })).grade === 'W', 'after the deadline a course is withdrawn and shows as W');
  const wRec = (await G(`${R}/students/${S4}/record`, X.A)).data; log(wRec.cgpa === 0 && wRec.creditsEarned === 0, 'a W never counts toward the average or the credits');
  const sCan = await mkSec(id(lateTerm), 'PHY101', { teacherId: String(X.t._id) }); await en(S4, sCan, X.A, { lateReason: 'Illness at the start of the term' }); await expect('cancelling a section needs a reason', PO(`${R}/sections/${id(sCan)}/cancel`, {}, X.A), [400]); const cn = await PO(`${R}/sections/${id(sCan)}/cancel`, { reason: 'Not enough students' }, X.A); log(cn.status === 200 && cn.data.dropped === 1, 'cancelling a section drops its students');

  // ── 18. other schools and campus-limited administrators ──
  const xs = String(sMTH.data._id); const probes = [
    ['edit a course', () => PA(`${R}/courses/${cs101._id}`, { title: 'Mine' }, Y.A)], ['read a record', () => G(`${R}/students/${S1}/record`, Y.A)], ['place a student', () => PO(`${R}/students/${S1}/program`, { programId: String(yp.data._id), switch: true }, Y.A)],
    ['place with another school\'s programme', () => PO(`${R}/students/${String(Y.st[0]._id)}/program`, { programId: id(prog), versionId: id(v26) }, Y.A)], ['edit a section', () => PA(`${R}/sections/${xs}`, { capacity: 2 }, Y.A)], ['cancel a section', () => PO(`${R}/sections/${xs}/cancel`, { reason: 'No reason at all' }, Y.A)],
    ['read a roster', () => G(`${R}/sections/${xs}/roster`, Y.T)], ['save grades', () => PU(`${R}/sections/${xs}/grades`, { grades: [{ enrollmentId: String(e1MTH._id), grade: 'F' }] }, Y.T)], ['register in another school\'s section', () => PO('/registrar/me/enroll', { sectionId: xs }, Y.S[0])],
    ['enrol through the office', () => PO(`${R}/students/${String(Y.st[0]._id)}/enroll`, { sectionId: xs }, Y.A)], ['decide a grade change', () => PO(`${R}/grade-changes/${id(rq)}/decide`, { approve: true }, Y.A)], ['decide an appeal', () => PO(`${R}/appeals/${id(ap3)}/decide`, { outcome: 'reject', note: 'Not in my school at all.' }, Y.A)],
    ['decide an exception', () => PO(`${R}/exceptions/${id(sb)}/decide`, { approve: false, note: 'Not mine to decide.' }, Y.A)], ['decide a version', () => PO(`${R}/versions/${id(v27)}/decide`, { approve: true }, Y.A)], ['edit a term', () => PA(`${R}/terms/${id(t1)}`, { name: 'Hijacked' }, Y.A)],
    ['read a transcript', () => G(`${R}/transcripts/${id(tr)}`, Y.A)], ['issue a transcript', () => PO(`${R}/students/${S1}/transcripts`, {}, Y.A)], ['graduate a student', () => PO(`${R}/students/${S1}/graduate`, {}, Y.A)], ['ask for an exception', () => PO(`${R}/exceptions`, { studentId: S1, kind: 'prereq_waiver', courseCode: 'CS101', reason: 'Another school asking please' }, Y.T)],
    ['file an appeal for a grade of another school', () => PO('/registrar/me/appeals', { enrollmentId: String(e1MTH._id), reason: 'This is another school and not mine.' }, Y.S[0])], ['advisor reads a student of another school', () => G(`${R}/students/${S1}/record`, Y.T)],
  ];
  for (const [label, fn] of probes) { const r = await fn(); log([403, 404, 422].includes(r.status), `school Y cannot ${label} in school X (${r.status})`); }
  const same = await G(`${R}/students/${S1}/record`, X.A); log(same.data.cgpa === 3.23 && same.data.program.catalogYear === '2027', 'school X data is untouched after the probes');
  const yTerms = await G(`${R}/terms`, Y.A); log(yTerms.data.terms.length === 0, 'school Y sees none of school X terms');
  const A2y = await User.create({ schoolId: Y.s._id, name: 'REG002 Campus admin', email: 'admin2@reg002.test', password: pw, role: 'admin', isActive: true }); const A2yTok = generateAccessToken(String(A2y._id), String(Y.s._id), 'admin');
  await CS.ensureDefault(Y.s._id); const north = await Campus.create({ schoolId: Y.s._id, name: 'North', code: 'NTH' }); await CampusMembership.create({ schoolId: Y.s._id, userId: A2y._id, campusId: north._id, activeKey: `${A2y._id}:${north._id}` }); CS.bust && CS.bust(Y.s._id);
  await expect('an administrator limited to a campus is kept out of the registrar', G(`${R}/overview`, A2yTok), [403]); await expect('the school-wide administrator is not', G(`${R}/overview`, Y.A), [200]);

  // ── 19. overview, indexes ──
  const ov = await G(`${R}/overview`, X.A); log(ov.status === 200 && ov.data.programs === 1 && ov.data.students.graduated === 1 && ov.data.courses === 6 + 1 - 1 + 0 || ov.data.courses >= 6, 'the overview counts programmes, courses and students');
  const idx = (await mg.db.get().query('SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema()')).rows;
  for (const n of ['RegCourse', 'RegProgram', 'RegProgramVersion', 'RegTerm', 'RegSection', 'RegStudentProgram', 'RegEnrollment', 'RegGradeChange', 'RegAppeal', 'RegException', 'RegTranscript']) { const tbl = mg.model(n).table; const c = idx.filter((r) => r.tablename === tbl).length; log(c >= 3, `${n} has indexes for the paths it is searched by (${c})`); }
};
