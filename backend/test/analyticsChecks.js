// Analytics and outcome measures (E25): every measure names its numerator, denominator and who sees it; small groups stay hidden.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Teacher = require('../models/Teacher'); const Student = require('../models/Student'); const Class = require('../models/Class');
  const Campus = require('../models/Campus'); const CampusMembership = require('../models/CampusMembership'); const PermissionGrant = require('../models/PermissionGrant'); const Subject = require('../models/Subject'); const Exam = require('../models/Exam'); const Marks = require('../models/Marks');
  const DailyAttendance = require('../models/DailyAttendance'); const FeeInvoice = require('../models/FeeInvoice'); const AdmissionApplication = require('../models/AdmissionApplication'); const CmTicket = require('../models/CmTicket'); const TpTrip = require('../models/TpTrip');
  const StaffAttendance = require('../models/StaffAttendance'); const LbLoan = require('../models/LbLoan');
  const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const Catalog = require('../utils/analytics/catalog'); const Svc = require('../utils/analytics/service');
  console.log('\n— Analytics and outcome measures —');

  // ── 1. the rules on their own ──
  log(Svc.isDay('2026-02-28') && !Svc.isDay('2026-02-30') && !Svc.isDay('26-1-1'), 'dates must be real calendar days');
  log(Svc.addDays('2026-03-01', -1) === '2026-02-28' && Svc.addMonths('2026-01', -1) === '2025-12' && Svc.lastDayOf('2028-02') === '2028-02-29' && Svc.isoWeek('2026-01-01') === '2026-W01' && Svc.isoWeek('2027-01-01') === '2026-W53', 'day, month and ISO-week arithmetic');
  const every = Catalog.CATALOG.every((m) => m.numerator && m.denominator && m.numerator.length > 20 && m.denominator.length > 20 && ['teacher', 'lead', 'admin'].includes(m.minLevel) && typeof m.run === 'function' && Catalog.roleScope(m));
  log(Catalog.CATALOG.length === 15 && every && new Set(Catalog.CATALOG.map((m) => m.key)).size === 15, 'every one of the 15 measures names its numerator, denominator and who may see it');
  log(Catalog.cleanParams(Catalog.BY_KEY.get('attendance.chronic').params, { threshold: 85 }).threshold === 85 && (() => { try { Catalog.cleanParams(Catalog.BY_KEY.get('attendance.chronic').params, { threshold: 5 }); } catch (e) { return e.code === 422; } return false; })() && (() => { try { Catalog.cleanParams(Catalog.BY_KEY.get('attendance.rate').params, { nope: 1 }); } catch (e) { return e.code === 422; } return false; })(), 'settings are checked against what each measure allows');

  // ── 2. a school with known figures ──
  const pw = await hashPassword('Ana@12345'); const today = new Date().toISOString().slice(0, 10); const ad = (n) => Svc.addDays(today, n); const dt = (s) => new Date(`${s}T00:00:00.000Z`);
  const mk = async (code) => {
    const s = await School.create({ name: `${code} Academy`, code, email: `${code.toLowerCase()}@ana.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0, timezone: 'UTC' });
    const mkA = (n) => User.create({ schoolId: s._id, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a = await mkA('Head'); const a2 = await mkA('Dean'); const a3 = await mkA('North');
    const mkT = (n) => Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const tHead = await mkT('TeachA'); const tOther = await mkT('TeachB'); const tLead = await mkT('Lead'); const tNone = await mkT('Nobody'); const extra = []; for (let i = 1; i <= 5; i += 1) extra.push(await mkT(`Extra${i}`));
    const north = await Campus.create({ schoolId: s._id, name: 'North', code: 'NTH' });
    const cls = async (standard, division, teacher, extraDoc = {}) => Class.create({ schoolId: s._id, standard, division, classTeacherId: teacher ? teacher._id : undefined, academicYear: '2026', ...extraDoc });
    const c7a = await cls('7', 'A', tHead); const c7b = await cls('7', 'B', null); const c8a = await cls('8', 'A', tOther, { campusId: north._id });
    await CampusMembership.create({ schoolId: s._id, userId: a3._id, userName: a3.name, campusId: north._id, campusName: 'North', activeKey: `${a3._id}:${north._id}` });
    let n = 0; const kids = async (c, count) => { const out = []; for (let i = 0; i < count; i += 1) { n += 1; out.push(await Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} Kid ${n}`, email: `kid${n}@${code.toLowerCase()}.test`, password: pw, classId: c._id, admissionNumber: `${code}-${n}`, isActive: true })); } return out; };
    const k7a = await kids(c7a, 6); const k7b = await kids(c7b, 3); const k8a = await kids(c8a, 6);
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    const grant = (t, action) => PermissionGrant.create({ schoolId: s._id, granteeId: t._id, granteeModel: 'Teacher', granteeName: t.name, action, source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 86400000), reason: 'Curriculum lead', grantedBy: new mg.Types.ObjectId() });
    return { s, a, a2, a3, tHead, tOther, tLead, tNone, extra, north, c7a, c7b, c8a, k7a, k7b, k8a, grant, A: tok(a, 'admin'), A2: tok(a2, 'admin'), A3: tok(a3, 'admin'), TH: tok(tHead, 'teacher'), TO: tok(tOther, 'teacher'), TL: tok(tLead, 'teacher'), TN: tok(tNone, 'teacher'), TE: extra.map((t) => tok(t, 'teacher')) };
  };
  const X = await mk('ANA001'); const Y = await mk('ANA002'); await X.grant(X.tLead, 'analytics.lead');
  const reg = (s, c, st, date, status) => DailyAttendance.create({ schoolId: s._id, classId: c._id, studentId: st._id, date: dt(date), status, markedBy: new mg.Types.ObjectId() });
  for (let d = -10; d <= -1; d += 1) {
    const day = ad(d);
    for (let i = 0; i < 6; i += 1) await reg(X.s, X.c7a, X.k7a[i], day, i === 0 && d >= -5 ? 'Absent' : i === 1 && (d === -3 || d === -2) ? 'Leave' : 'Present');
    for (let i = 0; i < 3; i += 1) await reg(X.s, X.c7b, X.k7b[i], day, 'Present');
    if (d !== -7 && d !== -6) for (let i = 0; i < 6; i += 1) await reg(X.s, X.c8a, X.k8a[i], day, i === 0 && d >= -4 ? 'Absent' : 'Present');
  }
  const math = await Subject.create({ schoolId: X.s._id, name: 'Maths', code: 'MTH' });
  const exam = async (name, c, d, list) => { const e = await Exam.create({ schoolId: X.s._id, name, classId: c._id, subjectId: math._id, date: dt(ad(d)), totalMarks: 100, passingMarks: 35 }); for (let i = 0; i < list.length; i += 1) await Marks.create({ schoolId: X.s._id, examId: e._id, studentId: (c._id === X.c7a._id ? X.k7a : X.k7b)[i]._id, subjectId: math._id, marks: list[i], outOfMarks: 100, percentage: list[i], passStatus: list[i] >= 35 ? 'Pass' : 'Fail' }); return e; };
  await exam('Test 1', X.c7a, -5, [90, 80, 70, 60, 50, 30]); await exam('Test 2', X.c7a, -2, [95, 85, 75, 65, 55, 45]); await exam('Quiz', X.c7b, -3, [50, 60, 70]);
  const inv = [[5000, 5000, 'Paid', -20], [5000, 5000, 'Paid', -20], [5000, 2500, 'PartiallyPaid', -5], [5000, 0, 'Open', -40], [5000, 5000, 'Paid', -20], [5000, 0, 'Open', 10]];
  for (let i = 0; i < inv.length; i += 1) await FeeInvoice.create({ schoolId: X.s._id, studentId: X.k7a[i]._id, number: `AN-${i}`, challanCode: `ANC-${i}`, issueDate: dt(ad(-8)), dueDate: dt(ad(inv[i][3])), total: inv[i][0], paid: inv[i][1], status: inv[i][2] });
  const mkApp = (stage, hist, i) => AdmissionApplication.create({ schoolId: X.s._id, inquiryId: new mg.Types.ObjectId(), academicYear: '2026', gradeSought: '7', child: { name: `Applicant ${i}` }, stage, stageHistory: hist.map((h) => ({ stage: h, at: new Date() })) });
  await mkApp('Enrolled', ['New', 'Documents', 'Interview', 'Offered', 'Accepted', 'Enrolled'], 1); await mkApp('Offered', ['New', 'Offered'], 2); await mkApp('Rejected', ['New', 'Documents', 'Rejected'], 3); await mkApp('New', ['New'], 4);
  const tix = (n, o) => CmTicket.create({ schoolId: X.s._id, number: `HD-AN-${n}`, subject: `Ticket ${n}`, category: 'fees', parentId: new mg.Types.ObjectId(), ...o });
  const nowT = Date.now(); const iso = (h) => new Date(nowT + h * 3600000);
  await tix(1, { firstResponseDueAt: iso(2), firstResponseAt: iso(-1), resolveDueAt: iso(5), resolvedAt: iso(-1), status: 'Resolved' }); await tix(2, { firstResponseDueAt: iso(-3), firstResponseAt: iso(-1), resolveDueAt: iso(-2), resolvedAt: iso(-1), status: 'Resolved' });
  await tix(3, { firstResponseDueAt: iso(-3), resolveDueAt: iso(-2) }); await tix(4, { firstResponseDueAt: iso(40), resolveDueAt: iso(90) });
  const trip = (n, delay) => TpTrip.create({ schoolId: X.s._id, tripKey: `AN-T${n}`, routeId: new mg.Types.ObjectId(), direction: 'morning', date: ad(-3), plannedStart: new Date(), plannedEnd: new Date(), status: 'completed', delayMin: delay }); await trip(1, 5); await trip(2, 20);
  const emp = []; for (let i = 0; i < 5; i += 1) emp.push(new mg.Types.ObjectId());
  for (let i = 0; i < 5; i += 1) for (const d of [-3, -2]) await StaffAttendance.create({ schoolId: X.s._id, employeeId: emp[i], date: ad(d), status: i === 0 && d === -3 ? 'Absent' : i === 1 && d === -2 ? 'Late' : 'Present' });
  const loan = (n, due) => LbLoan.create({ schoolId: X.s._id, copyId: new mg.Types.ObjectId(), titleId: new mg.Types.ObjectId(), barcode: `ANB${n}`, cardId: new mg.Types.ObjectId(), holderId: new mg.Types.ObjectId(), dueOn: dt(ad(due)), status: 'open' }); await loan(1, -5); await loan(2, -9); await loan(3, 5);

  const G = (p, t) => call('GET', p, t); const PO = (p, b, t) => call('POST', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {});
  const P = '/analytics'; const win = `from=${ad(-10)}&to=${today}`; const m = (k, t, extra = '') => G(`${P}/measures/${k}?${win}${extra}`, t); const val = (r) => r.data && r.data.total && r.data.total.value;

  // ── 3. who may open it ──
  await expect('analytics needs a sign-in', G(`${P}/access`, null), [401]);
  await expect('a student cannot use analytics', G(`${P}/access`, tokens.student), [403]);
  await expect('a parent cannot use analytics', G(`${P}/catalog`, tokens.parent), [403]);
  const acA = await G(`${P}/access`, X.A); const acT = await G(`${P}/access`, X.TH); const acL = await G(`${P}/access`, X.TL); const acC = await G(`${P}/access`, X.A3);
  log(acA.data.level === 'admin' && !acA.data.limited && acT.data.level === 'teacher' && acT.data.classes === 1 && acL.data.level === 'lead' && !acL.data.limited && acC.data.level === 'admin' && acC.data.limited && acC.data.classes === 1, 'each person is told their level and how many classes they see');
  const catT = await G(`${P}/catalog`, X.TH); const catA = await G(`${P}/catalog`, X.A);
  log(catT.status === 200 && catT.data.measures.length === 6 && catT.data.hidden.length === 9 && catT.data.hidden.every((h) => h.why) && catA.data.measures.length === 15 && catA.data.hidden.length === 0, 'a teacher sees six measures and is told why the other nine are hidden; an administrator sees all 15');
  log(catA.data.measures.every((d) => d.numerator && d.denominator && d.roleScope && d.minCell >= 1), 'every measure shown carries numerator, denominator, role scope and its smallest group');

  // ── 4. the figures ──
  const rA = await m('attendance.rate', X.A);
  log(rA.status === 200 && val(rA) === 93.4 && rA.data.total.num === 127 && rA.data.total.den === 136 && rA.data.total.ent === 15, 'attendance rate: 127 of 136 student-days, 93.4%');
  log(rA.data.numerator.includes('present') && rA.data.denominator.includes('approved leave') && rA.data.version === 0 && rA.data.definition.minLevel === 'teacher', 'the answer carries the definition it used');
  const rH = await m('attendance.rate', X.TH); const rO = await m('attendance.rate', X.TO); const rN = await m('attendance.rate', X.TN); const rL = await m('attendance.rate', X.TL); const rC = await m('attendance.rate', X.A3);
  log(val(rH) === 91.4 && rH.data.total.num === 53 && rH.data.total.den === 58, 'a class teacher sees only their own class: 53 of 58, 91.4%');
  log(val(rO) === 91.7 && val(rN) === null && rN.data.noData, 'another teacher sees theirs; a teacher with no class sees nothing');
  log(val(rL) === 93.4 && val(rC) === 91.7 && rC.data.total.den === 48, 'a curriculum lead sees the whole school; a campus administrator sees only their campus');
  const rcls = await m('attendance.rate', X.A, '&groupBy=class'); const sup = rcls.data.groups.filter((g) => g.suppressed);
  log(rcls.data.groups.length === 3 && sup.length === 2 && sup.every((g) => g.value === null && g.num === null && g.den === null && g.ent === null) && sup.some((g) => g.label === '7-B'), 'a class with fewer than five children is hidden, and so is the next smallest so it cannot be worked out');
  const rstd = await m('attendance.rate', X.A, '&groupBy=standard'); log(rstd.data.groups.length === 2 && rstd.data.groups.every((g) => !g.suppressed) && rstd.data.groups.find((g) => g.label === 'Grade 8').value === 91.7, 'grouping by grade shows both grades once each is large enough');
  const rcamp = await m('attendance.rate', X.A, '&groupBy=campus'); log(rcamp.data.groups.length === 2 && rcamp.data.groups.some((g) => g.label === 'North' && g.value === 91.7), 'grouping by campus names the campus');
  log(rA.data.series.length >= 1 && rA.data.series.reduce((s, x) => s + x.den, 0) === 136 && rA.data.previous && rA.data.previous.from < rA.data.from, 'a monthly series and the period before it come with every answer');
  const un = await m('attendance.unexcused', X.A); log(val(un) === 6.6 && un.data.total.num === 9 && un.data.total.den === 136, 'unexcused absence: 9 of 136 student-days away without leave');
  const ex = await m('attendance.excused_share', X.A); log(val(ex) === 18.2 && ex.data.total.num === 2 && ex.data.total.den === 11, 'excused share: 2 of 11 days away were approved leave');
  const mr = await m('attendance.missing_registers', X.A); log(val(mr) === 6.7 && mr.data.total.num === 2 && mr.data.total.den === 30, 'registers not taken: 2 of 30 class-days');
  const mrc = await m('attendance.missing_registers', X.A, '&groupBy=class'); log(mrc.data.groups.find((g) => g.label === '8-A').value === 20 && mrc.data.groups.find((g) => g.label === '7-A').value === 0, 'it points at the class that missed them');
  const ch = await m('attendance.chronic', X.A); log(val(ch) === 12.5 && ch.data.total.num === 1 && ch.data.total.den === 8, 'children often absent: 1 of 8 with enough days to judge');
  await expect('a teacher cannot open the often-absent list', m('attendance.chronic', X.TH), [403]); await expect('a curriculum lead can', m('attendance.chronic', X.TL), [200]);
  const av = await m('learning.average', X.A); const pr = await m('learning.pass_rate', X.A); log(val(av) === 65.3 && av.data.total.num === 980 && av.data.total.den === 1500 && val(pr) === 93.3 && pr.data.total.num === 14 && pr.data.total.den === 15, 'learning: 980 of 1500 marks is 65.3%; 14 of 15 passed');
  const avc = await m('learning.average', X.A, '&groupBy=class'); log(avc.data.groups.every((g) => g.suppressed), 'with one small class among two, both are hidden');
  const avH = await m('learning.average', X.TH, '&groupBy=class'); log(val(avH) === 66.7 && avH.data.groups.length === 1 && !avH.data.groups[0].suppressed, 'a teacher sees their own class average, shown because it is large enough');
  const fc = await m('fees.collection', X.A); log(val(fc) === 58.3 && fc.data.total.num === 17500 && fc.data.total.den === 30000, 'fees collected: Rs 17,500 of Rs 30,000');
  const fo = await m('fees.overdue', X.A); log(val(fo) === 30 && fo.data.total.num === 7500 && fo.data.total.den === 25000, 'fees overdue: Rs 7,500 of Rs 25,000 fallen due');
  await expect('a teacher cannot read fee figures', m('fees.collection', X.TH), [403]); await expect('nor can a curriculum lead', m('fees.overdue', X.TL), [403]);
  const ad1 = await m('admissions.conversion', X.A); log(val(ad1) === 25 && ad1.data.total.num === 1 && ad1.data.total.den === 4, 'applications that enrolled: 1 of 4');
  const s1 = await m('support.first_response', X.A); const s2 = await m('support.resolution', X.A); log(val(s1) === 33.3 && s1.data.total.num === 1 && s1.data.total.den === 3 && val(s2) === 33.3, 'help desk: 1 of 3 first replies on time, 1 of 3 resolved on time (an open request not yet due is left out)');
  const lb = await m('library.overdue', X.A); log(val(lb) === 66.7 && lb.data.total.num === 2 && lb.data.total.den === 3, 'library: 2 of 3 open loans overdue');
  const tp = await m('transport.on_time', X.A); log(val(tp) === 50 && tp.data.total.num === 1 && tp.data.total.den === 2, 'bus trips on time: 1 of 2');
  const sf = await m('staff.attendance', X.A); log(val(sf) === 90 && sf.data.total.num === 9 && sf.data.total.den === 10 && sf.data.total.ent === 5, 'staff attendance: 9 of 10 staff-days');
  for (const k of ['support.first_response', 'library.overdue', 'transport.on_time', 'staff.attendance', 'admissions.conversion']) await expect(`a campus administrator cannot open the whole-school measure ${k}`, m(k, X.A3), [403]);
  log((await m('attendance.rate', Y.A)).data.noData === true && val(await m('fees.collection', Y.A)) === null, 'another school measures only its own records');
  await expect('a measure that does not exist', m('nope.nothing', X.A), [404]); await expect('dates must be real', G(`${P}/measures/attendance.rate?from=2026-02-30&to=${today}`, X.A), [422]); await expect('the start cannot be after the end', G(`${P}/measures/attendance.rate?from=${today}&to=${ad(-5)}`, X.A), [422]);
  await expect('the period is limited to 400 days', G(`${P}/measures/attendance.rate?from=${ad(-401)}&to=${today}`, X.A), [422]); await expect('grouping must be one of the listed ways', m('attendance.rate', X.A, '&groupBy=teacher'), [422]);
  const rschool = await m('support.first_response', X.A, '&groupBy=class'); log(rschool.data.groupBy === 'none', 'a whole-school measure ignores a class grouping');

  // ── 5. overview, exceptions and the bigger reports ──
  const ov = await G(`${P}/overview?${win}`, X.A); const ex1 = ov.data.exceptions || [];
  log(ov.status === 200 && ov.data.results.length === 15 && ov.data.hidden.length === 0 && ex1.length > 0 && ex1[0].severity === 'critical' && ex1.some((e) => e.metricKey === 'fees.collection' && e.severity === 'critical') && ex1.some((e) => e.metricKey === 'attendance.missing_registers' && e.level === 'group' && e.groupLabel === '8-A'), 'the overview lists urgent exceptions first, including the class that missed its registers');
  log(ov.data.results.every((r) => r.definition && r.definition.numerator && 'change' in r) && ov.data.results.find((r) => r.key === 'attendance.rate').previousValue === null, 'every overview line carries its definition and the change since the period before');
  const ovT = await G(`${P}/overview?${win}`, X.TH); log(ovT.data.results.length === 6 && ovT.data.hidden.length === 9 && ovT.data.results.every((r) => ['attendance.rate', 'attendance.unexcused', 'attendance.excused_share', 'attendance.missing_registers', 'learning.average', 'learning.pass_rate'].includes(r.key)), 'a teacher\'s overview holds only what a teacher may see, and says what was left out');
  const pg1 = await G(`${P}/progress`, X.TL); const r7a = (pg1.data.rows || []).find((r) => r.label === '7-A'); const r7b = (pg1.data.rows || []).find((r) => r.label === '7-B');
  log(pg1.status === 200 && r7a && r7a.points.length === 2 && r7a.points[0].avg === 63.3 && r7a.points[1].avg === 70 && r7a.change === 6.7, 'cohort progress: 63.3 then 70.0 is a change of +6.7 points');
  log(r7b && r7b.points[0].suppressed && r7b.points[0].avg === null && r7b.change === null, 'an assessment sat by fewer than five children shows no average');
  const pgH = await G(`${P}/progress`, X.TH); const pgO = await G(`${P}/progress`, X.TO); log(pgH.data.rows.length === 1 && pgH.data.rows[0].label === '7-A' && pgO.data.rows.length === 0, 'a teacher sees progress only for their own classes');
  const ag = await G(`${P}/ageing?groupBy=class`, X.A); log(ag.status === 200 && ag.data.outstanding === 12500 && ag.data.overdue === 7500 && ag.data.children === 3 && ag.data.buckets[0].amount === 5000 && ag.data.buckets[1].amount === 2500 && ag.data.buckets[2].amount === 5000, 'receivables ageing: Rs 12,500 owed, Rs 7,500 of it late, by days late');
  log(ag.data.groups.length === 1 && ag.data.groups[0].suppressed && ag.data.note.includes('forecast'), 'a class with fewer than five families owing is not itemised, and the report says it is not a forecast');
  await expect('a teacher cannot read ageing', G(`${P}/ageing`, X.TH), [403]);
  const fu = await G(`${P}/funnel?from=${ad(-30)}&to=${today}`, X.A); log(fu.status === 200 && fu.data.applications === 4 && fu.data.steps.map((s) => s.reached).join() === '4,3,2,2,1,1' && fu.data.stillOpenElsewhere.Rejected === 1 && fu.data.note.includes('why a child left') && fu.data.roll.find((r) => r.standard === '7').students === 9, 'admissions funnel: 4, 3, 2, 2, 1, 1 reached each step; the roll counts 9 in grade 7');
  await expect('a campus administrator cannot open the funnel', G(`${P}/funnel`, X.A3), [403]); await expect('a teacher cannot open the funnel', G(`${P}/funnel`, X.TH), [403]);
  const hl = await G(`${P}/health`, X.A); const att = hl.data.items.find((i) => i.key === 'attendance'); log(hl.status === 200 && att.asOf === ad(-1) && att.ageDays === 1 && att.status === 'ok' && hl.data.counts.length === 4, 'data health: the last register was yesterday');

  await require('./analyticsChecks2')({ call, expect, log, tokens, base, F: { X, Y, today, ad, win, P, G, PO, PU, m, val, mg, models: { Teacher, User, Class, Student } } });
};
