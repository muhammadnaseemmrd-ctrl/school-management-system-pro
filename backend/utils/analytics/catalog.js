// The measures (PRD E25). Every one names what it counts (numerator), what it is counted against (denominator),
// who may see it and how small a group may be before its figure is hidden. Definitions are code; a school can tune a measure
// (versioned, approved by a second administrator) or narrow one to some classes, but never change what it means.
const db = require('../../lib/pgdoc/db');
const W = require('../../lib/pgdoc/where');
const { q } = require('../../lib/pgdoc/model');
const S = require('./service');
const Class = require('../../models/Class'); const Campus = require('../../models/Campus'); const Student = require('../../models/Student'); const Exam = require('../../models/Exam');
const DailyAttendance = require('../../models/DailyAttendance'); const Marks = require('../../models/Marks'); const FeeInvoice = require('../../models/FeeInvoice');
const AdmissionApplication = require('../../models/AdmissionApplication'); const CmTicket = require('../../models/CmTicket'); const LbLoan = require('../../models/LbLoan');
const TpTrip = require('../../models/TpTrip'); const StaffAttendance = require('../../models/StaffAttendance'); const AnMetric = require('../../models/AnMetric');

const { Fail } = S;
const rows = async (sql, p) => (await db.get().query(sql, p)).rows;
const T = W.T; const E = W.E;
const start = (d) => `${d}T00:00:00.000Z`; const end = (d) => `${d}T23:59:59.999Z`;
const r1 = (n) => Math.round(n * 10) / 10;

// a where clause for one school (and, when asked, a date range and a set of classes)
function filt(schoolId, ids, { dateField, from, to, text = false, classField = 'classId' } = {}) {
  const p = [String(schoolId)]; const where = [`${E('schoolId')} = to_jsonb($1::text)`];
  const add = (expr, op, v) => { p.push(v); where.push(`${expr} ${op} to_jsonb($${p.length}::text)`); };
  if (dateField) { add(E(dateField), '>=', text ? from : start(from)); add(E(dateField), '<=', text ? to : end(to)); }
  if (ids) { p.push(ids); where.push(`${T(classField)} = ANY($${p.length}::text[])`); }
  return { p, where, add, w: () => where.join(' AND ') };
}
const att = (par) => { const present = ['Present']; const away = ['Absent']; (par.lateAs === 'absent' ? away : present).push('Late'); (par.halfDayAs === 'absent' ? away : present).push('HalfDay'); if (par.leaveAs === 'absent') away.push('Leave'); return { present, counted: present.concat(away) }; };
const SETS = { lateAs: { type: 'enum', values: ['present', 'absent'], def: 'present', label: 'A late arrival counts as' }, halfDayAs: { type: 'enum', values: ['present', 'absent'], def: 'present', label: 'A half day counts as' }, leaveAs: { type: 'enum', values: ['excluded', 'absent'], def: 'excluded', label: 'Approved leave is' } };
const studentClass = async (schoolId) => new Map((await Student.find({ schoolId: S.oid(schoolId) }).select('classId').lean()).map((s) => [String(s._id), s.classId ? String(s.classId) : '']));
const idSet = (ids) => (ids ? new Set(ids) : null);

/* ───────── attendance ───────── */
async function attendanceRun({ schoolId, from, to, ids }, numSet, denSet) {
  const f = filt(schoolId, ids, { dateField: 'date', from, to }); const baseLen = f.p.length;
  const entRows = await rows(`SELECT ${T('classId')} AS "classId", COUNT(DISTINCT ${T('studentId')})::int AS n FROM ${q(DailyAttendance.table)} WHERE ${f.w()} GROUP BY 1`, f.p.slice(0, baseLen));
  f.p.push(numSet); const ni = f.p.length; f.p.push(denSet); const di = f.p.length;
  const out = await rows(`SELECT ${T('classId')} AS "classId", substr(${T('date')}, 1, 7) AS ym, COUNT(*) FILTER (WHERE ${T('status')} = ANY($${ni}::text[]))::int AS num, COUNT(*) FILTER (WHERE ${T('status')} = ANY($${di}::text[]))::int AS den FROM ${q(DailyAttendance.table)} WHERE ${f.w()} GROUP BY 1, 2`, f.p);
  return { rows: out.filter((r) => r.den > 0), ent: Object.fromEntries(entRows.map((r) => [r.classId, r.n])) };
}
async function missingRegisters({ schoolId, from, to, ids, params }) {
  const day = `substr(${T('date')}, 1, 10)`; const all = filt(schoolId, null, { dateField: 'date', from, to });
  const perDay = await rows(`SELECT ${day} AS day, COUNT(DISTINCT ${T('classId')})::int AS classes FROM ${q(DailyAttendance.table)} WHERE ${all.w()} GROUP BY 1`, all.p);
  const kids = await rows(`SELECT ${T('classId')} AS "classId", COUNT(*)::int AS n FROM ${q(Student.table)} WHERE ${E('schoolId')} = to_jsonb($1::text) AND COALESCE(${T('isActive')}, 'true') <> 'false' AND COALESCE(${T('classId')}, '') <> '' GROUP BY 1`, [String(schoolId)]);
  const active = kids.filter((k) => !ids || ids.includes(k.classId)); const activeAll = kids.length || 1;
  const days = perDay.filter((d) => d.classes * 100 >= params.schoolDayShare * activeAll).map((d) => d.day);
  if (!days.length || !active.length) return { rows: [], ent: {} };
  const f = filt(schoolId, ids, { dateField: 'date', from, to });
  const taken = new Set((await rows(`SELECT DISTINCT ${T('classId')} AS "classId", ${day} AS day FROM ${q(DailyAttendance.table)} WHERE ${f.w()}`, f.p)).map((r) => `${r.classId}|${r.day}`));
  const out = []; const ent = {};
  for (const c of active) { ent[c.classId] = c.n; const miss = {}; const tot = {}; for (const d of days) { const ym = d.slice(0, 7); tot[ym] = (tot[ym] || 0) + 1; if (!taken.has(`${c.classId}|${d}`)) miss[ym] = (miss[ym] || 0) + 1; } for (const ym of Object.keys(tot)) out.push({ classId: c.classId, ym, num: miss[ym] || 0, den: tot[ym] }); }
  return { rows: out, ent };
}
async function chronicAbsence({ schoolId, from, to, ids, params }) {
  const { present, counted } = att(params); const f = filt(schoolId, ids, { dateField: 'date', from, to });
  f.p.push(present); const pi = f.p.length; f.p.push(counted); const ci = f.p.length; f.p.push(params.minDays); const mi = f.p.length; f.p.push(params.threshold); const ti = f.p.length;
  const out = await rows(`SELECT "classId", COUNT(*) FILTER (WHERE den >= $${mi} AND num * 100 < $${ti}::int * den)::int AS num, COUNT(*) FILTER (WHERE den >= $${mi})::int AS den FROM (SELECT ${T('classId')} AS "classId", ${T('studentId')} AS sid, COUNT(*) FILTER (WHERE ${T('status')} = ANY($${pi}::text[]))::int AS num, COUNT(*) FILTER (WHERE ${T('status')} = ANY($${ci}::text[]))::int AS den FROM ${q(DailyAttendance.table)} WHERE ${f.w()} GROUP BY 1, 2) s GROUP BY 1`, f.p);
  return { rows: out.filter((r) => r.den > 0).map((r) => ({ classId: r.classId, ym: to.slice(0, 7), num: r.num, den: r.den })), ent: Object.fromEntries(out.map((r) => [r.classId, r.den])) };
}

/* ───────── learning ───────── */
async function marksRun({ schoolId, from, to, ids, filters }, pick) {
  const ex = { schoolId: S.oid(schoolId), date: { $gte: new Date(start(from)), $lte: new Date(end(to)) } }; if (ids) ex.classId = { $in: ids };
  const exams = await Exam.find(ex).select('classId date').lean(); if (!exams.length) return { rows: [], ent: {} };
  const byId = new Map(exams.map((e) => [String(e._id), e])); const p = [String(schoolId), [...byId.keys()]]; let sub = '';
  if (filters.subjectIds?.length) { p.push(filters.subjectIds); sub = `AND ${T('subjectId')} = ANY($3::text[])`; }
  const got = await rows(`SELECT ${T('examId')} AS "examId", COUNT(*)::int AS n, COALESCE(SUM((${T('marks')})::float8), 0) AS marks, COALESCE(SUM((${T('outOfMarks')})::float8), 0) AS "outOf", COUNT(*) FILTER (WHERE ${T('passStatus')} = 'Pass')::int AS pass, COUNT(*) FILTER (WHERE ${T('passStatus')} IS NOT NULL)::int AS graded, COUNT(DISTINCT ${T('studentId')})::int AS students FROM ${q(Marks.table)} WHERE ${E('schoolId')} = to_jsonb($1::text) AND ${T('examId')} = ANY($2::text[]) ${sub} GROUP BY 1`, p);
  const out = []; const ent = {};
  for (const r of got) { const e = byId.get(r.examId); if (!e) continue; const classId = String(e.classId); const v = pick(r); if (!(v.den > 0)) continue; out.push({ classId, ym: new Date(e.date).toISOString().slice(0, 7), num: v.num, den: v.den }); ent[classId] = Math.max(ent[classId] || 0, r.students); }
  return { rows: out, ent };
}

/* ───────── fees ───────── */
async function feeCollection({ schoolId, from, to, ids }) {
  const f = filt(schoolId, null, { dateField: 'issueDate', from, to }); f.where.push(`${T('status')} <> 'Void'`);
  const got = await rows(`SELECT ${T('studentId')} AS sid, substr(${T('issueDate')}, 1, 7) AS ym, COALESCE(SUM((${T('total')})::float8), 0) AS den, COALESCE(SUM((${T('paid')})::float8), 0) AS num FROM ${q(FeeInvoice.table)} WHERE ${f.w()} GROUP BY 1, 2`, f.p);
  return byStudent(got, await studentClass(schoolId), ids);
}
async function feeOverdue({ schoolId, to, ids, params, today }) {
  const asOf = to < today ? to : today; const low = S.addDays(asOf, -params.lookbackDays); const p = [String(schoolId), start(asOf), start(low)];
  const got = await rows(`SELECT ${T('studentId')} AS sid, COALESCE(SUM((${T('total')})::float8 - (${T('paid')})::float8) FILTER (WHERE ${T('status')} IN ('Open', 'PartiallyPaid')), 0) AS num, COALESCE(SUM((${T('total')})::float8), 0) AS den FROM ${q(FeeInvoice.table)} WHERE ${E('schoolId')} = to_jsonb($1::text) AND ${T('status')} <> 'Void' AND ${E('dueDate')} < to_jsonb($2::text) AND ${E('dueDate')} >= to_jsonb($3::text) GROUP BY 1`, p);
  return byStudent(got.map((r) => ({ ...r, ym: asOf.slice(0, 7) })), await studentClass(schoolId), ids);
}
function byStudent(got, cls, ids) {
  const set = idSet(ids); const acc = new Map(); const ent = {}; const seen = new Set();
  for (const r of got) {
    const classId = cls.get(r.sid) || ''; if (set && !set.has(classId)) continue;
    const k = `${classId}|${r.ym}`; const a = acc.get(k) || { classId, ym: r.ym, num: 0, den: 0 }; a.num += Math.round(Number(r.num)); a.den += Math.round(Number(r.den)); acc.set(k, a);
    if (!seen.has(`${classId}|${r.sid}`)) { seen.add(`${classId}|${r.sid}`); ent[classId] = (ent[classId] || 0) + 1; }
  }
  return { rows: [...acc.values()].filter((r) => r.den > 0), ent };
}

/* ───────── the rest of the school (school-wide measures) ───────── */
const schoolRows = (out, ent = null) => ({ rows: out.filter((r) => r.den > 0).map((r) => ({ classId: '', ym: r.ym, num: r.num, den: r.den })), ent: {}, entTotal: ent });
async function admissions({ schoolId, from, to }) {
  const f = filt(schoolId, null, { dateField: 'createdAt', from, to });
  return schoolRows(await rows(`SELECT substr(${T('createdAt')}, 1, 7) AS ym, COUNT(*) FILTER (WHERE ${T('stage')} = 'Enrolled')::int AS num, COUNT(*)::int AS den FROM ${q(AdmissionApplication.table)} WHERE ${f.w()} GROUP BY 1`, f.p));
}
async function support(kind, { schoolId, from, to }) {
  const f = filt(schoolId, null, { dateField: 'createdAt', from, to }); const now = new Date().toISOString(); f.p.push(now); const ni = f.p.length;
  const done = kind === 'first' ? 'firstResponseAt' : 'resolvedAt'; const due = kind === 'first' ? 'firstResponseDueAt' : 'resolveDueAt';
  return schoolRows(await rows(`SELECT substr(${T('createdAt')}, 1, 7) AS ym, COUNT(*) FILTER (WHERE ${T(done)} IS NOT NULL AND ${E(done)} <= ${E(due)})::int AS num, COUNT(*) FILTER (WHERE ${T(done)} IS NOT NULL OR ${E(due)} < to_jsonb($${ni}::text))::int AS den FROM ${q(CmTicket.table)} WHERE ${f.w()} GROUP BY 1`, f.p));
}
async function library({ schoolId, to, today }) {
  const asOf = to < today ? to : today; const p = [String(schoolId), start(asOf)];
  return schoolRows(await rows(`SELECT $3::text AS ym, COUNT(*) FILTER (WHERE ${T('status')} = 'open' AND ${E('dueOn')} < to_jsonb($2::text))::int AS num, COUNT(*) FILTER (WHERE ${T('status')} = 'open')::int AS den FROM ${q(LbLoan.table)} WHERE ${E('schoolId')} = to_jsonb($1::text)`, [...p, asOf.slice(0, 7)]));
}
async function transport({ schoolId, from, to, params }) {
  const f = filt(schoolId, null, { dateField: 'date', from, to, text: true }); f.where.push(`${T('status')} = 'completed'`); f.p.push(params.toleranceMin); const ti = f.p.length;
  return schoolRows(await rows(`SELECT substr(${T('date')}, 1, 7) AS ym, COUNT(*) FILTER (WHERE COALESCE((${T('delayMin')})::int, 0) <= $${ti}::int)::int AS num, COUNT(*)::int AS den FROM ${q(TpTrip.table)} WHERE ${f.w()} GROUP BY 1`, f.p));
}
async function staff({ schoolId, from, to, params }) {
  const { present, counted } = att(params); const f = filt(schoolId, null, { dateField: 'date', from, to, text: true }); const baseLen = f.p.length;
  const n = (await rows(`SELECT COUNT(DISTINCT ${T('employeeId')})::int AS n FROM ${q(StaffAttendance.table)} WHERE ${f.w()}`, f.p.slice(0, baseLen)))[0]?.n || 0;
  f.p.push(present); const pi = f.p.length; f.p.push(counted); const ci = f.p.length;
  return schoolRows(await rows(`SELECT substr(${T('date')}, 1, 7) AS ym, COUNT(*) FILTER (WHERE ${T('status')} = ANY($${pi}::text[]))::int AS num, COUNT(*) FILTER (WHERE ${T('status')} = ANY($${ci}::text[]))::int AS den FROM ${q(StaffAttendance.table)} WHERE ${f.w()} GROUP BY 1`, f.p), n);
}

/* ───────── the catalogue ───────── */
const CATALOG = [
  { key: 'attendance.rate', name: 'Attendance rate', domain: 'Attendance', scope: 'class', minLevel: 'teacher', unit: 'student-days', private: true,
    numerator: 'Student-days marked present (late and half days count as present unless the school says otherwise)', denominator: 'Student-days marked, leaving out approved leave unless the school says otherwise',
    params: { ...SETS }, alert: { below: 90, criticalBelow: 80 }, run: (c) => { const s = att(c.params); return attendanceRun(c, s.present, s.counted); } },
  { key: 'attendance.unexcused', name: 'Unexcused absence', domain: 'Attendance', scope: 'class', minLevel: 'teacher', unit: 'student-days', private: true,
    numerator: 'Student-days marked absent without approved leave', denominator: 'Student-days marked, leaving out approved leave',
    params: {}, alert: { above: 8, criticalAbove: 15 }, run: (c) => attendanceRun(c, ['Absent'], ['Present', 'Late', 'HalfDay', 'Absent']) },
  { key: 'attendance.excused_share', name: 'Absence that was excused', domain: 'Attendance', scope: 'class', minLevel: 'teacher', unit: 'student-days', private: true,
    numerator: 'Student-days away on approved leave', denominator: 'Student-days away (approved leave plus absent)',
    params: {}, alert: {}, run: (c) => attendanceRun(c, ['Leave'], ['Leave', 'Absent']) },
  { key: 'attendance.missing_registers', name: 'Registers not taken', domain: 'Attendance', scope: 'class', minLevel: 'teacher', unit: 'class-days', private: false,
    numerator: 'Class-days on which no register was taken', denominator: 'Class-days expected: every class with children, on every school day (a day when at least the chosen share of classes took a register)',
    params: { schoolDayShare: { type: 'number', min: 1, max: 100, def: 10, label: 'A school day is one when at least this percent of classes took a register' } }, alert: { above: 5, criticalAbove: 20 }, run: missingRegisters },
  { key: 'attendance.chronic', name: 'Children often absent', domain: 'Attendance', scope: 'class', minLevel: 'lead', unit: 'students', private: true,
    numerator: 'Students whose attendance rate is below the line', denominator: 'Students with enough marked days to judge',
    params: { threshold: { type: 'number', min: 50, max: 99, def: 90, label: 'Attendance rate line (percent)' }, minDays: { type: 'number', min: 3, max: 60, def: 10, label: 'Marked days needed before a child is counted' }, ...SETS }, alert: { above: 15, criticalAbove: 30 }, run: chronicAbsence },
  { key: 'learning.average', name: 'Average mark', domain: 'Learning', scope: 'class', minLevel: 'teacher', unit: 'marks', private: true,
    numerator: 'Marks obtained, all assessments in the period', denominator: 'Marks available in those assessments',
    params: {}, alert: {}, run: (c) => marksRun(c, (r) => ({ num: Math.round(r.marks), den: Math.round(r.outOf) })) },
  { key: 'learning.pass_rate', name: 'Pass rate', domain: 'Learning', scope: 'class', minLevel: 'teacher', unit: 'marks entered', private: true,
    numerator: 'Marks entered that are a pass', denominator: 'Marks entered with a pass or fail result',
    params: {}, alert: { below: 70, criticalBelow: 50 }, run: (c) => marksRun(c, (r) => ({ num: r.pass, den: r.graded })) },
  { key: 'fees.collection', name: 'Fees collected', domain: 'Fees', scope: 'class', minLevel: 'admin', unit: 'PKR', private: true,
    numerator: 'Amount received against the invoices issued in the period', denominator: 'Amount invoiced in the period (void invoices left out; written-off invoices stay in)',
    params: {}, alert: { below: 80, criticalBelow: 60 }, run: feeCollection },
  { key: 'fees.overdue', name: 'Fees overdue', domain: 'Fees', scope: 'class', minLevel: 'admin', unit: 'PKR', private: true,
    numerator: 'Amount still unpaid on open invoices whose due date has passed', denominator: 'Amount invoiced on every invoice that has fallen due in the look-back window (written-off invoices stay in)',
    params: { lookbackDays: { type: 'number', min: 30, max: 730, def: 365, label: 'Look-back window (days)' } }, alert: { above: 20, criticalAbove: 35 }, run: feeOverdue },
  { key: 'admissions.conversion', name: 'Applications that enrolled', domain: 'Admissions', scope: 'school', minLevel: 'admin', unit: 'applications', private: false,
    numerator: 'Applications received in the period that are now enrolled', denominator: 'Applications received in the period',
    params: {}, alert: {}, run: admissions },
  { key: 'support.first_response', name: 'First reply on time', domain: 'Help desk', scope: 'school', minLevel: 'admin', unit: 'requests', private: false,
    numerator: 'Requests opened in the period that got a first reply by the deadline', denominator: 'Requests opened in the period that were answered or whose first-reply deadline has passed',
    params: {}, alert: { below: 90, criticalBelow: 75 }, run: (c) => support('first', c) },
  { key: 'support.resolution', name: 'Resolved on time', domain: 'Help desk', scope: 'school', minLevel: 'admin', unit: 'requests', private: false,
    numerator: 'Requests opened in the period that were resolved by the deadline', denominator: 'Requests opened in the period that were resolved or whose resolution deadline has passed',
    params: {}, alert: { below: 85, criticalBelow: 70 }, run: (c) => support('resolve', c) },
  { key: 'library.overdue', name: 'Library loans overdue', domain: 'Library', scope: 'school', minLevel: 'admin', unit: 'loans', private: false,
    numerator: 'Open loans past their due date on the last day of the period', denominator: 'Open loans on the last day of the period',
    params: {}, alert: { above: 20, criticalAbove: 40 }, run: library },
  { key: 'transport.on_time', name: 'Bus trips on time', domain: 'Transport', scope: 'school', minLevel: 'admin', unit: 'trips', private: false,
    numerator: 'Completed trips that ended no later than the allowed delay', denominator: 'Completed trips in the period',
    params: { toleranceMin: { type: 'number', min: 0, max: 60, def: 10, label: 'Allowed delay (minutes)' } }, alert: { below: 90, criticalBelow: 75 }, run: transport },
  { key: 'staff.attendance', name: 'Staff attendance', domain: 'Staff', scope: 'school', minLevel: 'admin', unit: 'staff-days', private: true,
    numerator: 'Staff-days present (late and half days count as present unless the school says otherwise)', denominator: 'Staff-days marked, leaving out approved leave unless the school says otherwise',
    params: { ...SETS }, alert: {}, run: staff },
];
const BY_KEY = new Map(CATALOG.map((m) => [m.key, m]));
const LEVEL_NAME = { teacher: 'every teacher (their own classes)', lead: 'curriculum leads (whole school) and administrators', admin: 'administrators' };
const roleScope = (d) => {
  const lv = d.minLevel; const wide = d.scope === 'class' ? 'whole school (a campus administrator sees only their campuses)' : 'whole school (not shown to a campus administrator)';
  if (lv === 'teacher') return `Teachers: their own classes. Curriculum leads: whole school. Administrators: ${wide}.`;
  if (lv === 'lead') return `Curriculum leads: whole school. Administrators: ${wide}. Teachers: not shown.`;
  return `Administrators: ${wide}. Teachers: not shown.`;
};

/* ───────── definitions in force for a school ───────── */
const defaults = (spec) => Object.fromEntries(Object.entries(spec).map(([k, s]) => [k, s.def]));
function cleanParams(spec, given, strict = true) {
  const out = {};
  for (const [k, v] of Object.entries(given || {})) {
    const s = spec[k]; if (!s) { if (strict) throw new Fail(422, `"${k}" is not a setting of this measure.`); continue; }
    if (s.type === 'enum') { if (!s.values.includes(v)) throw new Fail(422, `${s.label}: choose one of ${s.values.join(', ')}.`); out[k] = v; }
    else { const x = Number(v); if (!Number.isFinite(x) || !Number.isInteger(x) || x < s.min || x > s.max) throw new Fail(422, `${s.label} must be a whole number from ${s.min} to ${s.max}.`); out[k] = x; }
  }
  return out;
}
const cleanAlert = (a) => { const out = {}; for (const k of ['below', 'above', 'criticalBelow', 'criticalAbove']) { if (a?.[k] === undefined || a[k] === null || a[k] === '') continue; const x = Number(a[k]); if (!Number.isFinite(x) || x < 0 || x > 100000000) throw new Fail(422, `The ${k} line must be a number.`); out[k] = x; }
  if (out.below !== undefined && out.criticalBelow !== undefined && out.criticalBelow > out.below) throw new Fail(422, 'The urgent "below" line must not be higher than the "below" line.');
  if (out.above !== undefined && out.criticalAbove !== undefined && out.criticalAbove < out.above) throw new Fail(422, 'The urgent "above" line must not be lower than the "above" line.');
  return out; };
const higher = (a, b) => (S.RANK[a] >= S.RANK[b] ? a : b);

function build(base, doc) {
  const v = doc && doc.published ? doc.versions.find((x) => x.version === doc.published) : null;
  const filters = { standards: v?.filters?.standards || [], classIds: v?.filters?.classIds || [], subjectIds: v?.filters?.subjectIds || [] };
  const d = {
    key: doc?.custom ? doc.key : base.key, baseKey: base.key, custom: !!doc?.custom, name: (doc?.custom ? v?.name : '') || base.name, domain: base.domain, scope: base.scope, unit: base.unit, private: base.private,
    numerator: base.numerator, denominator: base.denominator, paramSpec: base.params,
    params: { ...defaults(base.params), ...(v?.params || {}) }, filters, alert: { ...base.alert, ...(v?.alert || {}) }, target: v?.target ?? null,
    minCell: v?.minCell || 5, minLevel: v?.minLevel ? higher(base.minLevel, v.minLevel) : base.minLevel, version: v ? v.version : 0, run: base.run,
  };
  d.roleScope = roleScope(d); return d;
}
async function definitions(schoolId, { includeRetired = false } = {}) {
  const docs = await AnMetric.find({ schoolId: S.oid(schoolId) }).lean(); const byKey = new Map(docs.map((d) => [d.key, d])); const out = new Map();
  for (const b of CATALOG) out.set(b.key, build(b, byKey.get(b.key)));
  for (const d of docs) if (d.custom && BY_KEY.has(d.baseKey) && (includeRetired || !d.retired) && (d.published || includeRetired)) out.set(d.key, build(BY_KEY.get(d.baseKey), d));
  return out;
}
// may this viewer see this measure, and if not, why
function canSee(def, scope) {
  if (!scope) return { ok: false, why: 'You cannot use analytics.' };
  if (S.RANK[scope.level] < S.RANK[def.minLevel]) return { ok: false, why: def.minLevel === 'admin' ? 'Only administrators see this measure.' : 'Only curriculum leads and administrators see this measure.' };
  if (def.scope === 'school' && scope.limited) return { ok: false, why: 'This measure covers the whole school and cannot be cut to your campuses.' };
  return { ok: true };
}
const view = (d) => ({ key: d.key, baseKey: d.baseKey, custom: d.custom, name: d.name, domain: d.domain, unit: d.unit, numerator: d.numerator, denominator: d.denominator, roleScope: d.roleScope, scope: d.scope, minLevel: d.minLevel, minCell: d.minCell, private: d.private,
  params: d.params, paramSpec: d.paramSpec, filters: d.filters, alert: d.alert, target: d.target, version: d.version });

/* ───────── measuring ───────── */
async function classBook(schoolId) {
  const sid = S.oid(schoolId); const [classes, campuses, def] = await Promise.all([Class.find({ schoolId: sid }).select('standard division campusId').lean(), Campus.find({ schoolId: sid }).select('name isDefault').lean(), Campus.findOne({ schoolId: sid, isDefault: true }).select('_id').lean()]);
  const cname = new Map(campuses.map((c) => [String(c._id), c.name])); const defName = def ? cname.get(String(def._id)) : 'Main campus';
  return new Map(classes.map((c) => [String(c._id), { label: `${c.standard}-${c.division}`, standard: String(c.standard), campusId: c.campusId ? String(c.campusId) : 'default', campus: c.campusId ? (cname.get(String(c.campusId)) || 'Campus') : (defName || 'Main campus') }]));
}
// the classes a measure may look at: the viewer's classes, narrowed by any filter of a custom measure; null = no limit
function classLimit(def, scope, book) {
  let ids = scope.classIds; const f = def.filters || {};
  const narrow = (list) => { ids = ids === null ? list : ids.filter((x) => list.includes(x)); };
  if (f.classIds?.length) narrow(f.classIds.map(String));
  if (f.standards?.length) narrow([...book].filter(([, c]) => f.standards.includes(c.standard)).map(([id]) => id));
  return ids;
}
const GROUPS = ['none', 'class', 'standard', 'campus'];
async function measure(schoolId, def, { from, to, groupBy = 'none', scope, today }) {
  if (!GROUPS.includes(groupBy)) throw new Fail(422, `Group by one of ${GROUPS.join(', ')}.`);
  if (def.scope === 'school' && groupBy !== 'none') groupBy = 'none';
  const book = await classBook(schoolId); const ids = classLimit(def, scope, book);
  const raw = ids && !ids.length && def.scope === 'class' ? { rows: [], ent: {} } : await def.run({ schoolId, from, to, ids: def.scope === 'class' ? ids : null, params: def.params, filters: def.filters, today: today || to });
  return fold(def, raw, { from, to, groupBy, book });
}
const value = (def, num, den) => (den > 0 ? (def.unit === 'count' ? num : r1((num * 100) / den)) : null);
function fold(def, raw, { from, to, groupBy, book }) {
  const total = { num: 0, den: 0 }; const series = new Map(); const groups = new Map();
  const gk = (classId) => {
    if (groupBy === 'class') return classId || '';
    const c = book.get(classId); if (groupBy === 'standard') return c ? c.standard : ''; if (groupBy === 'campus') return c ? c.campusId : '';
    return 'all';
  };
  const label = (k) => { if (groupBy === 'class') return book.get(k)?.label || 'Not placed in a class'; if (groupBy === 'standard') return k ? `Grade ${k}` : 'Not placed in a class'; if (groupBy === 'campus') return [...book.values()].find((c) => c.campusId === k)?.campus || (k === 'default' ? 'Main campus' : 'Not placed'); return 'All'; };
  const classesInGroup = new Map();
  for (const r of raw.rows) {
    total.num += r.num; total.den += r.den;
    const s = series.get(r.ym) || { ym: r.ym, num: 0, den: 0 }; s.num += r.num; s.den += r.den; series.set(r.ym, s);
    if (groupBy !== 'none') { const k = gk(r.classId); const g = groups.get(k) || { key: k, label: label(k), num: 0, den: 0, ent: 0 }; g.num += r.num; g.den += r.den; groups.set(k, g); if (!classesInGroup.has(k)) classesInGroup.set(k, new Set()); classesInGroup.get(k).add(r.classId); }
  }
  const ent = raw.ent || {}; const hasEnt = def.private && (raw.entTotal !== null && raw.entTotal !== undefined ? true : Object.keys(ent).length > 0);
  const classesSeen = new Set(raw.rows.map((r) => r.classId));
  const entTotal = raw.entTotal ?? [...classesSeen].reduce((s, c) => s + (ent[c] || 0), 0);
  for (const [k, g] of groups) g.ent = [...classesInGroup.get(k)].reduce((s, c) => s + (ent[c] || 0), 0);
  const hide = (n) => def.private && hasEnt && n < def.minCell;
  const totalHidden = raw.rows.length > 0 && hide(entTotal);
  const list = [...groups.values()].map((g) => ({ ...g, suppressed: hide(g.ent) }));
  // a hidden group could be worked out from the total and the others, so hide the next smallest one too
  if (!totalHidden && list.filter((g) => g.suppressed).length === 1) { const rest = list.filter((g) => !g.suppressed).sort((a, b) => a.ent - b.ent)[0]; if (rest) { rest.suppressed = true; rest.secondary = true; } }
  const shown = (g) => (g.suppressed ? { key: g.key, label: g.label, ent: null, num: null, den: null, value: null, suppressed: true } : { key: g.key, label: g.label, ent: g.ent, num: g.num, den: g.den, value: value(def, g.num, g.den), suppressed: false });
  return {
    key: def.key, name: def.name, domain: def.domain, unit: def.unit, numerator: def.numerator, denominator: def.denominator, version: def.version, from, to, groupBy, minCell: def.minCell, target: def.target, alert: def.alert,
    total: totalHidden ? { num: null, den: null, value: null, ent: null, suppressed: true } : { num: total.num, den: total.den, value: value(def, total.num, total.den), ent: def.private ? entTotal : null, suppressed: false },
    groups: list.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true })).map(shown),
    series: totalHidden ? [] : [...series.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((s) => ({ ym: s.ym, num: s.num, den: s.den, value: value(def, s.num, s.den) })),
    noData: raw.rows.length === 0,
  };
}

/* ───────── writing a definition ───────── */
// A draft for a built-in measure (or a new custom one). Narrowing only: a measure can be made stricter, never wider.
function cleanDraft(base, body, { custom = false } = {}) {
  const b = body || {};
  const v = { params: cleanParams(base.params, b.params), alert: cleanAlert(b.alert), filters: { standards: [], classIds: [], subjectIds: [] }, target: null, minCell: 5, minLevel: '' };
  if (b.target !== undefined && b.target !== null && b.target !== '') { const t = Number(b.target); if (!Number.isFinite(t) || t < 0 || t > 100000000) throw new Fail(422, 'The target must be a number.'); v.target = t; }
  if (b.minCell !== undefined && b.minCell !== null && b.minCell !== '') { const m = Number(b.minCell); if (!Number.isInteger(m) || m < 1 || m > 30) throw new Fail(422, 'The smallest group shown must be a whole number from 1 to 30.'); v.minCell = m; }
  if (b.minLevel) { if (!S.RANK[b.minLevel]) throw new Fail(422, 'Choose teacher, lead or admin.'); if (S.RANK[b.minLevel] < S.RANK[base.minLevel]) throw new Fail(422, 'A measure can be restricted to fewer people, never opened to more.'); v.minLevel = b.minLevel; }
  const ids = (x) => (Array.isArray(x) ? [...new Set(x.map(String))].slice(0, 200) : []);
  if (custom) { v.filters = { standards: ids(b.filters?.standards), classIds: ids(b.filters?.classIds), subjectIds: ids(b.filters?.subjectIds) }; if (!v.filters.standards.length && !v.filters.classIds.length && !v.filters.subjectIds.length) throw new Fail(422, 'Choose at least one grade, class or subject to narrow the measure to.'); }
  return v;
}

module.exports = { CATALOG, BY_KEY, definitions, canSee, view, measure, classBook, studentClass, cleanDraft, cleanParams, cleanAlert, GROUPS, roleScope, build, att, filt, rows, start, end, r1 };
