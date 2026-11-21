// Reports that are more than one number (PRD E25): cohort progress, receivables ageing, the admissions funnel, data health, and the teacher time pulse.
const S = require('./service');
const C = require('./catalog');
const W = require('../../lib/pgdoc/where'); const { q } = require('../../lib/pgdoc/model');
const Marks = require('../../models/Marks'); const Exam = require('../../models/Exam'); const Subject = require('../../models/Subject'); const FeeInvoice = require('../../models/FeeInvoice');
const AdmissionApplication = require('../../models/AdmissionApplication'); const Student = require('../../models/Student'); const DailyAttendance = require('../../models/DailyAttendance');
const CmDelivery = require('../../models/CmDelivery'); const AnSchedule = require('../../models/AnSchedule'); const AnAction = require('../../models/AnAction'); const AnPulse = require('../../models/AnPulse');
const Teacher = require('../../models/Teacher');

const { Fail } = S; const T = W.T; const E = W.E; const r1 = C.r1;

/* ───────── cohort progress (comparable assessments) ───────── */
// For each class and subject: the average mark of each assessment in the period, oldest first, and the change between the last two.
// A point is shown only when enough children sat it. Percentages are of the marks available, so assessments of different totals compare.
async function progress(schoolId, scope, { from, to, minCell = 5 }) {
  const book = await C.classBook(schoolId); const exams = await Exam.find({ schoolId: S.oid(schoolId), date: { $gte: new Date(C.start(from)), $lte: new Date(C.end(to)) }, ...(scope.classIds ? { classId: { $in: scope.classIds } } : {}) }).select('classId name date').lean();
  if (!exams.length || (scope.classIds && !scope.classIds.length)) return { rows: [], from, to, minCell };
  const byId = new Map(exams.map((e) => [String(e._id), e]));
  const got = await C.rows(`SELECT ${T('examId')} AS "examId", ${T('subjectId')} AS "subjectId", COALESCE(SUM((${T('marks')})::float8), 0) AS marks, COALESCE(SUM((${T('outOfMarks')})::float8), 0) AS "outOf", COUNT(DISTINCT ${T('studentId')})::int AS students FROM ${q(Marks.table)} WHERE ${E('schoolId')} = to_jsonb($1::text) AND ${T('examId')} = ANY($2::text[]) GROUP BY 1, 2`, [String(schoolId), [...byId.keys()]]);
  const subs = new Map((await Subject.find({ schoolId: S.oid(schoolId) }).select('name').lean()).map((s) => [String(s._id), s.name]));
  const rowsBy = new Map();
  for (const g of got) { const e = byId.get(g.examId); if (!e || !(g.outOf > 0)) continue; const k = `${e.classId}|${g.subjectId}`; if (!rowsBy.has(k)) rowsBy.set(k, { classId: String(e.classId), label: book.get(String(e.classId))?.label || '', subjectId: g.subjectId, subject: subs.get(g.subjectId) || 'Subject', points: [] });
    rowsBy.get(k).points.push({ examId: g.examId, name: e.name, date: new Date(e.date).toISOString().slice(0, 10), students: g.students, suppressed: g.students < minCell, avg: g.students < minCell ? null : r1((g.marks * 100) / g.outOf) }); }
  const rows = [...rowsBy.values()].map((r) => { r.points.sort((a, b) => a.date.localeCompare(b.date)); const shown = r.points.filter((p) => !p.suppressed); const n = shown.length; return { ...r, change: n >= 2 ? r1(shown[n - 1].avg - shown[n - 2].avg) : null }; })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) || a.subject.localeCompare(b.subject));
  return { rows, from, to, minCell };
}

/* ───────── receivables ageing ───────── */
const BUCKETS = [{ key: 'current', label: 'Not yet due' }, { key: 'd30', label: '1 to 30 days late' }, { key: 'd60', label: '31 to 60 days late' }, { key: 'd90', label: '61 to 90 days late' }, { key: 'd90p', label: 'Over 90 days late' }];
async function ageing(schoolId, scope, { today, groupBy = 'none', minCell = 5 }) {
  const days = `(to_date($2::text, 'YYYY-MM-DD') - substr(${T('dueDate')}, 1, 10)::date)`;
  const got = await C.rows(`SELECT ${T('studentId')} AS sid, CASE WHEN ${days} <= 0 THEN 0 WHEN ${days} <= 30 THEN 1 WHEN ${days} <= 60 THEN 2 WHEN ${days} <= 90 THEN 3 ELSE 4 END AS b, COUNT(*)::int AS n, COALESCE(SUM((${T('total')})::float8 - (${T('paid')})::float8), 0) AS amt FROM ${q(FeeInvoice.table)} WHERE ${E('schoolId')} = to_jsonb($1::text) AND ${T('status')} IN ('Open', 'PartiallyPaid') GROUP BY 1, 2`, [String(schoolId), today]);
  const cls = await C.studentClass(schoolId); const book = await C.classBook(schoolId); const lim = scope.classIds ? new Set(scope.classIds) : null;
  const total = BUCKETS.map(() => ({ n: 0, amount: 0 })); const groups = new Map(); const students = new Set(); const gStudents = new Map();
  for (const r of got) {
    const classId = cls.get(r.sid) || ''; if (lim && !lim.has(classId)) continue; const b = Number(r.b); total[b].n += r.n; total[b].amount += Math.round(Number(r.amt)); students.add(r.sid);
    if (groupBy !== 'none') { const c = book.get(classId); const k = groupBy === 'class' ? classId : groupBy === 'standard' ? (c?.standard || '') : (c?.campusId || ''); const label = groupBy === 'class' ? (c?.label || 'Not placed') : groupBy === 'standard' ? (c ? `Grade ${c.standard}` : 'Not placed') : (c?.campus || 'Not placed');
      const g = groups.get(k) || { key: k, label, buckets: BUCKETS.map(() => ({ n: 0, amount: 0 })) }; g.buckets[b].n += r.n; g.buckets[b].amount += Math.round(Number(r.amt)); groups.set(k, g); if (!gStudents.has(k)) gStudents.set(k, new Set()); gStudents.get(k).add(r.sid); }
  }
  const sum = (bk) => bk.reduce((s, x) => s + x.amount, 0);
  const list = [...groups.values()].map((g) => ({ ...g, children: gStudents.get(g.key).size })).map((g) => (g.children < minCell ? { key: g.key, label: g.label, children: null, suppressed: true } : { ...g, suppressed: false, outstanding: sum(g.buckets) }));
  return { asOf: today, buckets: BUCKETS.map((b, i) => ({ ...b, ...total[i] })), outstanding: sum(total), overdue: sum(total.slice(1)), children: students.size, groups: list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), note: 'Invoice-based: what is owed on open invoices today. Nothing here is a forecast.' };
}

/* ───────── admissions funnel and the roll ───────── */
const FUNNEL = ['New', 'Documents', 'Interview', 'Offered', 'Accepted', 'Enrolled'];
async function funnel(schoolId, scope, { from, to }) {
  const apps = await AdmissionApplication.find({ schoolId: S.oid(schoolId), createdAt: { $gte: new Date(C.start(from)), $lte: new Date(C.end(to)) } }).select('stage stageHistory').limit(20000).lean();
  const reached = Object.fromEntries(FUNNEL.map((s) => [s, 0])); const now = { Waitlisted: 0, Rejected: 0, Withdrawn: 0 };
  for (const a of apps) {
    const seen = new Set((a.stageHistory || []).map((h) => h.stage)); seen.add(a.stage); seen.add('New');
    const hi = Math.max(...FUNNEL.map((s, i) => (seen.has(s) ? i : -1))); for (let i = 0; i <= hi; i += 1) reached[FUNNEL[i]] += 1;
    if (a.stage in now) now[a.stage] += 1;
  }
  const steps = FUNNEL.map((s, i) => ({ stage: s, reached: reached[s], ofPrevious: i && reached[FUNNEL[i - 1]] ? r1((reached[s] * 100) / reached[FUNNEL[i - 1]]) : null, ofFirst: reached.New ? r1((reached[s] * 100) / reached.New) : null }));
  const lim = scope.classIds; const kids = await Student.find({ schoolId: S.oid(schoolId) }).select('classId isActive').lean(); const book = await C.classBook(schoolId);
  const roll = {}; let inactive = 0; for (const s of kids) { const cid = s.classId ? String(s.classId) : ''; if (lim && !lim.includes(cid)) continue; if (s.isActive === false) { inactive += 1; continue; } const std = book.get(cid)?.standard || 'Not placed'; roll[std] = (roll[std] || 0) + 1; }
  return { from, to, applications: apps.length, steps, stillOpenElsewhere: now, roll: Object.entries(roll).map(([standard, students]) => ({ standard, students })).sort((a, b) => a.standard.localeCompare(b.standard, undefined, { numeric: true })), inactive,
    note: 'The school does not record why a child left, so planned transfers cannot be told apart from unplanned withdrawals here. Applications that withdrew before enrolling are counted above.' };
}

/* ───────── data health: is what the measures read fresh? ───────── */
const ageDays = (iso, today) => (iso ? S.daysBetween(String(iso).slice(0, 10), today) : null);
async function health(schoolId) {
  const today = await S.today(schoolId); const sid = String(schoolId); const week = S.addDays(today, -7);
  const one = async (model, field, extra = '') => (await C.rows(`SELECT MAX(${T(field)}) AS m FROM ${q(model.table)} WHERE ${E('schoolId')} = to_jsonb($1::text) ${extra}`, [sid]))[0]?.m || null;
  const [lastReg, lastMark, lastInv, failed, schedFail, overdueJobs] = await Promise.all([
    one(DailyAttendance, 'date'), one(Marks, 'createdAt'), one(FeeInvoice, 'issueDate'),
    CmDelivery.countDocuments({ schoolId: S.oid(schoolId), state: 'failed', createdAt: { $gte: new Date(C.start(week)) } }),
    AnSchedule.countDocuments({ schoolId: S.oid(schoolId), active: true, lastError: { $ne: '' } }),
    AnAction.countDocuments({ schoolId: S.oid(schoolId), status: 'open', dueOn: { $lt: today } }),
  ]);
  let held = 0; try { const st = await require('../accounts/service').getState(schoolId); held = (st.held || []).length; } catch (e) { held = 0; }
  const item = (key, label, asOf, staleAfter, note) => { const age = ageDays(asOf, today); return { key, label, asOf: asOf ? String(asOf).slice(0, 10) : null, ageDays: age, status: age === null ? 'none' : age > staleAfter ? 'stale' : 'ok', note }; };
  return { today, items: [
    item('attendance', 'Last register taken', lastReg, 4, 'Attendance measures read these registers.'),
    item('marks', 'Last marks entered', lastMark, 45, 'Learning measures read these marks.'),
    item('fees', 'Last fee invoice issued', lastInv, 40, 'Fee measures read these invoices.'),
  ], counts: [
    { key: 'deliveries', label: 'Family messages that failed to send in the last 7 days', value: failed, status: failed ? 'attention' : 'ok' },
    { key: 'held', label: 'Ledger postings held for a reason', value: held, status: held ? 'attention' : 'ok' },
    { key: 'schedules', label: 'Scheduled reports whose last run failed', value: schedFail, status: schedFail ? 'attention' : 'ok' },
    { key: 'jobs', label: 'Open jobs past their date', value: overdueJobs, status: overdueJobs ? 'attention' : 'ok' },
  ] };
}

/* ───────── the teacher time pulse (opt-in) ───────── */
const PULSE_MIN = 5; // never a figure from fewer than five people
const CATEGORIES = [{ key: 'marking', label: 'Marking and feedback' }, { key: 'attendance', label: 'Registers and attendance' }, { key: 'planning', label: 'Planning lessons' }, { key: 'family', label: 'Messages and meetings with families' }, { key: 'forms', label: 'Forms and school paperwork' }, { key: 'documents', label: 'Reports, certificates and documents' }];
const CAT = new Map(CATEGORIES.map((c) => [c.key, c.label]));
const isWeek = (w) => /^\d{4}-W\d{2}$/.test(String(w || ''));
async function pulseMe(schoolId, teacherId) {
  const sid = S.oid(schoolId); const tid = S.oid(teacherId); const today = await S.today(schoolId);
  const opt = await AnPulse.findOne({ schoolId: sid, teacherId: tid, kind: 'optin' }).lean(); const thisWeek = S.isoWeek(today);
  const entries = opt?.optedIn ? await AnPulse.find({ schoolId: sid, teacherId: tid, kind: 'entry' }).sort({ week: -1 }).limit(120).lean() : [];
  let schoolAvg = null;
  if (opt?.optedIn) { const rep = await pulseReport(schoolId, { from: S.addDays(today, -56), to: today }); schoolAvg = rep.categories.map((c) => ({ key: c.key, label: c.label, avgMinutes: c.suppressed ? null : c.avgMinutes })); }
  return { optedIn: !!opt?.optedIn, categories: CATEGORIES, thisWeek, minPeople: PULSE_MIN, entries: entries.map((e) => ({ week: e.week, category: e.category, minutes: e.minutes, note: e.note })), schoolAvg,
    about: 'This is voluntary. Only you can read your own entries. The school sees averages of at least five teachers, never a name, and never to judge anyone.' };
}
async function pulseOpt(schoolId, teacherId, on, { erase = false } = {}) {
  const sid = S.oid(schoolId); const tid = S.oid(teacherId); const now = new Date();
  await AnPulse.updateOne({ schoolId: sid, teacherId: tid, kind: 'optin', week: '', category: '' }, { $set: on ? { optedIn: true, optedInAt: now } : { optedIn: false, optedOutAt: now } }, { upsert: true });
  let erased = 0; if (!on && erase) { const r = await AnPulse.deleteMany({ schoolId: sid, teacherId: tid, kind: 'entry' }); erased = r.deletedCount || 0; }
  return { optedIn: on, erased };
}
async function pulseEntry(schoolId, teacherId, { week, category, minutes, note }) {
  const sid = S.oid(schoolId); const tid = S.oid(teacherId); const opt = await AnPulse.findOne({ schoolId: sid, teacherId: tid, kind: 'optin' }).lean();
  if (!opt?.optedIn) throw new Fail(409, 'Join the time pulse first. It is voluntary.', { reason: 'not_opted_in' });
  const today = await S.today(schoolId); const cur = S.isoWeek(today); const oldest = S.isoWeek(S.addDays(today, -26 * 7));
  if (!isWeek(week) || week > cur || week < oldest) throw new Fail(422, 'Choose a week from the last six months (not a future week).');
  if (!CAT.has(category)) throw new Fail(422, 'Choose one of the listed kinds of work.');
  const m = Number(minutes); if (!Number.isInteger(m) || m < 0 || m > 3000) throw new Fail(422, 'Minutes must be a whole number from 0 to 3000.');
  await AnPulse.updateOne({ schoolId: sid, teacherId: tid, kind: 'entry', week, category }, { $set: { minutes: m, note: String(note || '').slice(0, 200) } }, { upsert: true });
  return { week, category, minutes: m };
}
async function pulseAverages(schoolId, from, to) {
  const joined = new Set((await AnPulse.find({ schoolId: S.oid(schoolId), kind: 'optin', optedIn: true }).select('teacherId').lean()).map((o) => String(o.teacherId)));
  const rowsIn = (await AnPulse.find({ schoolId: S.oid(schoolId), kind: 'entry', week: { $gte: S.isoWeek(from), $lte: S.isoWeek(to) } }).select('teacherId category minutes week').lean()).filter((r) => joined.has(String(r.teacherId)));
  const by = new Map(CATEGORIES.map((c) => [c.key, { people: new Set(), minutes: 0, n: 0 }]));
  for (const r of rowsIn) { const a = by.get(r.category); if (!a) continue; a.people.add(String(r.teacherId)); a.minutes += r.minutes; a.n += 1; }
  return by;
}
async function pulseReport(schoolId, { from, to }) {
  const cur = await pulseAverages(schoolId, from, to); const prev = await pulseAverages(schoolId, S.previous({ from, to }).from, S.previous({ from, to }).to);
  const optedIn = await AnPulse.countDocuments({ schoolId: S.oid(schoolId), kind: 'optin', optedIn: true });
  const avg = (a) => (a && a.people.size >= PULSE_MIN && a.n ? r1(a.minutes / a.n) : null);
  const categories = CATEGORIES.map((c) => { const a = cur.get(c.key); const b = prev.get(c.key); const ok = a.people.size >= PULSE_MIN; const pa = avg(b);
    return { key: c.key, label: c.label, suppressed: !ok, people: ok ? a.people.size : null, avgMinutes: ok ? avg(a) : null, previousAvgMinutes: ok ? pa : null, change: ok && pa !== null ? r1(avg(a) - pa) : null }; });
  return { from, to, minPeople: PULSE_MIN, optedIn: optedIn >= PULSE_MIN ? optedIn : null, optedInNote: optedIn >= PULSE_MIN ? '' : 'Fewer than five teachers have joined, so no figure is shown.', categories,
    note: 'Average minutes a week a teacher reports for each kind of work. A change is only shown when both periods have at least five teachers. Individuals are never shown.' };
}

module.exports = { progress, ageing, funnel, health, pulseMe, pulseOpt, pulseEntry, pulseReport, CATEGORIES, BUCKETS, PULSE_MIN, FUNNEL };
