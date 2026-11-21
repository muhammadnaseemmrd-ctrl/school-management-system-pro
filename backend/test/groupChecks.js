// Multi-campus group operations (E26): the group view shows only what the viewer may see; rules are set for the group, changed by a campus inside limits, versioned and approved by someone else.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Teacher = require('../models/Teacher'); const Student = require('../models/Student'); const Class = require('../models/Class');
  const Campus = require('../models/Campus'); const CampusMembership = require('../models/CampusMembership'); const CampusPolicy = require('../models/CampusPolicy'); const DailyAttendance = require('../models/DailyAttendance'); const FeeInvoice = require('../models/FeeInvoice');
  const AppSetting = require('../models/AppSetting'); const AttendanceAlert = require('../models/AttendanceAlert'); const Notification = require('../models/Notification'); const AuditLog = require('../models/AuditLog');
  const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const Svc = require('../utils/analytics/service'); const Pol = require('../utils/group/policy'); const Cat = require('../utils/group/catalog'); const Ops = require('../utils/attendanceOps');
  console.log('\n— Multi-campus group operations —');

  const pw = await hashPassword('Grp@12345'); const today = new Date().toISOString().slice(0, 10); const ad = (n) => Svc.addDays(today, n); const dt = (s) => new Date(`${s}T00:00:00.000Z`);
  const mk = async (code, { wide = 2, south = true } = {}) => {
    const s = await School.create({ name: `${code} Group`, code, email: `${code.toLowerCase()}@grp.test`, phone: '+92-300-2222222', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0, timezone: 'UTC' });
    const mkA = (n) => User.create({ schoolId: s._id, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const w1 = await mkA('Head'); const w2 = wide > 1 ? await mkA('Dean') : null; const n1 = await mkA('NorthAdmin'); const s1 = south ? await mkA('SouthAdmin') : null;
    const teacher = await Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Group`, name: `${code} Teacher`, email: `teacher@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const main = await require('../utils/campus').ensureDefault(s._id); const north = await Campus.create({ schoolId: s._id, name: 'North', code: 'NTH' }); const southC = south ? await Campus.create({ schoolId: s._id, name: 'South', code: 'STH' }) : null;
    const cls = (standard, division, extra = {}) => Class.create({ schoolId: s._id, standard, division, academicYear: '2026', ...extra });
    const c7 = await cls('7', 'A', { classTeacherId: teacher._id }); const c8 = await cls('8', 'A', { campusId: north._id }); const c9 = south ? await cls('9', 'A', { campusId: southC._id }) : null;
    const link = (u, c) => CampusMembership.create({ schoolId: s._id, userId: u._id, userName: u.name, campusId: c._id, campusName: c.name, activeKey: `${u._id}:${c._id}` });
    await link(n1, north); if (s1) await link(s1, southC);
    let n = 0; const kids = async (c, count) => { const out = []; for (let i = 0; i < count; i += 1) { n += 1; out.push(await Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Group`, name: `${code} Kid ${n}`, email: `kid${n}@${code.toLowerCase()}.test`, password: pw, classId: c._id, admissionNumber: `${code}-${n}`, isActive: true })); } return out; };
    const k7 = await kids(c7, 6); const k8 = await kids(c8, 8); const k9 = south ? await kids(c9, 3) : [];
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, w1, w2, n1, s1, teacher, main, north, southC, c7, c8, c9, k7, k8, k9, W1: tok(w1, 'admin'), W2: w2 ? tok(w2, 'admin') : null, N1: tok(n1, 'admin'), S1: s1 ? tok(s1, 'admin') : null, T: tok(teacher, 'teacher') };
  };
  const X = await mk('GRP001'); const Y = await mk('GRP002', { wide: 1, south: false });
  const G = (p, t) => call('GET', p, t); const PU = (p, b, t) => call('PUT', p, t, b || {}); const PO = (p, b, t) => call('POST', p, t, b || {});
  const reg = (s, c, st, date, status) => DailyAttendance.create({ schoolId: s._id, classId: c._id, studentId: st._id, date: dt(date), status, markedBy: new mg.Types.ObjectId() });
  for (let d = -10; d <= -1; d += 1) { const day = ad(d);
    for (let i = 0; i < 6; i += 1) await reg(X.s, X.c7, X.k7[i], day, 'Present');
    for (let i = 0; i < 8; i += 1) await reg(X.s, X.c8, X.k8[i], day, i < 2 && d >= -5 ? 'Absent' : 'Present');
    for (let i = 0; i < 3; i += 1) await reg(X.s, X.c9, X.k9[i], day, 'Present'); }
  const inv = (s, st, n, total, paid, status, due) => FeeInvoice.create({ schoolId: s._id, studentId: st._id, number: `GR-${n}`, challanCode: `GRC-${n}`, issueDate: dt(ad(-8)), dueDate: dt(ad(due)), total, paid, status });
  await inv(X.s, X.k7[0], 1, 5000, 5000, 'Paid', -20); await inv(X.s, X.k7[1], 2, 5000, 5000, 'Paid', -20); await inv(X.s, X.k8[0], 3, 5000, 2500, 'PartiallyPaid', -3); await inv(X.s, X.k8[1], 4, 5000, 0, 'Open', -5); for (let i = 3; i < 8; i += 1) await inv(X.s, X.k8[i], 10 + i, 5000, 5000, 'Paid', -3); for (let i = 2; i < 5; i += 1) await inv(X.s, X.k7[i], 30 + i, 5000, 5000, 'Paid', -3);
  const win = `from=${ad(-10)}&to=${ad(-1)}`; const P = '/group'; const leaks = (r, ...w) => w.some((x) => JSON.stringify(r.data || '').includes(x));
  const ids = (r) => (r.data.campuses || []).map((c) => c.name).sort().join(',');

  // ── 1. the rules on their own ──
  log(Cat.KEYS.length === 7 && Cat.KEYS.every((k) => k.label && k.unit && k.min < k.max && k.consumer) && new Set(Cat.KEYS.map((k) => k.key)).size === 7, 'every group rule names its units, its widest range and what reads it');
  const rl = (await G(`${P}/policies/catalog`, X.W1)).data; log(rl.rules && rl.rules.length === 7 && rl.rules.some((r) => r.campusOnly), 'the rule list is served, and capacity is marked as set for each campus');
  const solved = Pol.solve([], Cat.BY_KEY.get('fees.lateGraceDays'), null, { value: 4, from: 'x' }); log(solved.value === 4 && solved.source.kind === 'setting', 'with nothing set a rule takes the module\'s own setting');

  // ── 2. who may use it ──
  await expect('a teacher cannot open the group view', G(`${P}/rollup?${win}`, X.T), [403]); await expect('nobody signed out can', G(`${P}/rollup`, null), [401]);
  const acc = (await G(`${P}/access`, X.W1)).data; log(acc.wide === true && acc.campuses.length === 3, 'a school-wide administrator sees all three campuses');
  const accN = (await G(`${P}/access`, X.N1)).data; log(accN.wide === false && accN.campuses.length === 1 && accN.campuses[0].name === 'North' && !leaks({ data: accN }, 'Main campus', 'South'), 'a campus administrator sees only their own campus, and no other campus name');

  // ── 3. the group view for the whole school ──
  const ru = await expect('the group view opens', G(`${P}/rollup?${win}`, X.W1)); const rd = ru.data; log(ids(ru) === 'Main campus,North,South', 'all three campuses are listed');
  const byName = (r, n) => (r.data.campuses || []).find((c) => c.name === n);
  log(byName(ru, 'Main campus').students === 6 && byName(ru, 'North').students === 8 && byName(ru, 'South').students === 3 && rd.group.students === 17 && rd.group.campuses === 3, 'children are counted for each campus and for the group');
  log(byName(ru, 'North').classes === 1 && byName(ru, 'Main campus').teachers === 1 && byName(ru, 'North').teachers === 0, 'classes and teachers are counted for each campus');
  const att = (n) => byName(ru, n).measures['attendance.rate']; log(att('North').value !== null && att('North').value < 100 && att('North').suppressed === false && att('North').num > 0, 'attendance is measured for each campus with the same definition as the analytics module');
  log(att('South').suppressed === true && att('South').value === null && att('South').num === null, 'a campus with fewer than five children shows no figure');
  log(att('Main campus').suppressed === true && att('Main campus').value === null, 'the next smallest campus is hidden too, so the small one cannot be worked out from the total');
  const feeN = byName(ru, 'North').measures['fees.collection']; log(feeN.value !== null && feeN.value < 100 && feeN.suppressed === false, 'fees collected are measured for each campus');
  log(rd.group.measures['attendance.rate'].value !== null && rd.group.measures['attendance.rate'].value < 100, 'the group figure is the figure for all campuses together');
  const detailM = (await G(`${P}/rollup/${X.north._id}?${win}`, X.W1)).data; log(detailM.campus.name === 'North' && detailM.classes.length === 1 && detailM.classes[0].students === 8 && detailM.classes[0].label === '8-A' && detailM.policies.length === 7, 'a campus opens to show its classes and the rules that apply to it');
  const dS = (await G(`${P}/rollup/${X.southC._id}?${win}`, X.W1)).data; log(dS.classes[0].measures['attendance.rate'].suppressed === true, 'a class with fewer than five children is hidden inside a campus too');
  await expect('a campus that does not exist is not found', G(`${P}/rollup/${new mg.Types.ObjectId()}`, X.W1), [404]);
  await expect('a bad date is refused', G(`${P}/rollup?from=2026-02-30&to=2026-03-01`, X.W1), [422]);

  // ── 4. a campus administrator sees only their campus, and totals are theirs alone ──
  const rn = await expect('a campus administrator opens the group view', G(`${P}/rollup?${win}`, X.N1)); log(ids(rn) === 'North' && rn.data.wide === false && rn.data.group.students === 8 && rn.data.group.campuses === 1, 'they get their own campus and totals over their campus alone');
  log(!leaks(rn, 'Main campus', 'South', String(X.main._id), String(X.southC._id), String(X.c7._id), String(X.c9._id)), 'nothing from another campus appears anywhere in what they receive');
  const northAtt = byName(rn, 'North').measures['attendance.rate']; log(northAtt.value === att('North').value && rn.data.group.measures['attendance.rate'].value === northAtt.value, 'their group figure equals their campus figure, so nothing else can be worked out by subtraction');
  await expect('they cannot open another campus', G(`${P}/rollup/${X.main._id}?${win}`, X.N1), [404]); await expect('nor one they have not been given', G(`${P}/rollup/${X.southC._id}?${win}`, X.N1), [404]);
  await expect('they can open their own', G(`${P}/rollup/${X.north._id}?${win}`, X.N1), [200]);
  const rs = (await G(`${P}/rollup?${win}`, X.S1)).data; log(rs.campuses.length === 1 && rs.campuses[0].name === 'South' && rs.campuses[0].measures['attendance.rate'].suppressed === true, 'the other campus administrator sees South alone, still hidden for being small');
  log(!!rn.data.scopeNote && /only the campuses you administer/i.test(rn.data.scopeNote), 'the page says it shows only their campuses');
  const ry = await G(`${P}/rollup?${win}`, Y.W1); log(ry.data.campuses.length === 2 && !leaks(ry, 'GRP001', String(X.north._id), String(X.main._id)) && ry.data.group.students === 14, 'another school sees only its own campuses');

  // ── 5. every look across campuses is written down ──
  const looks = await AuditLog.countDocuments({ schoolId: X.s._id, action: 'group.view', actorId: X.w1._id }); await G(`${P}/rollup?${win}`, X.W1); await G(`${P}/rollup?${win}`, X.W1);
  const looks2 = await AuditLog.countDocuments({ schoolId: X.s._id, action: 'group.view', actorId: X.w1._id }); log(looks >= 1 && looks2 === looks, 'a look across campuses is in the audit trail, once for repeated looks in a short time');
  log(await AuditLog.countDocuments({ schoolId: X.s._id, action: 'group.view', actorId: X.n1._id }) >= 1, 'a campus administrator\'s look is recorded too');

  // ── 6. with no policy, modules behave as before ──
  await AppSetting.updateOne({ key: `finance:${X.s._id}` }, { $set: { value: { graceDays: 3, lateFeeAmount: 200 } } }, { upsert: true });
  const t0 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; const rule = (t, k) => t.rules.find((r) => r.key === k);
  log(rule(t0, 'fees.lateGraceDays').value === 3 && rule(t0, 'fees.lateGraceDays').source.kind === 'setting' && rule(t0, 'fees.lateFeeAmount').value === 200, 'before any policy a rule shows what the module already used, and says so');
  log(rule(t0, 'capacity.students').value === 0 && rule(t0, 'capacity.students').source.kind === 'default', 'a capacity nobody has set is zero');

  // ── 7. a group rule: made by one, decided by another ──
  const g1 = await expect('a school-wide administrator proposes a group rule', PU(`${P}/policies/group/fees.lateGraceDays`, { value: 7, lo: 0, hi: 10, reason: 'Match the new fee policy' }, X.W1), [201]); log(g1.data.status === 'pending' && g1.data.version === 1, 'it waits as version 1');
  const t1 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; log(rule(t1, 'fees.lateGraceDays').value === 3 && rule(t1, 'fees.lateGraceDays').pendingGroup.value === 7, 'nothing changes while it waits, and the waiting change is shown');
  await expect('a second change cannot be made while one waits', PU(`${P}/policies/group/fees.lateGraceDays`, { value: 8, reason: 'Another try' }, X.W2), [409]);
  const pend = (await G(`${P}/policies/pending`, X.W2)).data.pending; log(pend.length === 1 && pend[0].scope === 'group' && pend[0].madeByName.includes('Head'), 'the other administrator sees it waiting, with who made it');
  const docId = pend[0].docId; const d1 = await expect('the maker cannot decide their own change', PO(`${P}/policies/${docId}/decide`, { approve: true }, X.W1), [403]); log(d1.data.reason === 'maker_checker', 'the refusal says someone else must decide');
  await expect('a campus administrator cannot decide', PO(`${P}/policies/${docId}/decide`, { approve: true }, X.N1), [403]);
  await expect('a teacher cannot decide', PO(`${P}/policies/${docId}/decide`, { approve: true }, X.T), [403]);
  await expect('turning it down needs a reason', PO(`${P}/policies/${docId}/decide`, { approve: false }, X.W2), [422]);
  const ap = await expect('another school-wide administrator approves', PO(`${P}/policies/${docId}/decide`, { approve: true, note: 'Agreed' }, X.W2), [200]); log(ap.data.status === 'published' && ap.data.soleAdmin === false, 'the change is published and not marked as made alone');
  const t2 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; log(rule(t2, 'fees.lateGraceDays').value === 7 && rule(t2, 'fees.lateGraceDays').source.kind === 'group' && rule(t2, 'fees.lateGraceDays').lo === 0 && rule(t2, 'fees.lateGraceDays').hi === 10, 'the group value now applies to every campus, with its limits');
  const t2m = (await G(`${P}/policies?campusId=${X.main._id}`, X.W1)).data; log(rule(t2m, 'fees.lateGraceDays').value === 7, 'including the main campus');
  await expect('nothing is waiting any more', G(`${P}/policies/pending`, X.W1), [200]); log((await G(`${P}/policies/pending`, X.W1)).data.pending.length === 0, 'the waiting list is empty');
  log((await Notification.countDocuments({ userId: X.w2._id, key: /^grp:fees\.lateGraceDays/ })) >= 1 && (await Notification.countDocuments({ userId: X.w1._id, key: /^grp:dec:/ })) >= 1, 'the other administrator was told it was waiting, and the maker was told it was decided');

  // ── 8. only one school-wide administrator: they may decide their own, and it is recorded ──
  await expect('a school with one school-wide administrator proposes', PU(`${P}/policies/group/attendance.alertGraceMinutes`, { value: 10, reason: 'Wait ten minutes' }, Y.W1), [201]);
  const yp = (await G(`${P}/policies/pending`, Y.W1)).data.pending[0]; const yd = await expect('they decide it themselves', PO(`${P}/policies/${yp.docId}/decide`, { approve: true }, Y.W1), [200]); log(yd.data.soleAdmin === true, 'the decision records that it was made by the only school-wide administrator');
  const yh = (await G(`${P}/policies/history?key=attendance.alertGraceMinutes`, Y.W1)).data; log(yh.versions[0].soleAdmin === true && yh.versions[0].status === 'published', 'the history shows it');

  // ── 9. a campus changes a rule inside the group's limits ──
  await expect('a campus administrator cannot change a group rule', PU(`${P}/policies/group/fees.lateGraceDays`, { value: 1, reason: 'Trying' }, X.N1), [403]);
  await expect('nor another campus', PU(`${P}/policies/campus/${X.main._id}/fees.lateGraceDays`, { value: 2, reason: 'Trying' }, X.N1), [404]); await expect('nor one they were not given', PU(`${P}/policies/campus/${X.southC._id}/fees.lateGraceDays`, { value: 2, reason: 'Trying' }, X.N1), [404]);
  const o1 = await expect('they ask for an override for their own campus', PU(`${P}/policies/campus/${X.north._id}/fees.lateGraceDays`, { value: 2, reason: 'North families pay earlier' }, X.N1), [201]); log(o1.data.status === 'pending', 'it waits for approval');
  const t3 = (await G(`${P}/policies?campusId=${X.north._id}`, X.N1)).data; log(rule(t3, 'fees.lateGraceDays').value === 7 && rule(t3, 'fees.lateGraceDays').pendingCampus.value === 2, 'they can see their own request waiting, and the value still in force');
  const np = (await G(`${P}/policies/pending`, X.N1)).data.pending; log(np.length === 1 && np[0].campusId === String(X.north._id) && np[0].madeByCampus === true, 'they see their own waiting request only');
  log((await G(`${P}/policies/pending`, X.S1)).data.pending.length === 0, 'another campus administrator does not see it');
  await expect('they cannot approve their own request', PO(`${P}/policies/${np[0].docId}/decide`, { approve: true }, X.N1), [403]);
  const own = await expect('a school-wide administrator approves it', PO(`${P}/policies/${np[0].docId}/decide`, { approve: true }, X.W1), [200]); log(own.data.soleAdmin === false, 'a campus request does not need a different school-wide administrator');
  const t4 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; log(rule(t4, 'fees.lateGraceDays').value === 2 && rule(t4, 'fees.lateGraceDays').source.kind === 'campus' && rule(t4, 'fees.lateGraceDays').override === 2 && rule(t4, 'fees.lateGraceDays').groupValue === 7, 'North now has its own value and the group value is kept beside it');
  log((await G(`${P}/policies?campusId=${X.main._id}`, X.W1)).data.rules.find((r) => r.key === 'fees.lateGraceDays').value === 7, 'other campuses are unchanged');
  log((await Notification.countDocuments({ userId: X.n1._id, key: /^grp:dec:/ })) >= 1, 'the campus administrator was told it was approved');

  // ── 10. limits and values ──
  const bad = async (label, p, b, st, t = X.W1) => expect(label, PU(p, b, t), [st]);
  await bad('a campus value above the group limit is refused', `${P}/policies/campus/${X.north._id}/fees.lateGraceDays`, { value: 15, reason: 'Too long' }, 422, X.N1);
  const lim = await PU(`${P}/policies/campus/${X.north._id}/fees.lateGraceDays`, { value: 11, reason: 'Too long' }, X.N1); log(lim.data.reason === 'limits' && lim.data.hi === 10, 'the refusal tells them the limits');
  await bad('a value that is not a number is refused', `${P}/policies/group/fees.lateFeeAmount`, { value: 'lots', reason: 'Not a number' }, 422); await bad('a value outside the widest range is refused', `${P}/policies/group/attendance.alertGraceMinutes`, { value: 500, reason: 'Too big' }, 422);
  await bad('a fraction of a day is refused for a whole-number rule', `${P}/policies/group/fees.lateGraceDays`, { value: 2.5, reason: 'Half a day' }, 422); await bad('a rule that does not exist is not found', `${P}/policies/group/nothing.here`, { value: 1, reason: 'Nope nope' }, 404);
  await bad('a reason is needed', `${P}/policies/group/fees.lateFeeAmount`, { value: 100 }, 422); await bad('the group cannot set a capacity', `${P}/policies/group/capacity.students`, { value: 100, reason: 'For everyone' }, 422);
  await bad('limits must be in order', `${P}/policies/group/target.feeCollection`, { value: 80, lo: 90, hi: 70, reason: 'Backwards' }, 422); await bad('the value must sit inside its own limits', `${P}/policies/group/target.feeCollection`, { value: 99, lo: 50, hi: 90, reason: 'Outside' }, 422);
  await bad('a rule for a campus that does not exist is not found', `${P}/policies/campus/${new mg.Types.ObjectId()}/fees.lateGraceDays`, { value: 1, reason: 'No such place' }, 404);

  // ── 11. a group can lock a rule ──
  await PU(`${P}/policies/group/fees.lateFeeAmount`, { value: 250, locked: true, reason: 'Late fees are the same everywhere' }, X.W1); const lp = (await G(`${P}/policies/pending`, X.W2)).data.pending[0]; await PO(`${P}/policies/${lp.docId}/decide`, { approve: true }, X.W2);
  const t5 = (await G(`${P}/policies?campusId=${X.north._id}`, X.N1)).data; log(rule(t5, 'fees.lateFeeAmount').locked === true && rule(t5, 'fees.lateFeeAmount').canOverride === false && rule(t5, 'fees.lateFeeAmount').value === 250, 'a locked rule shows as locked and cannot be overridden');
  const lk = await PU(`${P}/policies/campus/${X.north._id}/fees.lateFeeAmount`, { value: 300, reason: 'Trying a lock' }, X.N1); log(lk.status === 409 && lk.data.reason === 'locked', 'asking to override a locked rule is refused');
  await expect('a campus can still ask to remove an override on a locked rule', PU(`${P}/policies/campus/${X.north._id}/fees.lateFeeAmount`, { value: null, reason: 'Nothing to remove' }, X.N1), [201]);
  const np2 = (await G(`${P}/policies/pending`, X.W1)).data.pending[0]; await PO(`${P}/policies/${np2.docId}/decide`, { approve: false, note: 'Nothing to remove' }, X.W1);
  // an override made before a lock stops counting once the group locks
  await PU(`${P}/policies/campus/${X.north._id}/target.attendanceRate`, { value: 88, reason: 'North starts lower' }, X.N1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W1)).data.pending[0].docId}/decide`, { approve: true }, X.W1);
  const t6 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; log(rule(t6, 'target.attendanceRate').value === 88 && rule(t6, 'target.attendanceRate').source.kind === 'campus', 'a campus target applies while the group allows it');
  await PU(`${P}/policies/group/target.attendanceRate`, { value: 95, locked: true, reason: 'One target for all' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending[0].docId}/decide`, { approve: true }, X.W2);
  const t7 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; log(rule(t7, 'target.attendanceRate').value === 95 && rule(t7, 'target.attendanceRate').ignored === 'locked' && rule(t7, 'target.attendanceRate').override === 88, 'once the group locks, the campus value stops counting but is kept and shown as set aside');
  // a pending request is checked again when it is decided
  await PU(`${P}/policies/campus/${X.north._id}/fees.lateGraceDays`, { value: 4, reason: 'A new try' }, X.N1); const rp = (await G(`${P}/policies/pending`, X.W1)).data.pending[0];
  await PU(`${P}/policies/group/fees.lateGraceDays`, { value: 7, lo: 5, hi: 10, reason: 'Narrow the limits' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending.find((p) => p.scope === 'group').docId}/decide`, { approve: true }, X.W2);
  const stale = await PO(`${P}/policies/${rp.docId}/decide`, { approve: true }, X.W1); log(stale.status === 409 && stale.data.reason === 'limits', 'a request that no longer fits the group\'s limits cannot be approved');
  await PO(`${P}/policies/${rp.docId}/decide`, { approve: false, note: 'Outside the new limits' }, X.W1);
  const t8 = (await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data; log(rule(t8, 'fees.lateGraceDays').ignored === 'limits' && rule(t8, 'fees.lateGraceDays').value === 7 && rule(t8, 'fees.lateGraceDays').override === 2, 'an override that falls outside the new limits is set aside, not deleted');

  // ── 12. versions and the past ──
  const h = (await G(`${P}/policies/history?key=fees.lateGraceDays`, X.W1)).data; log(h.versions.length === 2 && h.versions[0].version === 2 && h.versions[0].status === 'published' && h.versions[1].status === 'superseded' && h.versions.every((v) => v.reason && v.madeByName), 'the history keeps every version with its reason and who made it, and the earlier one is marked replaced');
  const hc = (await G(`${P}/policies/history?key=fees.lateGraceDays&campusId=${X.north._id}`, X.N1)).data; log(hc.versions.length >= 2 && hc.versions.some((v) => v.status === 'rejected') && hc.scope === 'campus', 'a campus\'s own history shows what was approved and what was turned down');
  await expect('a campus administrator cannot read another campus\'s history', G(`${P}/policies/history?key=fees.lateGraceDays&campusId=${X.main._id}`, X.N1), [404]);
  const back = (await G(`${P}/policies?campusId=${X.main._id}&asOf=${ad(-1)}`, X.W1)).data; log(rule(back, 'fees.lateGraceDays').value === 3 && rule(back, 'fees.lateGraceDays').source.kind === 'setting', 'yesterday\'s value can be read back from before the group set one');
  const now = (await G(`${P}/policies?campusId=${X.main._id}&asOf=${today}`, X.W1)).data; log(rule(now, 'fees.lateGraceDays').value === 7 && rule(now, 'fees.lateGraceDays').source.kind === 'group' && rule(now, 'fees.lateGraceDays').source.version === 2, 'today\'s value is the latest version');
  await expect('a bad date for looking back is refused', G(`${P}/policies?campusId=${X.main._id}&asOf=nope`, X.W1), [422]);
  const gr = (await G(`${P}/policies/group`, X.W1)).data.rules; const gl = gr.find((r) => r.key === 'fees.lateGraceDays'); log(gl.value === 7 && gl.version === 2 && gl.lo === 5 && gl.hi === 10 && gl.overrides >= 1 && !gr.some((r) => r.key === 'capacity.students'), 'the group page lists each group rule with its limits, its lock and how many campuses override it');
  const grN = (await G(`${P}/policies/group`, X.N1)).data.rules; log(grN.find((r) => r.key === 'fees.lateFeeAmount').locked === true && grN.every((r) => r.pending === null && r.docId === null), 'a campus administrator sees the group\'s values and locks, but not the group\'s waiting changes');

  // ── 13. capacity and targets feed the group view ──
  await PU(`${P}/policies/campus/${X.north._id}/capacity.students`, { value: 8, reason: 'Eight places' }, X.N1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W1)).data.pending[0].docId}/decide`, { approve: true }, X.W1);
  await PU(`${P}/policies/campus/${X.main._id}/capacity.students`, { value: 12, reason: 'Twelve places' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending[0].docId}/decide`, { approve: true }, X.W2);
  const rc = (await G(`${P}/rollup?${win}`, X.W1)).data; log(byName({ data: rc }, 'North').capacity === 8 && byName({ data: rc }, 'North').fill === 100 && byName({ data: rc }, 'Main campus').fill === 50, 'a campus shows its places and how full it is');
  const ex = rc.exceptions; log(ex.length >= 1 && ex.every((e) => e.gap < 0 && e.message) && ex.some((e) => e.campusName === 'North' && e.metricKey === 'attendance.rate'), 'a campus under its target is listed as needing attention');
  log(!ex.some((e) => e.campusName === 'South') && byName({ data: rc }, 'North').measures['attendance.rate'].target === 95, 'a hidden campus is never listed, and each campus carries the target it is held to');
  log(byName({ data: rc }, 'North').overrides === 1 && byName({ data: rc }, 'North').ignoredOverrides === 2, 'a campus says how many of its rules are its own, and how many were set aside');

  // ── 14. late fees read the policy ──
  const lateInv = async (s, st, n, due) => FeeInvoice.create({ schoolId: s._id, studentId: st._id, number: `LF-${n}`, challanCode: `LFC-${n}`, issueDate: dt(ad(-30)), dueDate: dt(ad(due)), total: 1000, paid: 0, status: 'Open' });
  const mainLate = await lateInv(X.s, X.k7[2], 1, -4); const northLate = await lateInv(X.s, X.k8[2], 2, -4);
  await PU(`${P}/policies/group/fees.lateGraceDays`, { value: 7, lo: 0, hi: 10, reason: 'Back to wide limits' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending.find((p) => p.scope === 'group').docId}/decide`, { approve: true }, X.W2);
  const run1 = await call('POST', '/finance/late-fees/run', X.W1);  log(run1.status === 200 && run1.data.applied === 3 && (await FeeInvoice.findById(northLate._id)).total === 1250 && (await FeeInvoice.findById(mainLate._id)).total === 1000, 'the late-fee run uses North\'s own grace (2 days) and leaves the main campus alone (7 days)');
  const run2 = await call('POST', '/finance/late-fees/run', X.W1); log(run2.data.applied === 0, 'running it again charges no one twice');
  log(!!run1.data.total && run1.data.total === 750, 'the response says how much was charged in total');
  await expect('a campus administrator cannot run the late-fee run', call('POST', '/finance/late-fees/run', X.N1), [200, 403]);
  await AppSetting.updateOne({ key: `finance:${Y.s._id}` }, { $set: { value: { graceDays: 0, lateFeeAmount: 0 } } }, { upsert: true }); await expect('with no late fee anywhere the run says so', call('POST', '/finance/late-fees/run', Y.W1), [422]);
  await PU(`${P}/policies/group/fees.lateFeeAmount`, { value: 100, reason: 'A late fee for the group' }, Y.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, Y.W1)).data.pending[0].docId}/decide`, { approve: true }, Y.W1);
  const yk = (await Student.find({ schoolId: Y.s._id }).limit(1))[0]; const yi = await lateInv(Y.s, yk, 9, -2); const run3 = await call('POST', '/finance/late-fees/run', Y.W1); log(run3.status === 200 && run3.data.applied === 1 && (await FeeInvoice.findById(yi._id)).total === 1100, 'a late fee set for the group is charged even when the school\'s own setting is zero');

  // ── 15. the attendance alert wait reads the policy ──
  await PU(`${P}/policies/campus/${X.north._id}/attendance.alertGraceMinutes`, { value: 30, reason: 'North wants longer to correct' }, X.N1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W1)).data.pending[0].docId}/decide`, { approve: true }, X.W1);
  await PU(`${P}/policies/group/attendance.alertGraceMinutes`, { value: 5, reason: 'Short wait for everyone else' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending[0].docId}/decide`, { approve: true }, X.W2);
  const alertFor = async (st, c) => { await Ops.syncAlert({ schoolId: X.s._id, student: st, classId: c._id, date: ad(-1), record: { status: 'Absent' }, marker: X.w1._id, markerModel: 'User' }); return AttendanceAlert.findOne({ studentId: st._id, date: ad(-1), kind: 'Absent' }); };
  const am = await alertFor(X.k7[3], X.c7); const an = await alertFor(X.k8[3], X.c8); const wait = (a) => Math.round((new Date(a.dueAt).getTime() - Date.now()) / 60000);
  log(wait(am) >= 4 && wait(am) <= 5, 'an absence alert in the main campus waits the group\'s 5 minutes'); log(wait(an) >= 29 && wait(an) <= 30, 'an absence alert in North waits North\'s own 30 minutes');
  const t9 = await Pol.effective(X.s._id, String(X.southC._id), 'attendance.alertGraceMinutes'); log(t9.value === 5 && t9.source.kind === 'group', 'a campus with no override of its own takes the group\'s value');

  // ── 16. rejected changes change nothing; removing an override ──
  await PU(`${P}/policies/group/target.learningAverage`, { value: 70, reason: 'Aim for seventy' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending[0].docId}/decide`, { approve: false, note: 'Not yet, wait for results' }, X.W2);
  log(rule((await G(`${P}/policies?campusId=${X.main._id}`, X.W1)).data, 'target.learningAverage').source.kind === 'setting', 'a change that was turned down does not apply');
  await PU(`${P}/policies/campus/${X.north._id}/capacity.students`, { value: null, reason: 'Back to no limit' }, X.W1); await PO(`${P}/policies/${(await G(`${P}/policies/pending`, X.W2)).data.pending[0].docId}/decide`, { approve: true }, X.W2);
  log(rule((await G(`${P}/policies?campusId=${X.north._id}`, X.W1)).data, 'capacity.students').value === 0, 'asking for no override removes it, and the history keeps what was there');

  // ── 17. isolation between schools, and indexes ──
  await expect('a policy of another school is not found', PO(`${P}/policies/${(await CampusPolicy.findOne({ schoolId: X.s._id }))._id}/decide`, { approve: true }, Y.W1), [404]);
  await expect('a campus of another school is not found', PU(`${P}/policies/campus/${X.north._id}/fees.lateGraceDays`, { value: 1, reason: 'Crossing over' }, Y.W1), [404]);
  await expect('another school cannot read this school\'s campus', G(`${P}/rollup/${X.north._id}?${win}`, Y.W1), [404]);
  log(!leaks(await G(`${P}/policies?campusId=${Y.main._id}`, Y.W1), 'GRP001'), 'what another school sees names nothing from this one');
  let dup = false; try { await CampusPolicy.create({ schoolId: X.s._id, key: 'fees.lateGraceDays', scope: 'group', campusId: null, scopeKey: 'group', versions: [] }); } catch (e) { dup = e.code === 11000 || /duplicate|E11000/.test(e.message); } log(dup, 'a rule cannot have two group records (unique index)');
  // a closed campus cannot be given a rule
  await Campus.updateOne({ _id: X.southC._id }, { $set: { status: 'closed' } }); await expect('a closed campus cannot be given a rule', PU(`${P}/policies/campus/${X.southC._id}/fees.lateGraceDays`, { value: 1, reason: 'Closed already' }, X.W1), [404]); await Campus.updateOne({ _id: X.southC._id }, { $set: { status: 'active' } });
  // an administrator who is moved to one campus stops being school-wide at once
  const late = await User.create({ schoolId: X.s._id, name: 'GRP001 Later', email: 'later@grp001.test', password: pw, role: 'admin', isActive: true }); const LT = generateAccessToken(String(late._id), String(X.s._id), 'admin');
  await expect('a new administrator is school-wide and may propose for the group', PU(`${P}/policies/group/target.feeCollection`, { value: 80, reason: 'Aim for eighty' }, LT), [201]);
  await CampusMembership.create({ schoolId: X.s._id, userId: late._id, userName: late.name, campusId: X.north._id, campusName: 'North', activeKey: `${late._id}:${X.north._id}` }); require('../utils/campus').bust(X.s._id);
  const lp2 = (await G(`${P}/policies/pending`, X.W1)).data.pending[0]; await expect('once limited to a campus, they cannot decide for the group', PO(`${P}/policies/${lp2.docId}/decide`, { approve: true }, LT), [403]); await PO(`${P}/policies/${lp2.docId}/decide`, { approve: true }, X.W1);
};
