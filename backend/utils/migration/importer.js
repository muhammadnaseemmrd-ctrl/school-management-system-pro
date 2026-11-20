// Data import (PRD E29): classes and students from a CSV or a list of rows.
// preview() writes nothing but the job itself. commit() works a batch at a time and remembers every row, so a retry or a second click
// never creates anything twice. rollback() takes back what the job made and leaves alone whatever has been used since.
const crypto = require('crypto');
const mongoose = require('../../lib/pgdoc');
const Student = require('../../models/Student');
const Class = require('../../models/Class');
const Parent = require('../../models/Parent');
const Teacher = require('../../models/Teacher');
const School = require('../../models/School');
const GuardianLink = require('../../models/GuardianLink');
const FeeStructure = require('../../models/FeeStructure');
const StudentFee = require('../../models/StudentFee');
const ImportJob = require('../../models/ImportJob');
const { hashPassword, strongTempPassword } = require('../password');
const csv = require('./csv');

const MAX_ROWS = 1000;
const EPOCH = () => new Date(0);
const sha = (s) => crypto.createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
const clean = (v, n = 200) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const phoneKey = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const stdKey = (s) => String(s || '').toLowerCase().replace(/\b(grade|class|std|standard)\b/g, '').replace(/[^a-z0-9]/g, '');
const divKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseDob(s) {
  const t = clean(s, 30); if (!t) return { empty: true };
  let y; let m; let d; let x;
  if ((x = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; }
  else return { error: 'Date of birth is not a date (use YYYY-MM-DD or DD/MM/YYYY)' };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { error: 'Date of birth is not a real date' };
  if (dt > new Date()) return { error: 'Date of birth is in the future' };
  return { date: dt };
}
const parseGender = (s) => { const t = String(s || '').trim().toLowerCase(); if (!t) return { empty: true }; if (['m', 'male', 'boy', 'b'].includes(t)) return { v: 'Male' }; if (['f', 'female', 'girl', 'g'].includes(t)) return { v: 'Female' }; if (['o', 'other', 'x'].includes(t)) return { v: 'Other' }; return { error: 'Gender should be Male, Female or Other' }; };

// "5-A", "5 A", "Grade 5A", "Nursery" -> { standard, division }
function splitClass(s) {
  const t = clean(s, 40); if (!t) return { standard: '', division: '' };
  let m = t.match(/^(.+?)[\s\-/_]+([A-Za-z0-9]{1,2})$/); if (m) return { standard: m[1].trim(), division: m[2].toUpperCase() };
  m = t.match(/^(\d+)([A-Za-z])$/); if (m) return { standard: m[1], division: m[2].toUpperCase() };
  return { standard: t, division: '' };
}

async function context(schoolId) {
  const [school, classes] = await Promise.all([School.findById(schoolId), Class.find({ schoolId })]);
  const byKey = new Map(); const byStd = new Map();
  for (const c of classes) { byKey.set(`${stdKey(c.standard)}|${divKey(c.division)}`, c); const k = stdKey(c.standard); byStd.set(k, [...(byStd.get(k) || []), c]); }
  return { school, classes, byKey, byStd };
}
function resolveClass(ctx, raw, createMissing, planned) {
  let standard = clean(raw.standard, 40); let division = clean(raw.division, 10);
  if (raw.class) { const sp = splitClass(raw.class); standard = standard || sp.standard; division = division || sp.division; }
  if (!standard) return { error: 'Class is missing' };
  const sk = stdKey(standard); const dk = divKey(division);
  if (dk) { const c = ctx.byKey.get(`${sk}|${dk}`); if (c) return { cls: c }; const pk = `${sk}|${dk}`; if (planned.has(pk)) return { planned: planned.get(pk) }; if (createMissing) { const p = { standard, division: division.toUpperCase() }; planned.set(pk, p); return { planned: p, createdNow: true }; } return { error: `Class ${standard}-${division.toUpperCase()} does not exist` }; }
  const list = ctx.byStd.get(sk) || [];
  if (list.length === 1) return { cls: list[0] };
  if (list.length > 1) return { error: `Class ${standard} has several divisions (${list.map((c) => c.division).join(', ')}); add a division column` };
  if (createMissing) { const pk = `${sk}|`; const p = planned.get(pk) || { standard, division: 'A' }; planned.set(pk, p); return { planned: p, createdNow: true }; }
  return { error: `Class ${standard} does not exist` };
}

const stFields = (s) => ({ name: s.name, gender: s.gender, dateOfBirth: dayKey(s.dateOfBirth), classId: String(s.classId || ''), rollNumber: s.rollNumber || '', 'guardian.name': s.guardian?.name || '', 'guardian.relationship': s.guardian?.relationship || '', 'guardian.mobileNumber': s.guardian?.mobileNumber || '' });

async function previewStudents(schoolId, records, options) {
  const ctx = await context(schoolId); const planned = new Map();
  const existing = await Student.find({ schoolId }).select('name email admissionNumber rollNumber gender dateOfBirth classId guardian');
  const byAdm = new Map(); const byNameDob = new Map(); const byNamePhone = new Map(); const emails = new Set();
  for (const s of existing) {
    if (s.admissionNumber) byAdm.set(String(s.admissionNumber).trim().toLowerCase(), s);
    if (s.email) emails.add(String(s.email).toLowerCase());
    const nk = nameKey(s.name); if (s.dateOfBirth) byNameDob.set(`${nk}|${dayKey(s.dateOfBirth)}`, s);
    const pk = phoneKey(s.guardian?.mobileNumber); if (pk) byNamePhone.set(`${nk}|${pk}`, s);
  }
  const seenAdm = new Map(); const seenNd = new Map(); const seenEmail = new Map();
  const rows = records.map((rec) => {
    const raw = rec.raw; const errors = []; const warnings = []; const row = { n: rec.n, raw: { ...raw, password: raw.password ? '••••' : '' }, errors, warnings, state: 'ok', match: null, diff: [], decision: '' };
    const v = { name: clean(raw.name, 120), admissionNumber: clean(raw.admissionNumber, 40), rollNumber: clean(raw.rollNumber, 20), previousSchool: clean(raw.previousSchool, 120), address: clean(raw.address, 200), bloodGroup: clean(raw.bloodGroup, 5), password: raw.password || '' };
    if (!v.name) errors.push('Name is missing'); else if (v.name.length < 2) errors.push('Name is too short');
    const g = parseGender(raw.gender); if (g.error) errors.push(g.error); else if (!g.empty) v.gender = g.v;
    const d = parseDob(raw.dateOfBirth); if (d.error) errors.push(d.error); else if (!d.empty) { v.dateOfBirth = d.date; const age = (Date.now() - d.date.getTime()) / 31557600000; if (age < 2 || age > 25) warnings.push(`Age ${Math.floor(age)} looks unusual`); }
    const gp = clean(raw.guardianPhone, 30); if (gp) { if (phoneKey(gp).length < 10) warnings.push('Guardian phone looks short'); v.guardianPhone = gp; }
    const ge = clean(raw.guardianEmail, 120).toLowerCase(); if (ge) { if (!EMAIL.test(ge)) errors.push('Guardian email is not valid'); else v.guardianEmail = ge; }
    const se = clean(raw.email, 120).toLowerCase(); if (se) { if (!EMAIL.test(se)) errors.push('Student email is not valid'); else v.email = se; }
    v.guardianName = clean(raw.guardianName, 120); v.guardianRelationship = ['Father', 'Mother', 'Guardian'].find((x) => x.toLowerCase() === String(raw.guardianRelationship || '').trim().toLowerCase()) || (v.guardianName ? 'Guardian' : '');
    if (v.password && v.password.length < 6) errors.push('Password must be at least 6 characters');
    const rc = resolveClass(ctx, raw, !!options.createMissingClasses, planned);
    if (rc.error) errors.push(rc.error); else if (rc.cls) { v.classId = rc.cls._id; row.classLabel = `${rc.cls.standard}-${rc.cls.division}`; } else { row.newClass = rc.planned; row.classLabel = `${rc.planned.standard}-${rc.planned.division}`; warnings.push(`Class ${row.classLabel} will be created`); }
    row.v = v;
    // duplicates inside the file
    const adm = v.admissionNumber.toLowerCase();
    if (adm) { if (seenAdm.has(adm)) errors.push(`Admission number repeats row ${seenAdm.get(adm)}`); else seenAdm.set(adm, rec.n); }
    if (v.email) { if (seenEmail.has(v.email)) errors.push(`Email repeats row ${seenEmail.get(v.email)}`); else seenEmail.set(v.email, rec.n); if (emails.has(v.email)) errors.push('Email already belongs to a student'); }
    const nk = nameKey(v.name); const ndk = v.dateOfBirth ? `${nk}|${dayKey(v.dateOfBirth)}` : '';
    let fileDup = null; if (ndk) { if (seenNd.has(ndk)) fileDup = seenNd.get(ndk); else seenNd.set(ndk, rec.n); }
    if (errors.length) { row.state = 'error'; return row; }
    // match against students already in the school
    let match = adm ? byAdm.get(adm) : null; let why = match ? 'Same admission number' : '';
    if (!match && ndk) { match = byNameDob.get(ndk); if (match) why = 'Same name and date of birth'; }
    if (!match && v.guardianPhone) { match = byNamePhone.get(`${nk}|${phoneKey(v.guardianPhone)}`); if (match) why = 'Same name and guardian phone'; }
    if (match) {
      row.match = { id: String(match._id), label: `${match.name}${match.admissionNumber ? ` (${match.admissionNumber})` : ''}`, why };
      const cur = stFields(match); const next = { name: v.name, gender: v.gender, dateOfBirth: v.dateOfBirth ? dayKey(v.dateOfBirth) : '', classId: v.classId ? String(v.classId) : '', rollNumber: v.rollNumber, 'guardian.name': v.guardianName, 'guardian.relationship': v.guardianRelationship, 'guardian.mobileNumber': v.guardianPhone || '' };
      for (const f of Object.keys(next)) if (next[f] && next[f] !== cur[f]) row.diff.push({ field: f, from: cur[f], to: next[f] });
      const sameName = nameKey(match.name) === nk || nameKey(match.name).includes(nk) || nk.includes(nameKey(match.name));
      if (why === 'Same admission number' && !sameName) { row.state = 'review'; warnings.push('The admission number matches a student with a different name'); }
      else if (why === 'Same admission number') row.state = row.diff.length ? 'update' : 'skip';
      else row.state = 'review';
    } else if (fileDup) { row.state = 'review'; row.match = { id: '', label: `Row ${fileDup} in this file`, why: 'Same name and date of birth as an earlier row' }; }
    return row;
  });
  return { rows, planned: [...planned.values()], ctx };
}

async function previewClasses(schoolId, records, options) {
  const ctx = await context(schoolId); const teachers = await Teacher.find({ schoolId }).select('email name'); const tByEmail = new Map(teachers.map((t) => [String(t.email).toLowerCase(), t]));
  const seen = new Map();
  const rows = records.map((rec) => {
    const raw = rec.raw; const errors = []; const warnings = []; const row = { n: rec.n, raw, errors, warnings, state: 'ok', match: null, diff: [], decision: '' };
    const standard = clean(raw.standard, 40); const division = clean(raw.division, 10).toUpperCase();
    if (!standard) errors.push('Standard is missing'); if (!division) errors.push('Division is missing');
    let capacity; if (raw.capacity) { capacity = parseInt(raw.capacity, 10); if (!(capacity >= 1 && capacity <= 500)) errors.push('Capacity must be between 1 and 500'); }
    const v = { standard, division, capacity, room: clean(raw.room, 30) };
    if (raw.classTeacherEmail) { const t = tByEmail.get(String(raw.classTeacherEmail).toLowerCase().trim()); if (t) v.classTeacherId = t._id; else warnings.push('Class teacher email does not match a teacher; the class is made without one'); }
    row.v = v;
    if (standard && division) { const k = `${stdKey(standard)}|${divKey(division)}`; if (seen.has(k)) errors.push(`Repeats row ${seen.get(k)}`); else seen.set(k, rec.n); }
    if (errors.length) { row.state = 'error'; return row; }
    const ex = ctx.byKey.get(`${stdKey(standard)}|${divKey(division)}`);
    if (ex) {
      row.match = { id: String(ex._id), label: `${ex.standard}-${ex.division}`, why: 'Class already exists' };
      if (capacity && capacity !== ex.capacity) row.diff.push({ field: 'capacity', from: ex.capacity, to: capacity });
      if (v.room && v.room !== (ex.room || '')) row.diff.push({ field: 'room', from: ex.room || '', to: v.room });
      if (v.classTeacherId && String(v.classTeacherId) !== String(ex.classTeacherId || '')) row.diff.push({ field: 'classTeacherId', from: String(ex.classTeacherId || ''), to: String(v.classTeacherId) });
      row.state = row.diff.length ? 'update' : 'skip';
    }
    return row;
  });
  return { rows, planned: [], ctx };
}

const summarize = (rows) => {
  const by = { ok: 0, update: 0, skip: 0, review: 0, error: 0 }; for (const r of rows) by[r.state] = (by[r.state] || 0) + 1;
  return { total: rows.length, willCreate: by.ok, willUpdate: by.update, unchanged: by.skip, needReview: by.review, errors: by.error, warnings: rows.filter((r) => r.warnings.length).length };
};
const effective = (r) => (r.state === 'ok' ? 'create' : r.state === 'update' ? 'update' : r.state === 'review' ? (r.decision || '') : 'skip');

async function preview({ schoolId, user, kind, fileName, csvText, rows: given, options = {} }) {
  if (!['students', 'classes'].includes(kind)) return { status: 400, message: 'kind must be students or classes' };
  let records = []; let unknown = []; let mapped = [];
  if (csvText) { const m = csv.parseCsv(csvText); if (m.length < 2) return { status: 422, message: 'The file has no data rows' }; const t = csv.toRecords(kind, m); records = t.records; unknown = t.unknown; mapped = t.mapped; }
  else if (Array.isArray(given)) { records = given.map((raw, i) => ({ n: i + 1, raw: Object.fromEntries(Object.entries(raw || {}).map(([k, v]) => [k, String(v == null ? '' : v).trim()])) })); mapped = Object.keys(records[0]?.raw || {}); }
  else return { status: 400, message: 'Send csv text or a rows array' };
  if (!records.length) return { status: 422, message: 'There are no rows to import' };
  if (records.length > MAX_ROWS) return { status: 413, message: `A single import takes up to ${MAX_ROWS} rows. Split the file and import it in parts.` };
  const need = kind === 'students' ? ['name'] : ['standard', 'division']; const miss = need.filter((f) => !mapped.includes(f));
  if (miss.length) return { status: 422, message: `The file has no ${miss.join(' / ')} column`, mapped, unknown };
  const opts = { createMissingClasses: !!options.createMissingClasses };
  const out = kind === 'students' ? await previewStudents(schoolId, records, opts) : await previewClasses(schoolId, records, opts);
  const summary = summarize(out.rows); summary.newClasses = out.planned.length; summary.unknownColumns = unknown; summary.mappedColumns = mapped;
  if (kind === 'students' && summary.willCreate + summary.needReview) { const { checkLimit } = require('../plans'); const l = await checkLimit(schoolId, 'student', summary.willCreate); summary.planLimit = l.ok ? { ok: true } : { ok: false, message: l.message }; }
  const planHash = sha({ kind, raw: records.map((r) => r.raw) });
  const same = await ImportJob.findOne({ schoolId, kind, planHash, status: 'Committed' }).select('_id createdAt');
  if (same) summary.sameFileAs = { id: String(same._id), at: same.createdAt };
  const job = await ImportJob.create({ schoolId, kind, fileName: clean(fileName, 120), status: 'Previewed', createdBy: user.id, createdByName: user.name, rows: out.rows, summary, planHash, options: { ...opts, plannedClasses: out.planned } });
  return { status: 201, job };
}

function setDecisions(job, decisions = {}, defaultReview) {
  const ok = ['skip', 'update', 'create']; let n = 0;
  for (const r of job.rows) {
    if (r.state !== 'review') continue;
    const d = decisions[r.n] || defaultReview; if (!d) continue; if (!ok.includes(d)) continue;
    if (d === 'update' && !(r.match && r.match.id)) continue;
    r.decision = d; n++;
  }
  return n;
}

const tempStudentEmail = (name, code) => `${(nameKey(name).replace(/ /g, '.').slice(0, 24) || 'student')}.${crypto.randomBytes(3).toString('hex')}@students.${String(code || 'school').toLowerCase()}.local`;

async function ensureClass(schoolId, plan, school, jobId, createdIds) {
  const all = await Class.find({ schoolId }).select('standard division'); const f = all.find((c) => stdKey(c.standard) === stdKey(plan.standard) && divKey(c.division) === divKey(plan.division)); if (f) return f;
  const c = await Class.create({ schoolId, standard: plan.standard, division: plan.division, academicYear: school.academicYear || '', capacity: plan.capacity || 40, importJobId: String(jobId) }); createdIds.push(String(c._id)); return c;
}

async function applyStudentRow(r, job, school, cache, credentials) {
  const schoolId = job.schoolId; const v = r.v; const act = effective(r);
  if (act === 'skip' || !act) return { status: 'skipped' };
  if (act === 'update') {
    const target = await Student.findOne({ _id: r.match.id, schoolId }); if (!target) return { status: 'failed', error: 'The matching student was removed' };
    const set = {}; const before = {}; const after = {};
    for (const d of r.diff) { set[d.field] = d.field === 'dateOfBirth' ? new Date(`${d.to}T00:00:00Z`) : d.field === 'classId' ? new mongoose.Types.ObjectId(d.to) : d.to; before[d.field] = d.from; after[d.field] = d.to; }
    if (!Object.keys(set).length) return { status: 'skipped' };
    if (set.classId) { const c = cache.classById.get(String(set.classId)); if (c) set.division = c.division; before.division = target.division || ''; after.division = c ? c.division : ''; }
    await Student.updateOne({ _id: target._id, schoolId }, { $set: set });
    return { status: 'updated', id: String(target._id), before, after };
  }
  // create — a restart that finds the record already there adopts it
  const found = await Student.findOne({ schoolId, importJobId: String(job._id), importRow: r.n }); if (found) return { status: 'created', id: String(found._id), created: [{ model: 'Student', id: String(found._id) }], adopted: true };
  let cls = v.classId ? cache.classById.get(String(v.classId)) : null;
  if (!cls && r.newClass) cls = cache.newClassByKey.get(`${stdKey(r.newClass.standard)}|${divKey(r.newClass.division)}`);
  if (!cls) return { status: 'failed', error: 'Class could not be resolved' };
  const temp = v.password || strongTempPassword(); const email = v.email || tempStudentEmail(v.name, school.code); const created = [];
  const rel = v.guardianRelationship; const g = { name: v.guardianName || '', relationship: rel || '', mobileNumber: v.guardianPhone || '' };
  const doc = { schoolId, schoolCode: school.code, schoolName: school.name, name: v.name, email, password: await hashPassword(temp), role: 'student', admissionNumber: v.admissionNumber || undefined, rollNumber: v.rollNumber || undefined, gender: v.gender || 'Male', dateOfBirth: v.dateOfBirth, classId: cls._id, division: cls.division, academicYear: school.academicYear || cls.academicYear || '', previousSchool: v.previousSchool || undefined, currentAddress: v.address || undefined, bloodGroup: v.bloodGroup || undefined, guardian: g, importJobId: String(job._id), importRow: r.n };
  if (rel === 'Father') doc.father = { name: g.name, mobileNumber: g.mobileNumber, email: v.guardianEmail || '' }; if (rel === 'Mother') doc.mother = { name: g.name, mobileNumber: g.mobileNumber, email: v.guardianEmail || '' };
  let st; try { st = await Student.create(doc); } catch (e) { return { status: 'failed', error: e.code === 11000 ? 'Email or admission number is already used' : e.message }; }
  created.push({ model: 'Student', id: String(st._id) });
  const out = { status: 'created', id: String(st._id), created };
  try {
    if (cache.feeStd.has(stdKey(cls.standard)) === false) cache.feeStd.set(stdKey(cls.standard), !!(await FeeStructure.findOne({ schoolId, standard: cls.standard }).select('_id')));
    if (cache.feeStd.get(stdKey(cls.standard))) { const sf = await StudentFee.create({ schoolId, studentId: st._id, classId: cls._id }); created.push({ model: 'StudentFee', id: String(sf._id) }); }
    if (v.guardianEmail) {
      let parent = await Parent.findOne({ schoolId, email: v.guardianEmail }); let ptemp = null;
      if (!parent) { ptemp = strongTempPassword(); parent = await Parent.create({ schoolId, name: v.guardianName || 'Parent', email: v.guardianEmail, phone: v.guardianPhone || null, password: await hashPassword(ptemp), role: 'parent', relationship: ['Father', 'Mother'].includes(rel) ? rel : 'Guardian', children: [st._id], importJobId: String(job._id) }); created.push({ model: 'Parent', id: String(parent._id) }); credentials.push({ role: 'parent', name: parent.name, email: parent.email, temporaryPassword: ptemp }); }
      else { await Parent.updateOne({ _id: parent._id }, { $addToSet: { children: st._id } }); out.linkedParent = String(parent._id); }
      const gl = await GuardianLink.create({ schoolId, studentId: st._id, parentId: parent._id, relationship: rel || 'Guardian', isPrimary: true, note: `Imported (${job._id})`, createdBy: job.createdBy, createdByName: job.createdByName }); created.push({ model: 'GuardianLink', id: String(gl._id) });
    }
  } catch (e) { out.warning = `Student saved; ${e.message}`; }
  if (!v.password) credentials.push({ role: 'student', name: v.name, email, temporaryPassword: temp, admissionNumber: v.admissionNumber || '' });
  return out;
}

async function applyClassRow(r, job, school) {
  const v = r.v; const act = effective(r); if (act === 'skip' || !act) return { status: 'skipped' }; const schoolId = job.schoolId;
  if (act === 'update') { const c = await Class.findOne({ _id: r.match.id, schoolId }); if (!c) return { status: 'failed', error: 'The class was removed' }; const set = {}; const before = {}; const after = {}; for (const d of r.diff) { set[d.field] = d.field === 'classTeacherId' ? new mongoose.Types.ObjectId(d.to) : d.to; before[d.field] = d.from; after[d.field] = d.to; } await Class.updateOne({ _id: c._id, schoolId }, { $set: set }); return { status: 'updated', id: String(c._id), before, after }; }
  const found = await Class.findOne({ schoolId, importJobId: String(job._id), standard: v.standard, division: v.division }); if (found) return { status: 'created', id: String(found._id), created: [{ model: 'Class', id: String(found._id) }], adopted: true };
  try { const c = await Class.create({ schoolId, standard: v.standard, division: v.division, capacity: v.capacity || 40, room: v.room || undefined, classTeacherId: v.classTeacherId || undefined, academicYear: school.academicYear || '', importJobId: String(job._id) }); return { status: 'created', id: String(c._id), created: [{ model: 'Class', id: String(c._id) }] }; } catch (e) { return { status: 'failed', error: e.code === 11000 ? 'This class already exists' : e.message }; }
}

async function recountClasses(schoolId, ids) {
  for (const id of ids) { const n = await Student.countDocuments({ schoolId, classId: new mongoose.Types.ObjectId(String(id)), isActive: { $ne: false } }); await Class.updateOne({ _id: id, schoolId }, { $set: { studentCount: n } }); }
}

// Takes the next `batch` rows. The caller loops until status is Committed.
async function commit({ job, batch = 25 }) {
  const schoolId = job.schoolId; const now = new Date();
  if (job.status === 'Committed') return { status: 200, body: { done: true, alreadyCommitted: true, result: job.result } };
  if (!['Previewed', 'Committing'].includes(job.status)) return { status: 409, body: { message: `This import is ${job.status.toLowerCase()} and cannot be committed.` } };
  const pending = job.rows.filter((r) => r.state === 'review' && !r.decision);
  if (pending.length) return { status: 422, body: { message: `${pending.length} row(s) look like duplicates and need a decision (skip, update or create).`, rows: pending.slice(0, 20).map((r) => r.n) } };
  if (job.status === 'Previewed') {
    const creates = job.rows.filter((r) => effective(r) === 'create').length;
    if (job.kind === 'students' && creates) { const l = await require('../plans').checkLimit(schoolId, 'student', creates); if (!l.ok) return { status: 402, body: { message: l.message } }; }
  }
  const got = await ImportJob.updateOne({ _id: job._id, schoolId, status: { $in: ['Previewed', 'Committing'] }, lockUntil: { $lt: now } }, { $set: { status: 'Committing', lockUntil: new Date(now.getTime() + 90000) } });
  if (!got.matchedCount) return { status: 423, body: { message: 'This import is being processed. Wait a moment and try again.' } };
  const fresh = await ImportJob.findById(job._id); const school = await School.findById(schoolId); const credentials = [];
  try {
    const cache = { classById: new Map(), newClassByKey: new Map(), feeStd: new Map() }; const createdClassIds = [...(fresh.result?.createdClassIds || [])];
    for (const c of await Class.find({ schoolId })) cache.classById.set(String(c._id), c);
    if (fresh.kind === 'students') for (const p of fresh.options.plannedClasses || []) { const c = await ensureClass(schoolId, p, school, fresh._id, createdClassIds); cache.classById.set(String(c._id), c); cache.newClassByKey.set(`${stdKey(p.standard)}|${divKey(p.division)}`, c); }
    const todo = fresh.rows.filter((r) => !r.result).slice(0, Math.max(1, Math.min(100, parseInt(batch, 10) || 25)));
    for (const r of todo) {
      let res; try { res = fresh.kind === 'students' ? await applyStudentRow(r, fresh, school, cache, credentials) : await applyClassRow(r, fresh, school); } catch (e) { res = { status: 'failed', error: e.message }; }
      r.result = res;
    }
    const remaining = fresh.rows.filter((r) => !r.result).length; const tally = {}; for (const r of fresh.rows) if (r.result) tally[r.result.status] = (tally[r.result.status] || 0) + 1;
    const set = { rows: fresh.rows, lockUntil: EPOCH(), result: { ...(fresh.result || {}), createdClassIds, ...tally } };
    if (!remaining) {
      const touched = new Set(fresh.rows.map((r) => r.v?.classId && String(r.v.classId)).filter(Boolean)); for (const c of cache.newClassByKey.values()) touched.add(String(c._id)); for (const r of fresh.rows) { const m = r.result?.created?.find((x) => x.model === 'Student'); if (m && r.newClass) { const c = cache.newClassByKey.get(`${stdKey(r.newClass.standard)}|${divKey(r.newClass.division)}`); if (c) touched.add(String(c._id)); } }
      await recountClasses(schoolId, [...touched]);
      Object.assign(set, { status: 'Committed', committedAt: new Date() });
    }
    await ImportJob.updateOne({ _id: job._id }, { $set: set });
    return { status: 200, body: { done: !remaining, remaining, processed: todo.length, tally, credentials, failures: todo.filter((r) => r.result.status === 'failed').map((r) => ({ n: r.n, error: r.result.error })) } };
  } catch (e) { await ImportJob.updateOne({ _id: job._id }, { $set: { lockUntil: EPOCH() } }); throw e; }
}

async function rollback({ job, reason }) {
  const schoolId = job.schoolId; const now = new Date();
  if (!['Committed', 'Committing'].includes(job.status)) return { status: 409, message: 'Only an import that has been committed can be taken back.' };
  const got = await ImportJob.updateOne({ _id: job._id, schoolId, status: { $in: ['Committed', 'Committing'] }, lockUntil: { $lt: now } }, { $set: { lockUntil: new Date(now.getTime() + 120000) } });
  if (!got.matchedCount) return { status: 423, message: 'This import is being processed. Try again in a moment.' };
  const out = { removed: 0, kept: [], reverted: 0, conflicts: [], classesRemoved: 0, parentsRemoved: 0 }; const touched = new Set();
  const oid = (x) => new mongoose.Types.ObjectId(String(x));
  if (job.kind === 'students') {
    const made = job.rows.filter((r) => r.result?.status === 'created' && r.result.created?.length);
    const ids = made.map((r) => oid(r.result.id));
    const used = new Set();
    if (ids.length) {
      const DA = require('../../models/DailyAttendance'); const Marks = require('../../models/Marks'); const FP = require('../../models/FeePayment'); const FI = require('../../models/FeeInvoice');
      for (const [M, label] of [[DA, 'attendance'], [Marks, 'marks'], [FP, 'fee payments'], [FI, 'fee invoices']]) { const rows = await M.find({ studentId: { $in: ids } }).select('studentId'); for (const x of rows) used.add(`${x.studentId}|${label}`); }
    }
    for (const r of made) {
      const sid = r.result.id; const why = ['attendance', 'marks', 'fee payments', 'fee invoices'].filter((l) => used.has(`${sid}|${l}`));
      if (why.length) { out.kept.push({ n: r.n, id: sid, reason: `Has ${why.join(', ')} recorded since the import` }); continue; }
      const st = await Student.findOne({ _id: sid, schoolId }).select('classId'); if (st) touched.add(String(st.classId));
      for (const c of r.result.created) {
        if (c.model === 'Student') { await Student.deleteOne({ _id: c.id, schoolId }); out.removed++; }
        else if (c.model === 'StudentFee') await StudentFee.deleteOne({ _id: c.id });
        else if (c.model === 'GuardianLink') await GuardianLink.deleteOne({ _id: c.id });
        else if (c.model === 'Parent') { await Parent.updateOne({ _id: c.id }, { $pull: { children: oid(sid) } }); const p = await Parent.findOne({ _id: c.id }).select('children'); if (p && !(p.children || []).length) { await Parent.deleteOne({ _id: c.id }); out.parentsRemoved++; } }
      }
      if (r.result.linkedParent) await Parent.updateOne({ _id: r.result.linkedParent }, { $pull: { children: oid(sid) } });
      r.result = { ...r.result, rolledBack: true };
    }
  }
  for (const r of job.rows) {
    if (r.result?.status !== 'updated') continue;
    const M = job.kind === 'students' ? Student : Class; const cur = await M.findOne({ _id: r.result.id, schoolId }); if (!cur) continue; const flat = job.kind === 'students' ? stFields(cur) : { capacity: cur.capacity, room: cur.room || '', classTeacherId: String(cur.classTeacherId || '') };
    const same = Object.keys(r.result.after).every((f) => f === 'division' || String(flat[f] == null ? '' : flat[f]) === String(r.result.after[f]));
    if (!same) { out.conflicts.push({ n: r.n, id: r.result.id, reason: 'Changed again after the import, so it was left as it is' }); continue; }
    const set = {}; for (const [f, val] of Object.entries(r.result.before)) set[f] = f === 'dateOfBirth' ? (val ? new Date(`${val}T00:00:00Z`) : null) : f === 'classId' || f === 'classTeacherId' ? (val ? oid(val) : null) : val;
    await M.updateOne({ _id: cur._id, schoolId }, { $set: set }); out.reverted++; if (job.kind === 'students') { touched.add(String(r.result.before.classId || '')); touched.add(String(cur.classId)); } r.result = { ...r.result, rolledBack: true };
  }
  await recountClasses(schoolId, [...touched].filter(Boolean));
  for (const id of job.result?.createdClassIds || []) { const n = await Student.countDocuments({ schoolId, classId: oid(id) }); if (!n) { await Class.deleteOne({ _id: id, schoolId }); out.classesRemoved++; } }
  if (job.kind === 'classes') for (const r of job.rows) if (r.result?.status === 'created' && !r.result.rolledBack) { const n = await Student.countDocuments({ schoolId, classId: oid(r.result.id) }); if (!n) { await Class.deleteOne({ _id: r.result.id, schoolId }); out.classesRemoved++; r.result = { ...r.result, rolledBack: true }; } else out.kept.push({ n: r.n, id: r.result.id, reason: 'The class has students' }); }
  await ImportJob.updateOne({ _id: job._id }, { $set: { status: 'RolledBack', rows: job.rows, rolledBackAt: now, rollbackReason: clean(reason, 300), rollbackResult: out, lockUntil: EPOCH() } });
  return { status: 200, result: out };
}

const issuesCsv = (job) => csv.toCsv(['row', 'status', 'problems', 'name_or_class'], job.rows.filter((r) => r.state === 'error' || r.result?.status === 'failed' || r.state === 'review').map((r) => [r.n, r.state === 'error' ? 'error' : r.result?.status === 'failed' ? 'failed' : 'needs decision', [...(r.errors || []), r.result?.error, r.match ? `${r.match.why}: ${r.match.label}` : ''].filter(Boolean).join('; '), r.raw?.name || `${r.raw?.standard || ''}-${r.raw?.division || ''}`]));

module.exports = { preview, setDecisions, commit, rollback, issuesCsv, effective, MAX_ROWS, parseDob, splitClass, stdKey };
