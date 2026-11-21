// OneRoster 1.1 rostering, read-only (PRD CAP-0108). The school is the district, each campus a school, each class a homeroom class.
// What is shown depends on the key's scopes: names and class membership by default; contact details and guardian links only when the key has been given them.
const mongoose = require('../../lib/pgdoc');
const School = require('../../models/School');
const Campus = require('../../models/Campus');
const Class = require('../../models/Class');
const Student = require('../../models/Student');
const Teacher = require('../../models/Teacher');
const Parent = require('../../models/Parent');
const CS = require('../campus');

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const iso = (d) => (d ? new Date(d).toISOString() : new Date(0).toISOString());
class OrError extends Error { constructor(status, desc, minor) { super(desc); this.status = status; this.minor = minor; } }

const ref = (base, type, id, set) => ({ href: `${base}/${type}/${id}`, sourcedId: String(id), type: set || type.replace(/s$/, '') });
const split = (name) => { const p = String(name || '').trim().split(/\s+/); return p.length < 2 ? { given: p[0] || '', family: '' } : { given: p.slice(0, -1).join(' '), family: p[p.length - 1] }; };
const yearOf = (y) => { const m = String(y || '').match(/(\d{4})(?:\D+(\d{2,4}))?/); if (!m) return null; const a = Number(m[1]); let b = m[2] ? Number(m[2]) : a; if (b < 100) b = Math.floor(a / 100) * 100 + b; return { from: a, to: Math.max(a, b) }; };

// everything about the school the standard can show, for one key
async function load(api) {
  const schoolId = api.schoolId; const sid = oid(schoolId); const has = (s) => api.scopes.includes(s);
  const school = await School.findById(sid).select('name code updatedAt createdAt').lean(); const def = await CS.ensureDefault(schoolId);
  const camps = await Campus.find({ schoolId: sid }).sort({ isDefault: -1, name: 1 }).lean();
  const allowed = api.campusIds && api.campusIds.length ? new Set(api.campusIds.map(String)) : null;
  const campuses = camps.filter((c) => c.status !== 'closed' && (!allowed || allowed.has(String(c._id))));
  const shown = new Set(campuses.map((c) => String(c._id)));
  const classesAll = await Class.find({ schoolId: sid }).select('standard division room academicYear campusId classTeacherId updatedAt createdAt').lean();
  const campusOf = (c) => (c.campusId ? String(c.campusId) : String(def._id));
  const classes = classesAll.filter((c) => shown.has(campusOf(c)));
  const classIds = new Set(classes.map((c) => String(c._id)));
  return { school, def, campuses, shown, classes, classIds, campusOf, has, sid };
}

function build(d, base) {
  const { school, campuses, classes, has } = d; const out = {};
  const district = { sourcedId: String(school._id), status: 'active', dateLastModified: iso(school.updatedAt || school.createdAt), name: school.name, type: 'district', identifier: school.code, parent: null, children: campuses.map((c) => ref(base, 'orgs', c._id, 'org')) };
  const schools = campuses.map((c) => ({ sourcedId: String(c._id), status: c.status === 'closed' ? 'tobedeleted' : 'active', dateLastModified: iso(c.updatedAt || c.createdAt), name: c.name, type: 'school', identifier: c.code || null, parent: ref(base, 'orgs', school._id, 'org'), children: [] }));
  out.orgs = [district, ...schools]; out.schools = schools;
  const years = [...new Set(classes.map((c) => c.academicYear).filter(Boolean))].sort();
  out.academicSessions = years.map((y) => { const r = yearOf(y); return { sourcedId: `ay-${String(y).replace(/[^A-Za-z0-9]+/g, '-')}`, status: 'active', dateLastModified: iso(school.updatedAt), title: `Academic year ${y}`, type: 'schoolYear', startDate: r ? `${r.from}-01-01` : null, endDate: r ? `${r.to}-12-31` : null, parent: null, children: [], schoolYear: r ? String(r.to) : String(y) }; });
  const sessionOf = (y) => (y ? out.academicSessions.find((s) => s.title === `Academic year ${y}`) : null);
  const standards = [...new Set(classes.map((c) => String(c.standard)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  out.courses = standards.map((s) => ({ sourcedId: `course-${s}`, status: 'active', dateLastModified: iso(school.updatedAt), title: `Grade ${s}`, schoolYear: null, courseCode: s, grades: [s], subjects: [], org: ref(base, 'orgs', school._id, 'org'), subjectCodes: [], resources: null }));
  out.classes = classes.map((c) => { const t = sessionOf(c.academicYear); return { sourcedId: String(c._id), status: 'active', dateLastModified: iso(c.updatedAt || c.createdAt), title: `${c.standard}-${c.division}`, classCode: `${c.standard}${c.division}`, classType: 'homeroom', location: c.room || null, grades: [String(c.standard)], subjects: [], course: { href: `${base}/courses/course-${c.standard}`, sourcedId: `course-${c.standard}`, type: 'course' }, school: ref(base, 'orgs', d.campusOf(c), 'org'), terms: t ? [{ href: `${base}/academicSessions/${t.sourcedId}`, sourcedId: t.sourcedId, type: 'academicSession' }] : [], subjectCodes: [], periods: [], resources: null }; });
  return out;
}

async function people(d, base, wantTeachers, wantStudents, wantGuardians) {
  const { has, classes, classIds, shown, def, sid } = d; const users = []; const enrollments = []; const campusOf = d.campusOf;
  const classMap = new Map(classes.map((c) => [String(c._id), c]));
  const contact = has('roster.contact'); const guardians = has('roster.guardians');
  let studs = [];
  if (wantStudents || wantGuardians) {
    studs = (await Student.find({ schoolId: sid }).select('name email phone classId isActive admissionNumber updatedAt createdAt').lean()).filter((s) => (s.classId ? classIds.has(String(s.classId)) : shown.has(String(def._id))));
  }
  const kids = new Map(studs.map((s) => [String(s._id), s])); const agentsOf = new Map();
  if (guardians && (wantStudents || wantGuardians) && studs.length) {
    for (const p of await Parent.find({ schoolId: sid, children: { $in: studs.map((s) => s._id) } }).select('name email phone children isActive updatedAt createdAt').lean()) {
      const mine = (p.children || []).map(String).filter((id) => kids.has(id)); if (!mine.length) continue;
      for (const k of mine) { if (!agentsOf.has(k)) agentsOf.set(k, []); agentsOf.get(k).push(p); }
      if (wantGuardians) { const n = split(p.name); users.push({ sourcedId: String(p._id), status: p.isActive === false ? 'tobedeleted' : 'active', dateLastModified: iso(p.updatedAt || p.createdAt), enabledUser: p.isActive !== false, givenName: n.given, familyName: n.family, role: 'parent', identifier: null, userIds: [], orgs: [ref(base, 'orgs', def._id, 'org')], grades: [], agents: mine.map((id) => ({ href: `${base}/users/${id}`, sourcedId: id, type: 'user' })), ...(contact ? { email: p.email || null, phone: p.phone || null } : {}) }); }
    }
  }
  if (wantStudents) for (const s of studs) {
    const n = split(s.name); const cls = s.classId ? classMap.get(String(s.classId)) : null; const camp = cls ? campusOf(cls) : String(def._id);
    users.push({ sourcedId: String(s._id), status: s.isActive === false ? 'tobedeleted' : 'active', dateLastModified: iso(s.updatedAt || s.createdAt), enabledUser: s.isActive !== false, givenName: n.given, familyName: n.family, role: 'student', identifier: s.admissionNumber || null, userIds: [], orgs: [ref(base, 'orgs', camp, 'org')], grades: cls ? [String(cls.standard)] : [], agents: (agentsOf.get(String(s._id)) || []).map((p) => ({ href: `${base}/users/${p._id}`, sourcedId: String(p._id), type: 'user' })), ...(contact ? { email: s.email || null, phone: s.phone || null } : {}) });
    if (cls) enrollments.push({ sourcedId: `enr-${s._id}-${cls._id}`, status: s.isActive === false ? 'tobedeleted' : 'active', dateLastModified: iso(s.updatedAt || s.createdAt), role: 'student', primary: false, beginDate: null, endDate: null, user: ref(base, 'users', s._id, 'user'), class: ref(base, 'classes', cls._id, 'class'), school: ref(base, 'orgs', campusOf(cls), 'org') });
  }
  if (wantTeachers) {
    const link = new Map();      // teacherId -> Map(classId -> primary)
    const add = (t, c, primary) => { const k = String(t); if (!link.has(k)) link.set(k, new Map()); if (primary || !link.get(k).has(String(c))) link.get(k).set(String(c), !!primary || link.get(k).get(String(c)) === true); };
    for (const c of classes) if (c.classTeacherId) add(c.classTeacherId, c._id, true);
    const teachers = await Teacher.find({ schoolId: sid }).select('name email phone isActive classIds subjectClassAssignments updatedAt createdAt').lean();
    for (const t of teachers) { for (const c of t.classIds || []) if (classIds.has(String(c))) add(t._id, c, false); for (const a of t.subjectClassAssignments || []) if (a.classId && classIds.has(String(a.classId))) add(t._id, a.classId, false); }
    for (const t of teachers) {
      const mine = link.get(String(t._id)); if (!mine || !mine.size) continue; const n = split(t.name); const camps = [...new Set([...mine.keys()].map((id) => campusOf(classMap.get(id))))];
      users.push({ sourcedId: String(t._id), status: t.isActive === false ? 'tobedeleted' : 'active', dateLastModified: iso(t.updatedAt || t.createdAt), enabledUser: t.isActive !== false, givenName: n.given, familyName: n.family, role: 'teacher', identifier: null, userIds: [], orgs: camps.map((c) => ref(base, 'orgs', c, 'org')), grades: [], agents: [], ...(contact ? { email: t.email || null, phone: t.phone || null } : {}) });
      for (const [cid, primary] of mine) { const cls = classMap.get(cid); enrollments.push({ sourcedId: `enr-${t._id}-${cid}`, status: t.isActive === false ? 'tobedeleted' : 'active', dateLastModified: iso(t.updatedAt || t.createdAt), role: 'teacher', primary, beginDate: null, endDate: null, user: ref(base, 'users', t._id, 'user'), class: ref(base, 'classes', cid, 'class'), school: ref(base, 'orgs', campusOf(cls), 'org') }); }
    }
  }
  return { users, enrollments };
}

/* ───────── query: filter, sort, fields, paging ───────── */
const OPS = ['>=', '<=', '!=', '=', '>', '<', '~'];
function parseFilter(text, fields) {
  const bad = (m) => new OrError(400, m, 'invalid_filter_field');
  const orGroups = String(text).split(/\s+OR\s+(?=(?:[^']*'[^']*')*[^']*$)/).map((g) => g.split(/\s+AND\s+(?=(?:[^']*'[^']*')*[^']*$)/));
  return orGroups.map((ands) => ands.map((p) => {
    const m = p.trim().match(/^([A-Za-z][A-Za-z0-9_.]*)\s*(>=|<=|!=|=|>|<|~)\s*'((?:[^']|'')*)'$/); if (!m) throw bad('The filter could not be read. Use field=\'value\', joined with AND or OR.');
    if (!fields.has(m[1].split('.')[0])) throw bad(`The filter field ${m[1]} does not exist on this resource.`);
    return { field: m[1], op: m[2], value: m[3].replace(/''/g, "'") };
  }));
}
const dig = (o, path) => path.split('.').reduce((a, k) => (a === null || a === undefined ? undefined : Array.isArray(a) ? a.map((x) => x && x[k]) : a[k]), o);
const holds = (row, f) => {
  const got = dig(row, f.field); const arr = Array.isArray(got) ? got.flat() : [got];
  return arr.some((g) => {
    const a = g === null || g === undefined ? '' : String(g); const b = f.value; const num = a !== '' && b !== '' && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));
    const x = num ? Number(a) : a; const y = num ? Number(b) : b;
    switch (f.op) { case '=': return x === y; case '!=': return x !== y; case '>': return x > y; case '>=': return x >= y; case '<': return x < y; case '<=': return x <= y; case '~': return String(a).toLowerCase().includes(String(b).toLowerCase()); default: return false; }
  });
};
const num = (v, name, dflt, max) => { if (v === undefined || v === '') return dflt; if (!/^\d+$/.test(String(v))) throw new OrError(400, `${name} must be a whole number.`, 'invalid_data'); return Math.min(max, Number(v)); };

function query(rows, q, fields) {
  let out = rows;
  if (q.filter) { const groups = parseFilter(q.filter, fields); out = out.filter((r) => groups.some((ands) => ands.every((f) => holds(r, f)))); }
  const sort = q.sort; if (sort) { if (!fields.has(sort)) throw new OrError(400, `Cannot sort by ${sort}.`, 'invalid_sort_field'); const dir = String(q.orderBy || 'asc').toLowerCase(); if (!['asc', 'desc'].includes(dir)) throw new OrError(400, 'orderBy must be asc or desc.', 'invalid_data'); out = [...out].sort((a, b) => { const x = String(dig(a, sort) ?? ''); const y = String(dig(b, sort) ?? ''); return (x.localeCompare(y, undefined, { numeric: true })) * (dir === 'desc' ? -1 : 1); }); }
  const total = out.length; const limit = num(q.limit, 'limit', 100, 1000); const offset = num(q.offset, 'offset', 0, Number.MAX_SAFE_INTEGER);
  out = out.slice(offset, offset + limit);
  if (q.fields) { const want = String(q.fields).split(',').map((f) => f.trim()).filter(Boolean); const badf = want.find((f) => !fields.has(f)); if (badf) throw new OrError(400, `Cannot select ${badf}.`, 'invalid_selection_field'); out = out.map((r) => Object.fromEntries(want.map((f) => [f, r[f]]))); }
  return { rows: out, total, limit, offset };
}
const fieldsOf = (rows, sample) => new Set(rows.length ? Object.keys(rows[0]) : sample);
const SAMPLE = { orgs: ['sourcedId', 'status', 'dateLastModified', 'name', 'type', 'identifier', 'parent', 'children'], academicSessions: ['sourcedId', 'status', 'dateLastModified', 'title', 'type', 'startDate', 'endDate', 'parent', 'children', 'schoolYear'], courses: ['sourcedId', 'status', 'dateLastModified', 'title', 'schoolYear', 'courseCode', 'grades', 'subjects', 'org', 'subjectCodes', 'resources'], classes: ['sourcedId', 'status', 'dateLastModified', 'title', 'classCode', 'classType', 'location', 'grades', 'subjects', 'course', 'school', 'terms', 'subjectCodes', 'periods', 'resources'], users: ['sourcedId', 'status', 'dateLastModified', 'enabledUser', 'givenName', 'familyName', 'role', 'identifier', 'userIds', 'orgs', 'grades', 'agents', 'email', 'phone'], enrollments: ['sourcedId', 'status', 'dateLastModified', 'role', 'primary', 'beginDate', 'endDate', 'user', 'class', 'school'] };

const SINGULAR = { orgs: 'org', schools: 'org', academicSessions: 'academicSession', terms: 'academicSession', courses: 'course', classes: 'class', users: 'user', students: 'user', teachers: 'user', enrollments: 'enrollment' };
const COLLECTION = { orgs: 'orgs', schools: 'orgs', academicSessions: 'academicSessions', terms: 'academicSessions', courses: 'courses', classes: 'classes', users: 'users', students: 'users', teachers: 'users', enrollments: 'enrollments' };
const SET = { orgs: 'orgs', schools: 'schools', academicSessions: 'academicSessions', terms: 'terms', courses: 'courses', classes: 'classes', users: 'users', students: 'users', teachers: 'users', enrollments: 'enrollments' };

// resolves one request: which resource, optionally one id, optionally a parent ("classes/:id/students")
async function answer(api, base, { resource, id, parent, parentId, q }) {
  const d = await load(api); const b = build(d, base); let rows; const cats = ['identity', 'class membership'];
  const wantStudents = ['users', 'students', 'enrollments'].includes(resource); const wantTeachers = ['users', 'teachers', 'enrollments'].includes(resource); const wantG = resource === 'users';
  if (b[resource] !== undefined && !['users', 'students', 'teachers', 'enrollments'].includes(resource)) rows = b[resource];
  else if (resource === 'terms') rows = [];
  else {
    const p = await people(d, base, wantTeachers, wantStudents, wantG);
    rows = resource === 'enrollments' ? p.enrollments : resource === 'students' ? p.users.filter((u) => u.role === 'student') : resource === 'teachers' ? p.users.filter((u) => u.role === 'teacher') : p.users;
    if (resource === 'users' && !api.scopes.includes('roster.guardians')) rows = rows.filter((u) => u.role !== 'parent');
    if (api.scopes.includes('roster.contact') && resource !== 'enrollments') cats.push('contact details'); if (api.scopes.includes('roster.guardians') && resource !== 'enrollments') cats.push('guardian links');
    d.enrollments = p.enrollments;
  }
  if (!SET[resource]) throw new OrError(404, 'Unknown resource.', 'unknownobject');
  // nested: classes/:id/students, schools/:id/classes ...
  if (parent) {
    if (parent === 'classes') { if (!d.classIds.has(String(parentId))) throw new OrError(404, 'This class does not exist.', 'unknownobject'); const e = (await people(d, base, true, true, false)).enrollments.filter((x) => x.class.sourcedId === String(parentId)); const ids = new Set(e.filter((x) => x.role === (resource === 'teachers' ? 'teacher' : 'student')).map((x) => x.user.sourcedId)); rows = rows.filter((u) => ids.has(u.sourcedId)); }
    else if (parent === 'schools') { if (!d.shown.has(String(parentId))) throw new OrError(404, 'This school does not exist.', 'unknownobject'); if (resource === 'classes') rows = b.classes.filter((c) => c.school.sourcedId === String(parentId)); else { const cl = new Set(d.classes.filter((c) => d.campusOf(c) === String(parentId)).map((c) => String(c._id))); const e = (await people(d, base, true, true, false)).enrollments.filter((x) => cl.has(x.class.sourcedId) && x.role === (resource === 'teachers' ? 'teacher' : 'student')); const ids = new Set(e.map((x) => x.user.sourcedId)); rows = rows.filter((u) => ids.has(u.sourcedId)); } }
  }
  if (id !== undefined) {
    const one = rows.find((r) => r.sourcedId === String(id)); if (!one) throw new OrError(404, 'This record does not exist.', 'unknownobject');
    return { single: { [SINGULAR[resource]]: one }, count: 1, what: resource, categories: cats };
  }
  const f = fieldsOf(rows, SAMPLE[COLLECTION[resource]] || []); const r = query(rows, q || {}, f);
  return { list: { [COLLECTION[resource]]: r.rows }, total: r.total, limit: r.limit, offset: r.offset, count: r.rows.length, what: resource, categories: cats };
}

module.exports = { answer, OrError, query, parseFilter, split, yearOf };
