// The group view (PRD E26): every campus side by side, measured with the same definitions as the analytics module (E25).
// A viewer only ever gets campuses they are allowed to see. Totals are computed from those campuses alone, so nothing outside can be worked out by subtraction.
const S = require('../analytics/service');
const Cat = require('../analytics/catalog');
const CS = require('../campus');
const P = require('./policy');
const { BY_KEY, view } = require('./catalog');
const Campus = require('../../models/Campus');
const Class = require('../../models/Class');
const Student = require('../../models/Student');
const Teacher = require('../../models/Teacher');
const CampusPolicy = require('../../models/CampusPolicy');

const { Fail, oid } = S;
const MEASURES = [
  { key: 'attendance.rate', target: 'target.attendanceRate', good: 'up' },
  { key: 'learning.average', target: 'target.learningAverage', good: 'up' },
  { key: 'fees.collection', target: 'target.feeCollection', good: 'up' },
  { key: 'fees.overdue', target: null, good: 'down' },
];

// the campuses a person may look at and the classes in them; null classIds means the whole school
async function vision(user) {
  const sc = await CS.scopeOf(user); const schoolId = user.schoolId; const def = await CS.ensureDefault(schoolId);
  const all = await Campus.find({ schoolId: oid(schoolId) }).sort({ isDefault: -1, name: 1 }).lean();
  const campuses = sc ? all.filter((c) => sc.campusIds.includes(String(c._id))) : all;
  return { wide: !sc, scope: sc, campuses, defaultId: String(def._id), classIds: sc ? [...sc.classIds].sort() : null, includeUnassigned: sc ? sc.includeUnassigned : true };
}

async function counts(schoolId, v) {
  const sid = oid(schoolId); const classes = await Class.find({ schoolId: sid }).select('standard division campusId classTeacherId').lean();
  const campusOf = new Map(classes.map((c) => [String(c._id), c.campusId ? String(c.campusId) : v.defaultId]));
  const lim = v.classIds ? new Set(v.classIds) : null; const shown = new Set(v.campuses.map((c) => String(c._id)));
  const rows = new Map([...shown].map((id) => [id, { classes: 0, students: 0, teachers: new Set() }]));
  for (const c of classes) { if (lim && !lim.has(String(c._id))) continue; const k = campusOf.get(String(c._id)); if (rows.has(k)) rows.get(k).classes += 1; }
  for (const s of await Student.find({ schoolId: sid, isActive: { $ne: false } }).select('classId').lean()) {
    let k; if (s.classId) { if (lim && !lim.has(String(s.classId))) continue; k = campusOf.get(String(s.classId)); } else { if (!v.includeUnassigned) continue; k = v.defaultId; }
    if (rows.has(k)) rows.get(k).students += 1;
  }
  const add = (cid, tid) => { if (lim && !lim.has(String(cid))) return; const k = campusOf.get(String(cid)); if (rows.has(k)) rows.get(k).teachers.add(String(tid)); };
  for (const c of classes) if (c.classTeacherId) add(c._id, c.classTeacherId);
  for (const t of await Teacher.find({ schoolId: sid, isActive: { $ne: false } }).select('classIds subjectClassAssignments').lean()) { for (const c of t.classIds || []) add(c, t._id); for (const a of t.subjectClassAssignments || []) if (a.classId) add(a.classId, t._id); }
  return { rows, campusOf };
}

const r1 = Cat.r1;
async function rollup(user, { from, to }) {
  const schoolId = user.schoolId; const v = await vision(user); const defs = await Cat.definitions(schoolId); const today = await S.today(schoolId);
  const prev = S.previous({ from, to }); const { rows } = await counts(schoolId, v); const limitScope = { classIds: v.classIds };
  const cells = new Map(); const totals = {}; const hidden = [];
  for (const m of MEASURES) {
    const d = defs.get(m.key); if (!d) continue;
    const ok = Cat.canSee(d, { level: 'admin', limited: !v.wide, classIds: v.classIds }); if (!ok.ok) { hidden.push({ key: m.key, name: d.name, why: ok.why }); continue; }
    const [cur, pv] = await Promise.all([Cat.measure(schoolId, d, { from, to, groupBy: 'campus', scope: limitScope, today }), Cat.measure(schoolId, d, { from: prev.from, to: prev.to, groupBy: 'campus', scope: limitScope, today })]);
    const pmap = new Map(pv.groups.map((g) => [g.key === 'default' ? v.defaultId : g.key, g]));
    for (const g of cur.groups) { const k = g.key === 'default' ? v.defaultId : g.key; const p = pmap.get(k); cells.set(`${k}|${m.key}`, { value: g.value, suppressed: !!g.suppressed, num: g.suppressed ? null : g.num, den: g.suppressed ? null : g.den, change: !g.suppressed && p && !p.suppressed && g.value !== null && p.value !== null ? r1(g.value - p.value) : null }); }
    totals[m.key] = { name: d.name, unit: d.unit, ...cur.total, previous: pv.total.suppressed ? null : pv.total.value };
  }
  const polDocs = await P.load(schoolId, { fresh: true });
  const out = []; const exceptions = [];
  for (const c of v.campuses) {
    const id = String(c._id); const n = rows.get(id) || { classes: 0, students: 0, teachers: new Set() };
    const tbl = await P.table(schoolId, id); const by = new Map(tbl.map((t) => [t.key, t]));
    const measures = {};
    for (const m of MEASURES) {
      const d = defs.get(m.key); if (!d || !totals[m.key]) continue; const cell = cells.get(`${id}|${m.key}`) || { value: null, suppressed: false, num: null, den: null, change: null };
      const target = m.target ? by.get(m.target) : null; const tv = target && target.value !== null && target.value !== undefined ? target.value : null;
      const gap = tv !== null && !cell.suppressed && cell.value !== null ? r1(cell.value - tv) : null;
      measures[m.key] = { ...cell, target: tv, targetSource: target ? target.source : null, gap };
      if (gap !== null && gap < 0) exceptions.push({ campusId: id, campusName: c.name, metricKey: m.key, name: d.name, value: cell.value, target: tv, gap, severity: gap <= -10 ? 'critical' : 'warn', message: `${d.name} at ${c.name} is ${cell.value}%, ${Math.abs(gap)} points under its target of ${tv}%.` });
    }
    const cap = by.get('capacity.students'); const capacity = cap && cap.value > 0 ? cap.value : null;
    const mine = polDocs.filter((x) => x.scope === 'campus' && String(x.campusId) === id);
    out.push({ campusId: id, name: c.name, code: c.code, isDefault: !!c.isDefault, status: c.status, students: n.students, classes: n.classes, teachers: n.teachers.size, capacity, fill: capacity ? r1((n.students * 100) / capacity) : null, measures,
      overrides: tbl.filter((t) => t.source.kind === 'campus').length, ignoredOverrides: tbl.filter((t) => t.ignored).length, waiting: mine.filter((x) => P.pending(x)).length });
  }
  exceptions.sort((a, b) => (a.severity === b.severity ? a.gap - b.gap : a.severity === 'critical' ? -1 : 1));
  const sum = (k) => out.reduce((s, c) => s + c[k], 0);
  return { from, to, previous: prev, wide: v.wide, scopeNote: v.wide ? 'Every campus of the school.' : 'Only the campuses you administer. Nothing outside them is counted.', campuses: out,
    group: { students: sum('students'), classes: sum('classes'), campuses: out.length, measures: totals }, exceptions, hidden };
}

// one campus in more detail: its classes, with the same suppression rules
async function detail(user, campusId, { from, to }) {
  const schoolId = user.schoolId; const v = await vision(user); const camp = v.campuses.find((c) => String(c._id) === String(campusId));
  if (!camp) throw new Fail(404, 'Campus not found.');
  const defs = await Cat.definitions(schoolId); const today = await S.today(schoolId); const id = String(camp._id);
  const classes = (await Class.find({ schoolId: oid(schoolId) }).select('standard division campusId').lean()).filter((c) => (c.campusId ? String(c.campusId) : v.defaultId) === id && (!v.classIds || v.classIds.includes(String(c._id))));
  const ids = classes.map((c) => String(c._id)); const lim = { classIds: ids };
  const stud = new Map(); for (const s of await Student.find({ schoolId: oid(schoolId), isActive: { $ne: false }, classId: { $in: ids.map(oid) } }).select('classId').lean()) stud.set(String(s.classId), (stud.get(String(s.classId)) || 0) + 1);
  const meas = {};
  for (const key of ['attendance.rate', 'learning.average', 'fees.collection']) {
    const d = defs.get(key); if (!d || !Cat.canSee(d, { level: 'admin', limited: !v.wide, classIds: ids }).ok) continue;
    const r = ids.length ? await Cat.measure(schoolId, d, { from, to, groupBy: 'class', scope: lim, today }) : { groups: [], total: { value: null, suppressed: false } };
    meas[key] = { name: d.name, total: r.total, byClass: new Map(r.groups.map((g) => [g.key, g])) };
  }
  const rows = classes.sort((a, b) => String(a.standard).localeCompare(String(b.standard), undefined, { numeric: true }) || String(a.division).localeCompare(String(b.division))).map((c) => ({
    classId: String(c._id), label: `${c.standard}-${c.division}`, standard: String(c.standard), students: stud.get(String(c._id)) || 0,
    measures: Object.fromEntries(Object.entries(meas).map(([k, m]) => { const g = m.byClass.get(String(c._id)); return [k, g ? { value: g.value, suppressed: !!g.suppressed } : { value: null, suppressed: false }]; })) }));
  return { from, to, campus: { campusId: id, name: camp.name, code: camp.code, address: camp.address, isDefault: !!camp.isDefault, status: camp.status }, classes: rows, measures: Object.fromEntries(Object.entries(meas).map(([k, m]) => [k, { name: m.name, total: m.total }])), policies: (await P.table(schoolId, id)).map((r) => ({ ...view(BY_KEY.get(r.key)), ...r })) };
}

module.exports = { vision, rollup, detail, MEASURES };
