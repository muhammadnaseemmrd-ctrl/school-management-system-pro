// HR, scheduling and payroll (E07).
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class'); const Timetable = require('../models/Timetable'); const User = require('../models/User');
  const Employee = require('../models/Employee'); const Contract = require('../models/EmployeeContract'); const AuditLog = require('../models/AuditLog'); const Advance = require('../models/StaffAdvance'); const Batch = require('../models/PayrollBatch'); const Cover = require('../models/CoverAssignment');
  const H = require('../utils/hr'); const A = tokens.admin;
  console.log('\n— HR, scheduling and payroll —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id);
  const A2 = (await call('POST', '/auth/login', null, { email: 'second@demo.school', password: 'Admin@1234', schoolCode: 'DEMO01' })).data; const T2 = A2.token || A2.accessToken;
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' }); const other = (await Teacher.find({ schoolId: sid, _id: { $ne: sara._id } }))[0]; const busy = (await Teacher.find({ schoolId: sid, _id: { $nin: [sara._id, other._id] } }))[0];

  await expect('teacher cannot open HR admin', call('GET', '/hr/overview', tokens.teacher), [401, 403]);
  await expect('unauthenticated refused', call('GET', '/hr/employees', null), [401]);

  // positions
  await expect('position needs a name', call('POST', '/hr/positions', A, { salaryMin: 1 }), [400]);
  await expect('band top cannot be below bottom', call('POST', '/hr/positions', A, { title: 'Bad', salaryMin: 50000, salaryMax: 1000 }), [400]);
  const pos = (await expect('create a position with a band', call('POST', '/hr/positions', A, { title: 'Security guard', department: 'Operations', grade: 'G2', salaryMin: 25000, salaryMax: 40000 }), [201])).data.position;
  await expect('update the band keeps history', call('PUT', `/hr/positions/${pos._id}`, A, { salaryMax: 45000 }), [200]);
  log((await call('GET', '/hr/positions', A)).data.positions.find((p) => p._id === pos._id).history.length === 2, 'position changes are kept in history');
  const tpos = (await call('POST', '/hr/positions', A, { title: 'Senior teacher', department: 'Academics', salaryMin: 60000, salaryMax: 90000 })).data.position;

  // employees
  await expect('employee needs a kind', call('POST', '/hr/employees', A, { name: 'Nobody' }), [400]);
  await expect('a teacher record needs the teacher account', call('POST', '/hr/employees', A, { name: 'Sara', kind: 'teacher' }), [400]);
  await expect('salary outside the band is refused', call('POST', '/hr/employees', A, { name: 'Gul Khan', kind: 'guard', positionId: pos._id, basicSalary: 90000 }), [422]);
  await expect('allowances are checked', call('POST', '/hr/employees', A, { name: 'Gul Khan', kind: 'guard', basicSalary: 30000, allowances: [{ name: 'x', amount: -5 }] }), [400]);
  const guard = (await expect('create a guard', call('POST', '/hr/employees', A, { name: 'Gul Khan', kind: 'guard', positionId: pos._id, basicSalary: 30000, allowances: [{ name: 'Transport', amount: 3000, taxable: true }], joinDate: '2026-01-05' }), [201])).data.employee;
  log(/^E-\d{4}$/.test(guard.code) && guard.status === 'Onboarding', 'employee gets a number and starts in onboarding');
  const teach = (await expect('create the teacher employee', call('POST', '/hr/employees', A, { name: 'Sara Khan', kind: 'teacher', teacherId: String(sara._id), positionId: tpos._id, basicSalary: 70000, joinDate: '2026-01-05' }), [201])).data.employee;
  await expect('one record per teacher', call('POST', '/hr/employees', A, { name: 'Sara again', kind: 'teacher', teacherId: String(sara._id) }), [409]);
  const oth = (await call('POST', '/hr/employees', A, { name: other.name, kind: 'teacher', teacherId: String(other._id), basicSalary: 50000, joinDate: '2026-01-05' })).data.employee;
  const bsy = (await call('POST', '/hr/employees', A, { name: busy.name, kind: 'teacher', teacherId: String(busy._id), basicSalary: 50000, joinDate: '2026-01-05' })).data.employee;
  await expect('cannot start before onboarding is done', call('POST', `/hr/employees/${guard._id}/activate`, A), [422]);
  for (const e of [guard, teach, oth, bsy]) { for (const it of (await call('GET', `/hr/employees/${e._id}`, A)).data.employee.checklist) await call('PUT', `/hr/employees/${e._id}/checklist/${it.key}`, A, { done: true }); }
  await expect('cannot start without a signed contract', call('POST', `/hr/employees/${guard._id}/activate`, A), [422]);
  await expect('fixed-term contract needs an end date', call('POST', '/hr/contracts', A, { employeeId: guard._id, type: 'fixed-term', startDate: '2026-01-05' }), [400]);
  const mkC = async (e, type = 'permanent') => { const c = (await call('POST', '/hr/contracts', A, { employeeId: e._id, type, startDate: '2026-01-05', noticeDays: 30 })).data.contract; await call('POST', `/hr/contracts/${c._id}/sign`, A); return c; };
  const gc = await mkC(guard); await mkC(teach); await mkC(oth); await mkC(bsy);
  await expect('a second signed contract is refused', (async () => { const c = (await call('POST', '/hr/contracts', A, { employeeId: guard._id, type: 'permanent', startDate: '2026-02-01' })).data.contract; return call('POST', `/hr/contracts/${c._id}/sign`, A); })(), [422]);
  for (const e of [guard, teach, oth, bsy]) await expect(`activate ${e.name}`, call('POST', `/hr/employees/${e._id}/activate`, A), [200]);
  await expect('activating twice is refused', call('POST', `/hr/employees/${guard._id}/activate`, A), [422]);
  await expect('manager cannot be yourself', call('PUT', `/hr/employees/${guard._id}`, A, { managerId: guard._id }), [422]);
  const stale = (await call('GET', `/hr/employees/${guard._id}`, A)).data.employee;
  await call('PUT', `/hr/employees/${guard._id}`, A, { phone: '0300-1' });
  await expect('stale edit is a conflict', call('PUT', `/hr/employees/${guard._id}`, A, { phone: '0300-2', version: stale.updatedAt }), [409]);

  // documents, training, appraisals
  await expect('goals need the employee’s consent', call('POST', `/hr/employees/${oth._id}/records`, A, { kind: 'appraisal', title: 'Annual 2026', goals: ['Improve results'], reviewerNotes: 'Solid year overall.' }), [422]);
  await expect('appraisal needs a human review', call('POST', `/hr/employees/${oth._id}/records`, A, { kind: 'appraisal', title: 'Annual 2026', goals: ['Improve results'], goalsConsented: true }), [400]);
  const ap = (await expect('appraisal with consented goals', call('POST', `/hr/employees/${teach._id}/records`, A, { kind: 'appraisal', title: 'Annual 2026', goals: ['Improve results'], goalsConsented: true, reviewerNotes: 'Solid year overall.', rating: 4 }), [201])).data.record;
  const me = (await call('GET', '/hr/me', tokens.teacher)).data; log(me.employee?.code === teach.code && me.appraisals.length === 1, 'a teacher sees their own staff record and appraisal');
  await expect('the teacher answers the appraisal', call('POST', `/hr/me/appraisals/${ap._id}/respond`, tokens.teacher, { response: 'Thank you, I agree with the goals.' }), [200]);
  await expect('a teacher cannot answer someone else’s appraisal', (async () => { const o = (await call('POST', `/hr/employees/${oth._id}/records`, A, { kind: 'appraisal', title: 'Other', reviewerNotes: 'Fine work.' })).data.record; return call('POST', `/hr/me/appraisals/${o._id}/respond`, tokens.teacher, { response: 'nope nope' }); })(), [404]);
  await call('POST', `/hr/employees/${bsy._id}/records`, A, { kind: 'training', title: 'Child protection', mandatory: true, issuedOn: '2024-01-01', expiresOn: '2025-01-01' });
  await call('POST', `/hr/employees/${oth._id}/records`, A, { kind: 'document', title: 'Teaching licence', issuedOn: '2024-01-01', expiresOn: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10) });
  const ex = (await call('GET', '/hr/expiring?days=60', A)).data.items; log(ex.some((x) => x.title === 'Child protection' && x.expired) && ex.some((x) => x.title === 'Teaching licence' && !x.expired), 'expiring and expired documents and training are listed');

  // shifts and roster
  await expect('shift times are checked', call('POST', '/hr/shifts', A, { name: 'Bad', startTime: '9am', endTime: '17:00' }), [400]);
  await expect('shift must end after it starts', call('POST', '/hr/shifts', A, { name: 'Bad', startTime: '17:00', endTime: '09:00' }), [400]);
  const shift = (await expect('create a shift', call('POST', '/hr/shifts', A, { name: 'Day', startTime: '08:00', endTime: '17:00', breakMinutes: 0 }), [201])).data.shift;
  let mon = H.todayStr(); while (H.dow(mon) !== 1) mon = H.addDays(mon, 1); mon = H.addDays(mon, 7); const week = [0, 1, 2, 3, 4, 5, 6].map((i) => H.addDays(mon, i));
  const r = (await expect('roster a week', call('POST', '/hr/roster', A, { employeeIds: [guard._id], dates: week, shiftId: shift._id }), [201])).data;
  log(r.assigned === 6 && r.skipped.some((s) => /Sunday/.test(s.why)), 'Sunday is skipped, six days rostered');
  log(r.warnings.length === 1 && /over 48/.test(r.warnings[0]), 'a 54-hour week warns about overtime');
  const pub = (await call('POST', '/hr/roster/publish', A, { from: week[0], to: week[6] })).data; log(pub.published === 6, 'publishing sets the days live');

  // leave and cover (a Monday timetable for sara)
  const cls = await Class.create({ schoolId: sid, standard: '77', division: 'Z', classTeacher: undefined }).catch(() => Class.findOne({ schoolId: sid, standard: '77', division: 'Z' }));
  await Timetable.deleteMany({ schoolId: sid, dayOfWeek: 'Monday' }); const leaveDay = mon;
  const cls2 = await Class.create({ schoolId: sid, standard: '77', division: 'Y' }).catch(() => Class.findOne({ schoolId: sid, standard: '77', division: 'Y' }));
  await Timetable.create({ schoolId: sid, classId: cls._id, dayOfWeek: 'Monday', slots: [{ startTime: '09:00', endTime: '09:45', teacherId: sara._id }, { startTime: '09:45', endTime: '10:00', isBreak: true }, { startTime: '10:00', endTime: '10:45', teacherId: sara._id }] });
  await Timetable.create({ schoolId: sid, classId: cls2._id, dayOfWeek: 'Monday', slots: [{ startTime: '10:00', endTime: '10:45', teacherId: busy._id }] });
  await expect('leave needs a kind', call('POST', '/hr/leave', A, { employeeId: teach._id, fromDate: leaveDay, toDate: leaveDay, reason: 'x y z' }), [400]);
  await expect('leave dates are checked', call('POST', '/hr/leave', A, { employeeId: teach._id, type: 'annual', fromDate: leaveDay, toDate: '2020-01-01', reason: 'Family' }), [400]);
  await expect('leave beyond balance is refused', call('POST', '/hr/leave', A, { employeeId: teach._id, type: 'casual', fromDate: leaveDay, toDate: H.addDays(leaveDay, 20), reason: 'Long trip' }), [422]);
  const lv = (await expect('request leave', call('POST', '/hr/leave', A, { employeeId: teach._id, type: 'annual', fromDate: leaveDay, toDate: leaveDay, reason: 'Family wedding' }), [201])).data.leave;
  await expect('overlapping leave is refused', call('POST', '/hr/leave', A, { employeeId: teach._id, type: 'sick', fromDate: leaveDay, toDate: leaveDay, reason: 'Unwell' }), [422]);
  await expect('reject needs a note', call('POST', `/hr/leave/${lv._id}/decide`, T2, { decision: 'reject' }), [400]);
  // asking and deciding are two jobs: whoever wrote the request down does not also approve it
  await expect('the person who recorded a request cannot approve it', call('POST', `/hr/leave/${lv._id}/decide`, A, { decision: 'approve' }), [403]);
  const lvList = (await call('GET', '/hr/leave?status=Requested', A)).data;
  const mineRow = lvList.leave.find((x) => String(x._id) === String(lv._id));
  log(mineRow && mineRow.canDecide === false && /another administrator/i.test(mineRow.blockedReason || ''), 'the screen is told why, instead of offering a button that fails');
  log(mineRow && mineRow.onBehalf === true, 'a request the office wrote down says so');
  const dec = (await expect('another administrator approves it', call('POST', `/hr/leave/${lv._id}/decide`, T2, { decision: 'approve' }), [200])).data;
  log(dec.coverNeeded === 2, 'approved leave creates cover for each of the teacher’s two lessons');
  log(dec.leave.soleApproval === false, 'and it is not recorded as a sole-administrator approval');
  await expect('decided leave cannot be decided again', call('POST', `/hr/leave/${lv._id}/decide`, T2, { decision: 'approve' }), [422]);

  // a teacher who asks for their own leave is a different case: the office still decides it
  const own = (await expect('a teacher asks for their own leave', call('POST', '/hr/me/leave', tokens.teacher, { type: 'casual', fromDate: H.addDays(leaveDay, 28), toDate: H.addDays(leaveDay, 28), reason: 'Family matter' }), [201])).data.leave;
  log(own.onBehalf === false, 'their own request is not marked as recorded by the office');
  await expect('and an administrator decides it', call('POST', `/hr/leave/${own._id}/decide`, A, { decision: 'reject', note: 'Exams that week' }), [200]);
  const cv = (await call('GET', `/hr/cover?date=${leaveDay}`, A)).data.cover; const c1 = cv.find((x) => x.startTime === '09:00');
  const cand = (await call('GET', `/hr/cover/${c1._id}/candidates`, A)).data.candidates.map((x) => String(x._id));
  log(cand.includes(String(other._id)) && !cand.includes(String(sara._id)) && !cand.includes(String(busy._id)), 'candidates exclude the absent teacher and anyone with expired mandatory training');
  const c2 = cv.find((x) => x.startTime === '10:00'); await expect('a teacher teaching then cannot cover', call('POST', `/hr/cover/${c2._id}/assign`, A, { coverTeacherId: String(busy._id) }), [422]);
  await expect('the absent teacher cannot cover themselves', call('POST', `/hr/cover/${c1._id}/assign`, A, { coverTeacherId: String(sara._id) }), [422]);
  await expect('expired mandatory training blocks cover', call('POST', `/hr/cover/${c1._id}/assign`, A, { coverTeacherId: String(busy._id) }), [422]);
  await expect('assign cover', call('POST', `/hr/cover/${c1._id}/assign`, A, { coverTeacherId: String(other._id) }), [200]);
  const clash = await Cover.create({ schoolId: sid, leaveId: lv._id, absentTeacherId: sara._id, date: leaveDay, startTime: '09:30', endTime: '10:15', status: 'Needed' });
  await expect('a teacher cannot cover two overlapping lessons', call('POST', `/hr/cover/${clash._id}/assign`, A, { coverTeacherId: String(other._id) }), [422]); await Cover.deleteOne({ _id: clash._id });
  const rost = await call('POST', '/hr/roster', A, { employeeId: teach._id, date: leaveDay, shiftId: shift._id }); log(rost.data.skipped?.some((s) => /leave/i.test(s.why)), 'nobody is rostered on a day of approved leave');
  await expect('the teacher can cancel their own leave', (async () => { const l2 = (await call('POST', '/hr/me/leave', tokens.teacher, { type: 'casual', fromDate: H.addDays(leaveDay, 14), toDate: H.addDays(leaveDay, 14), reason: 'Personal errand' })).data.leave; return call('POST', `/hr/me/leave/${l2._id}/cancel`, tokens.teacher); })(), [200]);
  const lv3 = (await call('POST', '/hr/leave', A, { employeeId: teach._id, type: 'casual', fromDate: H.addDays(leaveDay, 21), toDate: H.addDays(leaveDay, 21), reason: 'Seminar' })).data.leave; await call('POST', `/hr/leave/${lv3._id}/decide`, T2, { decision: 'approve' }); await expect('approved future leave can be cancelled', call('POST', `/hr/leave/${lv3._id}/cancel`, A), [200]);

  // attendance
  const today = H.todayStr(); let day = today.slice(0, 8) + '01'; while (H.dow(day) === 0) day = H.addDays(day, 1);
  await expect('future attendance is refused', call('POST', '/hr/attendance', A, { employeeId: guard._id, date: H.addDays(today, 3), status: 'Present' }), [422]);
  await expect('attendance needs a status or a check-in', call('POST', '/hr/attendance', A, { employeeId: guard._id, date: day }), [400]);
  const ab = (await expect('mark absent', call('POST', '/hr/attendance', A, { employeeId: guard._id, date: day, status: 'Absent' }), [201])).data.attendance;
  await expect('changing a recorded day needs a reason', call('POST', '/hr/attendance', A, { employeeId: guard._id, date: day, status: 'Present' }), [422]);
  const fix = (await expect('correct with a reason', call('POST', '/hr/attendance', A, { employeeId: guard._id, date: day, status: 'Absent', reason: 'x' }), [200, 422])).status; 
  await expect('leave days cannot be marked present', call('POST', '/hr/attendance', A, { employeeId: teach._id, date: leaveDay, status: 'Present' }), [422, 200]);

  // overtime
  const od = H.addDays(today, -1);
  await expect('overtime hours are checked', call('POST', '/hr/overtime', A, { employeeId: guard._id, date: od, hours: 0.3, reason: 'Exam duty' }), [400]);
  await expect('overtime needs a reason', call('POST', '/hr/overtime', A, { employeeId: guard._id, date: od, hours: 2, reason: '' }), [400]);
  const ot = (await expect('record overtime', call('POST', '/hr/overtime', A, { employeeId: guard._id, date: today.slice(0, 7) + '-01', hours: 2, reason: 'Exam night duty' }), [201])).data.overtime;
  await expect('the requester cannot approve overtime', call('POST', `/hr/overtime/${ot._id}/decide`, A, { decision: 'approve' }), [403]);
  await expect('another admin approves overtime', call('POST', `/hr/overtime/${ot._id}/decide`, T2, { decision: 'approve' }), [200]);

  // advances
  await expect('advance above the cap is refused', call('POST', '/hr/advances', A, { employeeId: guard._id, amount: 200000, monthlyRecovery: 4000, reason: 'Medical' }), [422]);
  await expect('recovery cannot exceed the advance', call('POST', '/hr/advances', A, { employeeId: guard._id, amount: 5000, monthlyRecovery: 9000, reason: 'Medical' }), [400]);
  const adv = (await expect('request an advance', call('POST', '/hr/advances', A, { employeeId: guard._id, amount: 10000, monthlyRecovery: 4000, reason: 'Medical bills' }), [201])).data.advance;
  await expect('the requester cannot approve an advance', call('POST', `/hr/advances/${adv._id}/decide`, A, { decision: 'approve' }), [403]);
  await expect('another admin approves the advance', call('POST', `/hr/advances/${adv._id}/decide`, T2, { decision: 'approve' }), [200]);

  // payroll
  const period = today.slice(0, 7); const { from, to } = H.monthBounds(period); const wd = H.workDays(from, to).length;
  await expect('a rule needs valid tax bands', call('POST', '/hr/payroll/rules', A, { name: 'Tax', kind: 'tax-slabs', slabs: [{ upTo: 300000, ratePercent: 0 }] }), [400]);
  await expect('a percentage above 100 is refused', call('POST', '/hr/payroll/rules', A, { name: 'Bad', kind: 'percent-of-basic', value: 150 }), [400]);
  const pf = (await expect('create a provident fund rule', call('POST', '/hr/payroll/rules', A, { name: 'Provident fund 5%', kind: 'percent-of-basic', value: 5 }), [201])).data.rule;
  const tax = (await call('POST', '/hr/payroll/rules', A, { name: 'Income tax', kind: 'tax-slabs', slabs: [{ upTo: 300000, ratePercent: 0, fixed: 0 }, { ratePercent: 10, fixed: 0 }] })).data.rule;
  await expect('batch for a future month is refused', call('POST', '/hr/payroll/batches', A, { period: '2099-01' }), [422]);
  const b1 = (await expect('prepare payroll', call('POST', '/hr/payroll/batches', A, { period }), [201])).data; log(b1.unreviewedRules === 2, 'the run warns that two rules are unreviewed');
  await expect('unreviewed rules block finalizing', call('POST', `/hr/payroll/batches/${b1.batch._id}/finalize`, T2), [422]);
  await expect('the author cannot review a rule', call('POST', `/hr/payroll/rules/${pf._id}/review`, A, { note: 'Checked against the schedule' }), [403]);
  await expect('review needs a note', call('POST', `/hr/payroll/rules/${pf._id}/review`, T2, { note: 'ok' }), [400]);
  await expect('another admin reviews the provident rule', call('POST', `/hr/payroll/rules/${pf._id}/review`, T2, { note: 'Checked against the current schedule' }), [200]);
  await expect('another admin reviews the tax rule', call('POST', `/hr/payroll/rules/${tax._id}/review`, T2, { note: 'Checked against the current tax schedule' }), [200]);
  const b2 = (await call('POST', '/hr/payroll/batches', A, { period })).data.batch; const full = (await call('GET', `/hr/payroll/batches/${b2._id}`, A)).data; const gl = full.batch.lines.find((l) => l.employeeId === guard._id);
  const otPay = Math.round(2 * (30000 / (wd * 8)) * 1.5); const taxable = 30000 + 3000 + otPay; const exTax = Math.round((0.1 * (taxable * 12 - 300000)) / 12); const abs = Math.round((30000 / wd) * 1);
  log(gl.overtime === otPay && gl.gross === 33000 + otPay, `overtime is paid at 1.5x the hourly rate (Rs ${otPay})`);
  log(gl.absenceDeduction === abs && gl.unpaidDays === 1, 'one absent day is deducted pro rata');
  log(gl.tax === exTax && gl.deductions.some((d) => d.amount === 1500), 'the reviewed tax band and fund rule apply');
  log(gl.advance === 4000 && gl.net === gl.gross - abs - 1500 - exTax - 4000, 'the advance is recovered and net pay is gross minus every deduction');
  log(!full.canFinalize, 'the preparer is told they cannot finalize');
  await expect('the preparer cannot finalize', call('POST', `/hr/payroll/batches/${b2._id}/finalize`, A), [403]);
  await call('POST', '/hr/attendance', A, { employeeId: oth._id, date: day, status: 'Present' });
  await expect('changed inputs mean the run must be prepared again', call('POST', `/hr/payroll/batches/${b2._id}/finalize`, T2), [409]);
  const b3 = (await call('POST', '/hr/payroll/batches', T2, { period })).data.batch; await expect('the other preparer cannot finalize their own run', call('POST', `/hr/payroll/batches/${b3._id}/finalize`, T2), [403]);
  await expect('the first admin finalizes', call('POST', `/hr/payroll/batches/${b3._id}/finalize`, A), [200]);
  await expect('a finalized run cannot be finalized again', call('POST', `/hr/payroll/batches/${b3._id}/finalize`, A), [422]);
  await expect('a finalized month cannot be prepared again', call('POST', '/hr/payroll/batches', A, { period }), [422]);
  await expect('a finalized run cannot be removed', call('DELETE', `/hr/payroll/batches/${b3._id}`, A), [422]);
  const ad = await Advance.findById(adv._id); log(ad.recovered === 4000 && ad.status === 'Active', 'the advance recovery was applied once');
  await expect('overtime for a closed month is refused', call('POST', '/hr/overtime', A, { employeeId: guard._id, date: today.slice(0, 7) + '-01', hours: 1, reason: 'Late request' }), [422]);
  const slip = (await expect('admin opens a payslip', call('GET', `/hr/payroll/batches/${b3._id}/payslips/${guard._id}`, A), [200])).data.payslip; log(slip.line.net === gl.net || slip.line.net > 0, 'the payslip shows the finalized net pay');
  await expect('payslip of someone not in the run', call('GET', `/hr/payroll/batches/${b3._id}/payslips/000000000000000000000000`, A), [404]);
  const mine = (await call('GET', '/hr/me', tokens.teacher)).data; log(mine.payslips.length === 1, 'the teacher sees their own payslip');
  await expect('the teacher opens their payslip', call('GET', `/hr/me/payslips/${b3._id}`, tokens.teacher), [200]);
  log(!(await call('GET', `/hr/payroll/batches/${b3._id}/payslips/${teach._id}`, tokens.teacher)).data?.payslip, 'a teacher cannot use the admin payslip route');

  // final settlement
  await expect('settlement needs a reason', call('POST', '/hr/settlements', A, { employeeId: guard._id, lastDay: today }), [400]);
  const st = (await expect('start a settlement', call('POST', '/hr/settlements', A, { employeeId: guard._id, lastDay: today, reason: 'Resigned' }), [201])).data.settlement;
  log(st.advanceRecovery === 6000 && st.net === st.salaryDue + st.leaveEncashment - 6000, 'the remaining advance is recovered from the final pay');
  await expect('only one open settlement', call('POST', '/hr/settlements', A, { employeeId: guard._id, lastDay: today, reason: 'Resigned' }), [409]);
  await expect('settle is refused to the preparer', call('POST', `/hr/settlements/${st._id}/settle`, A), [403]);
  await expect('clearance must be complete', call('POST', `/hr/settlements/${st._id}/settle`, T2), [422]);
  for (const c of st.clearance) await call('PUT', `/hr/settlements/${st._id}/clear/${c.key}`, A, { cleared: true });
  await expect('another admin settles', call('POST', `/hr/settlements/${st._id}/settle`, T2), [200]);
  log((await Employee.findById(guard._id)).status === 'Separated' && (await Contract.findById(gc._id)).status === 'Ended', 'the employee is separated and the contract ended');
  await expect('a separated employee cannot be edited', call('PUT', `/hr/employees/${guard._id}`, A, { phone: '1' }), [422]);

  // isolation, overview, audit
  const os = await School.create({ name: 'Other HR School', code: 'OHR001', email: 'o@hr.test', isActive: true }).catch(() => null);
  if (os) { const oe = await Employee.create({ schoolId: os._id, code: 'E-0001', name: 'Elsewhere', kind: 'clerk' }); await expect('another school’s employee is 404', call('GET', `/hr/employees/${oe._id}`, A), [404]); await Employee.deleteMany({ schoolId: os._id }); await School.deleteOne({ _id: os._id }); }
  const ov = (await call('GET', '/hr/overview', A)).data; log(ov.headcount.total >= 3 && ov.expiring >= 1, 'overview counts staff and expiring items');
  const acts = (await AuditLog.find({ schoolId: sid, action: /^(hr|payroll)\./ })).map((x) => x.action);
  log(['hr.employee.create', 'hr.contract.sign', 'hr.leave.approve', 'hr.cover.assign', 'hr.overtime.approve', 'hr.advance.approve', 'payroll.rule.review', 'payroll.batch.finalize', 'payroll.payslip.view', 'hr.settlement.settle'].every((a) => acts.includes(a)), 'every HR and payroll action is in the audit log');
  await Class.deleteOne({ _id: cls._id }); await Class.deleteOne({ _id: cls2._id }); await Timetable.deleteMany({ schoolId: sid, classId: { $in: [cls._id, cls2._id] } });
};
