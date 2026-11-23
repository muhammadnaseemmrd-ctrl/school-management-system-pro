// Every module that can be filled from a sheet, described once.
//
// A module says what its columns are, how to recognise a record that is already here, and how to
// write one. The engine does the rest, so the template, the preview, the checks and the writing
// can never fall out of step with each other: they all read this file.

const mongoose = require('../../lib/pgdoc');
const crypto = require('crypto');
const { hashPassword, strongTempPassword } = require('../password');
const V = require('./values');

const { clean, nameKey, phoneKey, stdKey, divKey, codeKey } = V;

const M = {
  School: require('../../models/School'),
  Student: require('../../models/Student'),
  Teacher: require('../../models/Teacher'),
  Parent: require('../../models/Parent'),
  Employee: require('../../models/Employee'),
  Class: require('../../models/Class'),
  Subject: require('../../models/Subject'),
  Room: require('../../models/Room'),
  Campus: require('../../models/Campus'),
  FeeStructure: require('../../models/FeeStructure'),
  StudentFee: require('../../models/StudentFee'),
  GuardianLink: require('../../models/GuardianLink'),
  LbTitle: require('../../models/LbTitle'),
  LbCopy: require('../../models/LbCopy'),
  StSku: require('../../models/StSku'),
  PcVendor: require('../../models/PcVendor'),
  TransportRoute: require('../../models/TransportRoute'),
  TransportAssignment: require('../../models/TransportAssignment'),
  Position: require('../../models/Position'),
};

const oid = (v) => { try { return new mongoose.Types.ObjectId(String(v)); } catch (e) { return null; } };
const tempEmail = (name, code, kind) => `${(nameKey(name).replace(/ /g, '.').slice(0, 24) || kind)}.${crypto.randomBytes(3).toString('hex')}@${kind}s.${String(code || 'school').toLowerCase()}.local`;
const diff = (before, after, fields) => fields
  .filter((f) => after[f.key ?? f] !== undefined && String(before[f.from ?? f.key ?? f] ?? '') !== String(after[f.key ?? f] ?? ''))
  .map((f) => ({ field: f.label ?? f.key ?? f, from: String(before[f.from ?? f.key ?? f] ?? ''), to: String(after[f.key ?? f] ?? '') }));

/* ────────────────────────── shared lookups ────────────────────────── */

const classIndex = async (schoolId) => {
  const rows = await M.Class.find({ schoolId }).select('standard division campusId');
  const byKey = new Map();
  for (const c of rows) byKey.set(`${stdKey(c.standard)}|${divKey(c.division)}`, c);
  const byStd = new Map();
  for (const c of rows) if (!byStd.has(stdKey(c.standard))) byStd.set(stdKey(c.standard), c);
  return { list: rows, byKey, byStd };
};

// "Class 5 - B", "5B", "5/B" or a class column plus a section column, all end up the same place.
const resolveClass = (value, c, { required = true } = {}) => {
  const raw = clean(value.className || value.standard || '', 60);
  if (!raw) { if (required) throw new Error('Class is needed'); return null; }
  let standard = raw; let division = clean(value.division || value.section || '', 12);
  if (!division) {
    const m = raw.match(/^(.*?)[\s\-/]*([A-Za-z])$/);
    if (m && m[1].trim() && /\d/.test(m[1])) { standard = m[1].trim(); division = m[2]; }
  }
  const hit = c.classes.byKey.get(`${stdKey(standard)}|${divKey(division)}`) || (!division ? c.classes.byStd.get(stdKey(standard)) : null);
  if (hit) return hit;
  // in a whole-school workbook the class may be on an earlier sheet of the same file: it is not
  // here yet, but it will be by the time this sheet is written
  if (c.pending && c.pending.classes && c.pending.classes.has(`${stdKey(standard)}|${divKey(division)}`)) return { pending: true, standard, division };
  throw new Error(`No class matches "${raw}${division ? ` ${division}` : ''}". Add the class first, or correct the spelling.`);
};

/* ────────────────────────── a plain module ──────────────────────────
   Most modules are a straight mapping: a few columns, a unique key, a model. This builds one.   */

const simple = ({ key, label, group, help, feature, columns, model, unique, toDoc, extraKeys, after, label1 }) => ({
  key,
  label,
  group,
  help,
  feature,
  sheet: label.slice(0, 28),
  columns,
  unique,
  label1: label1 || ((v) => clean(v[unique[0]] || v.name || '', 60)),
  prepare: async ({ schoolId }) => ({ schoolId }),
  match: async (value, c) => {
    const q = { schoolId: c.schoolId };
    for (const k of unique) {
      const v = value[k];
      if (v === undefined || v === '') return null;
      q[(extraKeys && extraKeys[k]) || k] = typeof v === 'string' ? new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : v;
    }
    const hit = await M[model].findOne(q);
    return hit ? { id: hit._id, label: clean(hit.name || hit.title || hit[unique[0]], 60), doc: hit } : null;
  },
  changes: (hit, value) => diff(hit.doc, toDoc(value), columns.filter((col) => !unique.includes(col.key)).map((col) => ({ key: col.key, label: col.label }))),
  create: async (value, c) => {
    const doc = await M[model].create({ schoolId: c.schoolId, ...toDoc(value, c) });
    if (after) await after(doc, value, c, 'create');
    return { id: doc._id, label: clean(doc.name || doc.title || doc[unique[0]], 60) };
  },
  update: async (hit, value, c) => {
    const set = toDoc(value, c);
    unique.forEach((k) => delete set[k]);
    const changed = diff(hit.doc, toDoc(value, c), columns.filter((col) => !unique.includes(col.key)).map((col) => ({ key: col.key, label: col.label })));
    Object.keys(set).forEach((k) => { if (set[k] === undefined) delete set[k]; });
    await M[model].updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    if (after) await after({ _id: hit.id, ...set }, value, c, 'update');
    return { id: hit.id, changed };
  },
});

/* ────────────────────────── people ────────────────────────── */

const students = {
  key: 'students',
  label: 'Students',
  group: 'People',
  sheet: 'Students',
  help: 'One row per child. The class must already exist. A child with the same admission number, or the same name and date of birth, is treated as the same child.',
  unique: ['admissionNumber'],
  columns: [
    { key: 'name', label: 'Full name', required: true, min: 2, max: 80, width: 22, example: 'Ayesha Khan', note: 'As it should appear on documents.' },
    { key: 'admissionNumber', label: 'Admission number', max: 32, width: 18, example: 'ADM-2026-001', note: 'Your own number for the child. Used to recognise a child you already have.' },
    { key: 'className', label: 'Class', required: true, width: 12, example: '5', aliases: ['standard', 'grade', 'class name'], note: 'The class the child joins, for example 5.' },
    { key: 'division', label: 'Section', max: 12, width: 10, example: 'B', aliases: ['section', 'div'], note: 'Leave empty if your classes have no sections.' },
    { key: 'rollNumber', label: 'Roll number', max: 20, width: 12, example: '12' },
    { key: 'gender', label: 'Gender', type: 'gender', enum: ['Male', 'Female', 'Other'], width: 12, example: 'Female' },
    { key: 'dateOfBirth', label: 'Date of birth', type: 'date', noFuture: true, width: 16, example: '2015-03-12' },
    { key: 'bloodGroup', label: 'Blood group', max: 6, width: 12, example: 'B+' },
    { key: 'email', label: 'Email', type: 'email', width: 24, example: 'ayesha.khan@example.com', note: 'Leave empty and the child gets a sign-in name of their own.' },
    { key: 'mobileNumber', label: 'Mobile', type: 'phone', width: 16, example: '+92 300 1234567' },
    { key: 'address', label: 'Address', max: 200, width: 28, example: 'House 12, Street 4, Islamabad' },
    { key: 'guardianName', label: 'Guardian name', max: 80, width: 20, example: 'Imran Khan' },
    { key: 'guardianRelationship', label: 'Guardian is the', type: 'choice', enum: ['Father', 'Mother', 'Guardian'], width: 16, example: 'Father' },
    { key: 'guardianPhone', label: 'Guardian mobile', type: 'phone', width: 18, example: '+92 300 7654321' },
    { key: 'guardianEmail', label: 'Guardian email', type: 'email', width: 24, example: 'imran.khan@example.com', note: 'Given an email, the guardian also gets a parent sign-in linked to this child.' },
    { key: 'previousSchool', label: 'Previous school', max: 120, width: 22, example: 'City Public School' },
    { key: 'admissionDate', label: 'Admission date', type: 'date', width: 16, example: '2026-04-01' },
  ],
  prepare: async ({ schoolId, school }) => ({ schoolId, school, classes: await classIndex(schoolId) }),
  refine: async (value, row, c) => {
    value._class = resolveClass(value, c);
    if (value._class.pending) row.warnings.push(`Class ${value._class.standard}${value._class.division ? ` ${value._class.division}` : ''} is on the Classes sheet of this same file and will exist by the time this row is written.`);
    if (!value.admissionNumber && !value.dateOfBirth) row.warnings.push('With no admission number and no date of birth, a child who is already here cannot be recognised and may be added twice.');
  },
  label1: (v) => clean(v.name, 60),
  match: async (value, c) => {
    let hit = null;
    if (value.admissionNumber) hit = await M.Student.findOne({ schoolId: c.schoolId, admissionNumber: value.admissionNumber });
    if (!hit && value.dateOfBirth) {
      const same = await M.Student.find({ schoolId: c.schoolId, dateOfBirth: value.dateOfBirth }).select('name dateOfBirth classId admissionNumber rollNumber');
      hit = same.find((s) => nameKey(s.name) === nameKey(value.name)) || null;
    }
    return hit ? { id: hit._id, label: clean(hit.name, 60), doc: hit } : null;
  },
  changes: (hit, value) => {
    const out = [];
    if (value.rollNumber && String(hit.doc.rollNumber || '') !== String(value.rollNumber)) out.push({ field: 'Roll number', from: String(hit.doc.rollNumber || ''), to: String(value.rollNumber) });
    if (value._class && String(hit.doc.classId || '') !== String(value._class._id)) out.push({ field: 'Class', from: 'current class', to: `${value._class.standard}${value._class.division ? ` ${value._class.division}` : ''}` });
    for (const [k, lbl] of [['guardianPhone', 'Guardian mobile'], ['mobileNumber', 'Mobile'], ['address', 'Address']]) {
      const now = k === 'guardianPhone' ? (hit.doc.guardian?.mobileNumber || '') : k === 'address' ? (hit.doc.currentAddress || '') : (hit.doc[k] || '');
      if (value[k] && String(now) !== String(value[k])) out.push({ field: lbl, from: String(now), to: String(value[k]) });
    }
    return out;
  },
  create: async (value, c) => {
    const { checkLimit } = require('../plans');
    const limit = await checkLimit(c.schoolId, 'student', 1);
    if (!limit.ok) throw new Error(limit.message);
    const cls = value._class;
    if (!cls || cls.pending) throw new Error('The class for this child does not exist yet. Load the Classes sheet first.');
    const temp = strongTempPassword();
    const email = value.email || tempEmail(value.name, c.school.code, 'student');
    const rel = value.guardianRelationship || 'Guardian';
    const guardian = { name: value.guardianName || '', relationship: rel, mobileNumber: value.guardianPhone || '' };
    const doc = {
      schoolId: c.schoolId, schoolCode: c.school.code, schoolName: c.school.name,
      name: value.name, email, password: await hashPassword(temp), role: 'student',
      admissionNumber: value.admissionNumber || undefined, rollNumber: value.rollNumber || undefined,
      gender: value.gender || 'Male', dateOfBirth: value.dateOfBirth, bloodGroup: value.bloodGroup || undefined,
      mobileNumber: value.mobileNumber || undefined, currentAddress: value.address || undefined,
      classId: cls._id, division: cls.division, academicYear: c.school.academicYear || cls.academicYear || '',
      previousSchool: value.previousSchool || undefined, admissionDate: value.admissionDate || undefined,
      guardian,
    };
    if (rel === 'Father') doc.father = { name: guardian.name, mobileNumber: guardian.mobileNumber, email: value.guardianEmail || '' };
    if (rel === 'Mother') doc.mother = { name: guardian.name, mobileNumber: guardian.mobileNumber, email: value.guardianEmail || '' };
    const st = await M.Student.create(doc);
    const credential = { role: 'student', name: value.name, email, temporaryPassword: temp };
    // a fee account when the class has a fee structure, and a parent sign-in when there is an email
    try {
      if (await M.FeeStructure.findOne({ schoolId: c.schoolId, standard: cls.standard }).select('_id')) {
        await M.StudentFee.create({ schoolId: c.schoolId, studentId: st._id, classId: cls._id });
      }
      if (value.guardianEmail) {
        let parent = await M.Parent.findOne({ schoolId: c.schoolId, email: value.guardianEmail });
        if (!parent) {
          const ptemp = strongTempPassword();
          parent = await M.Parent.create({ schoolId: c.schoolId, name: value.guardianName || 'Parent', email: value.guardianEmail, phone: value.guardianPhone || null, password: await hashPassword(ptemp), role: 'parent', relationship: ['Father', 'Mother'].includes(rel) ? rel : 'Guardian', children: [st._id] });
          credential.parent = { name: parent.name, email: parent.email, temporaryPassword: ptemp };
        } else await M.Parent.updateOne({ _id: parent._id }, { $addToSet: { children: st._id } });
        await M.GuardianLink.create({ schoolId: c.schoolId, studentId: st._id, parentId: parent._id, relationship: rel, isPrimary: true, note: 'Added from a file' });
      }
    } catch (e) { /* the child is saved; the extras are reported by the row's note */ }
    await M.Class.updateOne({ _id: cls._id, schoolId: c.schoolId }, { $inc: { studentCount: 1 } });
    return { id: st._id, label: value.name, credential };
  },
  update: async (hit, value, c) => {
    const set = {}; const changed = [];
    if (value.rollNumber) set.rollNumber = value.rollNumber;
    if (value.mobileNumber) set.mobileNumber = value.mobileNumber;
    if (value.address) set.currentAddress = value.address;
    if (value.bloodGroup) set.bloodGroup = value.bloodGroup;
    if (value.guardianName || value.guardianPhone) {
      set.guardian = { ...(hit.doc.guardian || {}), name: value.guardianName || hit.doc.guardian?.name || '', mobileNumber: value.guardianPhone || hit.doc.guardian?.mobileNumber || '', relationship: value.guardianRelationship || hit.doc.guardian?.relationship || '' };
    }
    if (value._class && String(hit.doc.classId || '') !== String(value._class._id)) {
      set.classId = value._class._id; set.division = value._class.division;
      await M.Class.updateOne({ _id: hit.doc.classId, schoolId: c.schoolId }, { $inc: { studentCount: -1 } });
      await M.Class.updateOne({ _id: value._class._id, schoolId: c.schoolId }, { $inc: { studentCount: 1 } });
      changed.push({ field: 'Class', from: 'previous class', to: `${value._class.standard} ${value._class.division || ''}`.trim() });
    }
    for (const k of Object.keys(set)) if (k !== 'classId' && k !== 'division') changed.push({ field: k, from: '', to: typeof set[k] === 'object' ? 'updated' : String(set[k]) });
    if (Object.keys(set).length) await M.Student.updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    return { id: hit.id, changed };
  },
};

const teachers = {
  key: 'teachers',
  label: 'Teachers',
  group: 'People',
  sheet: 'Teachers',
  help: 'One row per teacher. The email is their sign-in name, so it must be their own. A teacher already here is recognised by email or staff number.',
  unique: ['email'],
  columns: [
    { key: 'name', label: 'Full name', required: true, min: 2, max: 80, width: 22, example: 'Sara Khan' },
    { key: 'email', label: 'Email', type: 'email', required: true, width: 26, example: 'sara.khan@example.com', note: 'This is how the teacher signs in. One email per person.' },
    { key: 'employeeId', label: 'Staff number', max: 32, width: 14, example: 'T-014' },
    { key: 'phone', label: 'Mobile', type: 'phone', width: 16, example: '+92 300 1234567' },
    { key: 'gender', label: 'Gender', type: 'gender', enum: ['Male', 'Female', 'Other'], width: 12, example: 'Female' },
    { key: 'dateOfBirth', label: 'Date of birth', type: 'date', noFuture: true, width: 16, example: '1990-06-20' },
    { key: 'cnicNumber', label: 'CNIC', max: 20, width: 18, example: '61101-1234567-1' },
    { key: 'designation', label: 'Designation', max: 60, width: 18, example: 'Senior Teacher' },
    { key: 'department', label: 'Department', max: 60, width: 16, example: 'Science' },
    { key: 'joiningDate', label: 'Joining date', type: 'date', width: 16, example: '2024-08-01' },
    { key: 'qualification', label: 'Qualification', max: 120, width: 20, example: 'MSc Physics' },
    { key: 'experience', label: 'Years of experience', type: 'number', integer: true, minValue: 0, maxValue: 60, width: 18, example: 6 },
    { key: 'subjects', label: 'Subjects', type: 'list', maxItems: 12, width: 24, example: 'Physics, Maths', note: 'Separate with commas. The subject must already exist.' },
    { key: 'basicSalary', label: 'Basic salary', type: 'number', minValue: 0, width: 14, example: 60000 },
    { key: 'currentAddress', label: 'Address', max: 200, width: 26, example: 'House 9, F-11, Islamabad' },
    { key: 'campus', label: 'Branch', max: 40, width: 16, example: 'Main campus', note: 'Which branch they work at. Leave empty for the main branch.' },
  ],
  prepare: async ({ schoolId, school }) => ({
    schoolId, school,
    subjects: new Map((await M.Subject.find({ schoolId }).select('name code')).map((s) => [nameKey(s.name), s])),
    campuses: new Map((await M.Campus.find({ schoolId }).select('name code')).map((x) => [nameKey(x.name), x])),
  }),
  refine: async (value, row, c) => {
    if (value.subjects) {
      const ids = []; const missing = [];
      for (const s of value.subjects) { const hit = c.subjects.get(nameKey(s)); if (hit) ids.push(hit._id); else missing.push(s); }
      value._subjectIds = ids;
      if (missing.length) row.warnings.push(`These subjects are not set up yet and were left off: ${missing.join(', ')}`);
    }
    if (value.campus) {
      const cp = c.campuses.get(nameKey(value.campus));
      if (cp) value._campusId = cp._id;
      else if (c.pending && c.pending.campuses && c.pending.campuses.has(nameKey(value.campus))) row.warnings.push(`The branch "${value.campus}" is on the Branches sheet of this same file.`);
      else throw new Error(`No branch is called "${value.campus}". Add the branch first.`);
    }
  },
  label1: (v) => clean(v.name, 60),
  match: async (value, c) => {
    let hit = await M.Teacher.findOne({ schoolId: c.schoolId, email: value.email });
    if (!hit && value.employeeId) hit = await M.Teacher.findOne({ schoolId: c.schoolId, employeeId: value.employeeId });
    return hit ? { id: hit._id, label: clean(hit.name, 60), doc: hit } : null;
  },
  changes: (hit, value) => diff(hit.doc, value, [
    { key: 'name', label: 'Name' }, { key: 'phone', label: 'Mobile' }, { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' }, { key: 'employeeId', label: 'Staff number' },
  ]),
  create: async (value, c) => {
    const { checkLimit } = require('../plans');
    const limit = await checkLimit(c.schoolId, 'teacher', 1);
    if (!limit.ok) throw new Error(limit.message);
    const temp = strongTempPassword();
    const t = await M.Teacher.create({
      schoolId: c.schoolId, schoolCode: c.school.code, schoolName: c.school.name,
      name: value.name, email: value.email, password: await hashPassword(temp), role: 'teacher',
      phone: value.phone || undefined, employeeId: value.employeeId || undefined,
      gender: value.gender || 'Male', dateOfBirth: value.dateOfBirth, cnicNumber: value.cnicNumber || undefined,
      designation: value.designation || undefined, department: value.department || undefined,
      joiningDate: value.joiningDate || undefined, experience: value.experience || 0,
      currentAddress: value.currentAddress || undefined,
      subjectIds: value._subjectIds || [],
      campusId: value._campusId || null,
      qualifications: value.qualification ? [{ degree: value.qualification }] : [],
      salaryDetails: value.basicSalary ? { basicSalary: value.basicSalary } : undefined,
    });
    // a staff record too, so leave, roster and payroll see this person
    try {
      const code = value.employeeId || `T-${String(await M.Employee.countDocuments({ schoolId: c.schoolId }) + 1).padStart(4, '0')}`;
      if (!(await M.Employee.findOne({ schoolId: c.schoolId, code }))) {
        await M.Employee.create({ schoolId: c.schoolId, code, name: value.name, kind: 'teacher', teacherId: t._id, department: value.department || '', phone: value.phone || '', email: value.email, joinDate: value.joiningDate || new Date(), status: 'Active', basicSalary: value.basicSalary || 0, campusId: value._campusId || null });
      }
    } catch (e) { /* the teacher is saved either way */ }
    return { id: t._id, label: value.name, credential: { role: 'teacher', name: value.name, email: value.email, temporaryPassword: temp } };
  },
  update: async (hit, value, c) => {
    const set = {};
    for (const k of ['name', 'phone', 'designation', 'department', 'cnicNumber', 'currentAddress', 'employeeId']) if (value[k]) set[k] = value[k];
    if (value.dateOfBirth) set.dateOfBirth = value.dateOfBirth;
    if (value.joiningDate) set.joiningDate = value.joiningDate;
    if (value._subjectIds && value._subjectIds.length) set.subjectIds = value._subjectIds;
    if (value._campusId) set.campusId = value._campusId;
    const changed = Object.keys(set).map((k) => ({ field: k, from: String(hit.doc[k] ?? ''), to: String(set[k]) }));
    if (Object.keys(set).length) await M.Teacher.updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    return { id: hit.id, changed };
  },
};

const staff = {
  key: 'staff',
  label: 'Staff and guards',
  group: 'People',
  sheet: 'Staff',
  help: 'Everyone on the payroll who is not a teacher: clerks, guards, cleaners, drivers, librarians. The staff number is yours and must be different for each person.',
  unique: ['code'],
  columns: [
    { key: 'code', label: 'Staff number', required: true, max: 32, width: 14, example: 'S-021', note: 'Your own number for this person.' },
    { key: 'name', label: 'Full name', required: true, min: 2, max: 80, width: 22, example: 'Kashif Mehmood' },
    { key: 'kind', label: 'Role', type: 'choice', required: true, enum: ['admin', 'clerk', 'guard', 'cleaner', 'driver', 'technician', 'librarian', 'counselor', 'visiting', 'vendor'], width: 14, example: 'guard' },
    { key: 'department', label: 'Department', max: 60, width: 16, example: 'Security' },
    { key: 'phone', label: 'Mobile', type: 'phone', width: 16, example: '+92 301 2223344' },
    { key: 'email', label: 'Email', type: 'email', width: 24, example: 'kashif@example.com' },
    { key: 'joinDate', label: 'Joining date', type: 'date', width: 16, example: '2025-01-15' },
    { key: 'status', label: 'Status', type: 'choice', enum: ['Onboarding', 'Active', 'Separated'], default: 'Active', width: 14, example: 'Active' },
    { key: 'basicSalary', label: 'Basic salary', type: 'number', minValue: 0, width: 14, example: 35000 },
    { key: 'campus', label: 'Branch', max: 40, width: 16, example: 'Main campus', note: 'Which branch they work at. Leave empty for the main branch.' },
  ],
  prepare: async ({ schoolId }) => ({ schoolId, campuses: new Map((await M.Campus.find({ schoolId }).select('name code')).map((x) => [nameKey(x.name), x])) }),
  refine: async (value, row, c) => {
    if (!value.campus) return;
    const cp = c.campuses.get(nameKey(value.campus));
    if (cp) value._campusId = cp._id;
    else if (c.pending && c.pending.campuses && c.pending.campuses.has(nameKey(value.campus))) row.warnings.push(`The branch "${value.campus}" is on the Branches sheet of this same file.`);
    else throw new Error(`No branch is called "${value.campus}". Add the branch first.`);
  },
  label1: (v) => clean(v.name, 60),
  match: async (value, c) => {
    const hit = await M.Employee.findOne({ schoolId: c.schoolId, code: value.code });
    return hit ? { id: hit._id, label: clean(hit.name, 60), doc: hit } : null;
  },
  changes: (hit, value) => diff(hit.doc, value, [
    { key: 'name', label: 'Name' }, { key: 'kind', label: 'Role' }, { key: 'department', label: 'Department' },
    { key: 'phone', label: 'Mobile' }, { key: 'status', label: 'Status' }, { key: 'basicSalary', label: 'Basic salary' },
  ]),
  create: async (value, c) => {
    const e = await M.Employee.create({
      schoolId: c.schoolId, code: value.code, name: value.name, kind: value.kind,
      department: value.department || '', phone: value.phone || '', email: value.email || '',
      joinDate: value.joinDate || new Date(), status: value.status || 'Active', basicSalary: value.basicSalary || 0,
      campusId: value._campusId || null,
    });
    return { id: e._id, label: value.name };
  },
  update: async (hit, value, c) => {
    const set = {};
    for (const k of ['name', 'kind', 'department', 'phone', 'email', 'status']) if (value[k]) set[k] = value[k];
    if (value.basicSalary != null) set.basicSalary = value.basicSalary;
    if (value.joinDate) set.joinDate = value.joinDate;
    if (value._campusId) set.campusId = value._campusId;
    const changed = Object.keys(set).map((k) => ({ field: k, from: String(hit.doc[k] ?? ''), to: String(set[k]) }));
    await M.Employee.updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    return { id: hit.id, changed };
  },
};

const guardians = {
  key: 'guardians',
  label: 'Parents and guardians',
  group: 'People',
  sheet: 'Guardians',
  help: 'Parent sign-ins, linked to children who are already here. Name the child by admission number so the right family is linked.',
  unique: ['email'],
  columns: [
    { key: 'name', label: 'Full name', required: true, min: 2, max: 80, width: 22, example: 'Imran Khan' },
    { key: 'email', label: 'Email', type: 'email', required: true, width: 26, example: 'imran.khan@example.com', note: 'This is how the parent signs in.' },
    { key: 'phone', label: 'Mobile', type: 'phone', width: 18, example: '+92 300 7654321' },
    { key: 'relationship', label: 'Relationship', type: 'choice', enum: ['Father', 'Mother', 'Guardian'], default: 'Guardian', width: 14, example: 'Father' },
    { key: 'children', label: 'Children (admission numbers)', type: 'list', maxItems: 12, width: 30, example: 'ADM-2026-001, ADM-2026-004', note: 'Separate with commas. Each must be an admission number you already have.' },
  ],
  prepare: async ({ schoolId }) => ({ schoolId }),
  refine: async (value, row, c) => {
    value._childIds = [];
    if (!value.children) { row.warnings.push('No child is named, so this sign-in sees nothing yet.'); return; }
    const missing = []; const coming = [];
    for (const adm of value.children) {
      const st = await M.Student.findOne({ schoolId: c.schoolId, admissionNumber: adm }).select('name');
      if (st) { value._childIds.push(st._id); continue; }
      if (c.pending && c.pending.students && c.pending.students.has(String(adm).toLowerCase())) coming.push(adm);
      else missing.push(adm);
    }
    if (missing.length) throw new Error(`No child has the admission number ${missing.join(', ')}`);
    if (coming.length) row.warnings.push(`${coming.join(', ')} ${coming.length > 1 ? 'are' : 'is'} on the Students sheet of this same file and will exist by the time this row is written.`);
  },
  label1: (v) => clean(v.name, 60),
  match: async (value, c) => {
    const hit = await M.Parent.findOne({ schoolId: c.schoolId, email: value.email });
    return hit ? { id: hit._id, label: clean(hit.name, 60), doc: hit } : null;
  },
  changes: (hit, value) => {
    const out = diff(hit.doc, value, [{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Mobile' }, { key: 'relationship', label: 'Relationship' }]);
    const have = new Set((hit.doc.children || []).map(String));
    const add = (value._childIds || []).filter((id) => !have.has(String(id)));
    if (add.length) out.push({ field: 'Children', from: String(have.size), to: `${have.size + add.length}` });
    return out;
  },
  create: async (value, c) => {
    const temp = strongTempPassword();
    const p = await M.Parent.create({
      schoolId: c.schoolId, name: value.name, email: value.email, phone: value.phone || null,
      password: await hashPassword(temp), role: 'parent', relationship: value.relationship || 'Guardian',
      children: value._childIds || [],
    });
    for (const studentId of value._childIds || []) {
      await M.GuardianLink.create({ schoolId: c.schoolId, studentId, parentId: p._id, relationship: value.relationship || 'Guardian', isPrimary: false, note: 'Added from a file' }).catch(() => {});
    }
    return { id: p._id, label: value.name, credential: { role: 'parent', name: value.name, email: value.email, temporaryPassword: temp } };
  },
  update: async (hit, value, c) => {
    const set = {};
    for (const k of ['name', 'phone', 'relationship']) if (value[k]) set[k] = value[k];
    await M.Parent.updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    const have = new Set((hit.doc.children || []).map(String));
    const add = (value._childIds || []).filter((id) => !have.has(String(id)));
    for (const studentId of add) {
      await M.Parent.updateOne({ _id: hit.id }, { $addToSet: { children: studentId } });
      await M.GuardianLink.create({ schoolId: c.schoolId, studentId, parentId: hit.id, relationship: value.relationship || 'Guardian', isPrimary: false, note: 'Added from a file' }).catch(() => {});
    }
    return { id: hit.id, changed: [...Object.keys(set).map((k) => ({ field: k, from: String(hit.doc[k] ?? ''), to: String(set[k]) })), ...(add.length ? [{ field: 'Children', from: String(have.size), to: String(have.size + add.length) }] : [])] };
  },
};

/* ────────────────────────── school structure ────────────────────────── */

const classes = {
  key: 'classes',
  label: 'Classes',
  group: 'School',
  sheet: 'Classes',
  help: 'One row per class and section. A class already here is recognised by its class and section together.',
  unique: ['standard', 'division'],
  columns: [
    { key: 'standard', label: 'Class', required: true, max: 24, width: 12, example: '5', aliases: ['grade', 'class'] },
    { key: 'division', label: 'Section', required: true, max: 12, width: 10, example: 'B', aliases: ['section', 'div'] },
    { key: 'capacity', label: 'Seats', type: 'number', integer: true, minValue: 1, maxValue: 500, width: 10, example: 40 },
    { key: 'room', label: 'Room', max: 40, width: 14, example: 'Room 12' },
    { key: 'classTeacherEmail', label: 'Head teacher email', type: 'email', width: 26, example: 'sara.khan@example.com', note: 'The teacher must already be here.' },
    { key: 'campus', label: 'Branch', max: 40, width: 16, example: 'Main campus', note: 'Leave empty for the main branch.' },
    { key: 'academicYear', label: 'Academic year', max: 16, width: 14, example: '2026-27' },
  ],
  prepare: async ({ schoolId, school }) => ({
    schoolId, school,
    teachers: new Map((await M.Teacher.find({ schoolId }).select('email name')).map((t) => [String(t.email || '').toLowerCase(), t])),
    campuses: new Map((await M.Campus.find({ schoolId }).select('name code isDefault')).map((x) => [nameKey(x.name), x])),
  }),
  refine: async (value, row, c) => {
    if (value.classTeacherEmail) {
      const t = c.teachers.get(value.classTeacherEmail);
      if (t) value._teacherId = t._id;
      else if (c.pending && c.pending.teachers && c.pending.teachers.has(value.classTeacherEmail)) {
        row.warnings.push(`${value.classTeacherEmail} is on the Teachers sheet of this same file and will exist by the time this row is written.`);
      } else throw new Error(`No teacher has the email ${value.classTeacherEmail}. Load the teachers first.`);
    }
    if (value.campus) {
      const cp = c.campuses.get(nameKey(value.campus));
      if (cp) value._campusId = cp._id;
      else if (c.pending && c.pending.campuses && c.pending.campuses.has(nameKey(value.campus))) {
        row.warnings.push(`The branch "${value.campus}" is on the Branches sheet of this same file and will exist by the time this row is written.`);
      } else throw new Error(`No branch is called "${value.campus}". Add the branch first.`);
    }
  },
  label1: (v) => `${v.standard} ${v.division || ''}`.trim(),
  match: async (value, c) => {
    const all = await M.Class.find({ schoolId: c.schoolId }).select('standard division capacity room classTeacherId campusId');
    const hit = all.find((x) => stdKey(x.standard) === stdKey(value.standard) && divKey(x.division) === divKey(value.division));
    return hit ? { id: hit._id, label: `${hit.standard} ${hit.division}`, doc: hit } : null;
  },
  changes: (hit, value) => {
    const out = [];
    if (value.capacity && Number(hit.doc.capacity) !== Number(value.capacity)) out.push({ field: 'Seats', from: String(hit.doc.capacity ?? ''), to: String(value.capacity) });
    if (value.room && String(hit.doc.room || '') !== value.room) out.push({ field: 'Room', from: String(hit.doc.room || ''), to: value.room });
    if (value._teacherId && String(hit.doc.classTeacherId || '') !== String(value._teacherId)) out.push({ field: 'Head teacher', from: '', to: value.classTeacherEmail });
    return out;
  },
  create: async (value, c) => {
    const doc = await M.Class.create({
      schoolId: c.schoolId, standard: value.standard, division: value.division,
      capacity: value.capacity || 40, room: value.room || undefined,
      classTeacherId: value._teacherId || undefined, campusId: value._campusId || undefined,
      academicYear: value.academicYear || c.school.academicYear || undefined,
    });
    if (value._teacherId) await require('../headMaster').setHeadMaster(c.schoolId, doc._id, value._teacherId).catch(() => {});
    return { id: doc._id, label: `${value.standard} ${value.division}` };
  },
  update: async (hit, value, c) => {
    const set = {};
    if (value.capacity) set.capacity = value.capacity;
    if (value.room) set.room = value.room;
    if (value._campusId) set.campusId = value._campusId;
    if (value.academicYear) set.academicYear = value.academicYear;
    if (Object.keys(set).length) await M.Class.updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    if (value._teacherId && String(hit.doc.classTeacherId || '') !== String(value._teacherId)) {
      await require('../headMaster').setHeadMaster(c.schoolId, hit.id, value._teacherId).catch(() => {});
    }
    return { id: hit.id, changed: Object.keys(set).map((k) => ({ field: k, from: String(hit.doc[k] ?? ''), to: String(set[k]) })) };
  },
};

const subjects = simple({
  key: 'subjects', label: 'Subjects', group: 'School', model: 'Subject', unique: ['code'],
  help: 'One row per subject. The code is short and must be different for each subject.',
  columns: [
    { key: 'code', label: 'Code', required: true, max: 16, width: 10, example: 'PHY' },
    { key: 'name', label: 'Subject', required: true, max: 60, width: 20, example: 'Physics' },
    { key: 'standard', label: 'Class', max: 24, width: 10, example: '9', note: 'Leave empty if the subject is taught in several classes.' },
    { key: 'maxMarks', label: 'Full marks', type: 'number', integer: true, minValue: 1, maxValue: 1000, width: 12, example: 100 },
    { key: 'minMarks', label: 'Pass marks', type: 'number', integer: true, minValue: 0, maxValue: 1000, width: 12, example: 33 },
    { key: 'defaultWeeklyLectures', label: 'Lessons a week', type: 'number', integer: true, minValue: 0, maxValue: 40, width: 16, example: 5 },
    { key: 'description', label: 'Notes', max: 200, width: 24, example: 'Includes the practical' },
  ],
  toDoc: (v) => ({ code: v.code, name: v.name, standard: v.standard, maxMarks: v.maxMarks ?? 100, minMarks: v.minMarks ?? 33, defaultWeeklyLectures: v.defaultWeeklyLectures ?? 5, description: v.description }),
  label1: (v) => v.name,
});

const rooms = simple({
  key: 'rooms', label: 'Rooms', group: 'School', model: 'Room', unique: ['name'],
  help: 'Classrooms, labs and halls, used by the timetable.',
  extraKeys: { name: 'name' },
  columns: [
    { key: 'name', label: 'Room', required: true, max: 40, width: 18, example: 'Room 12' },
    { key: 'kind', label: 'Kind', type: 'choice', enum: ['Classroom', 'Lab', 'Library', 'Hall', 'Sports', 'Computer', 'Other'], default: 'Classroom', width: 14, example: 'Classroom' },
    { key: 'capacity', label: 'Seats', type: 'number', integer: true, minValue: 1, maxValue: 2000, width: 10, example: 40 },
    { key: 'notes', label: 'Notes', max: 200, width: 24, example: 'Ground floor, east wing' },
  ],
  toDoc: (v) => ({ name: v.name, nameKey: nameKey(v.name), kind: v.kind || 'Classroom', capacity: v.capacity ?? 40, notes: v.notes || '', active: true }),
});

const campuses = simple({
  key: 'campuses', label: 'Branches', group: 'School', model: 'Campus', unique: ['code'],
  help: 'The branches of this school. Classes, staff and children are then placed in a branch.',
  columns: [
    { key: 'code', label: 'Branch code', required: true, max: 16, width: 14, example: 'NORTH' },
    { key: 'name', label: 'Branch name', required: true, max: 80, width: 24, example: 'North campus' },
    { key: 'address', label: 'Address', max: 200, width: 28, example: 'Sector F-11, Islamabad' },
    { key: 'phone', label: 'Phone', type: 'phone', width: 16, example: '+92 51 1234567' },
  ],
  toDoc: (v) => ({ code: codeKey(v.code), name: v.name, address: v.address || '', phone: v.phone || '', status: 'active' }),
});

/* ────────────────────────── fees, library, transport, store ────────────────────────── */

const feeStructures = simple({
  key: 'fee-structures', label: 'Fee structures', group: 'Fees', model: 'FeeStructure', unique: ['standard'],
  help: 'What a class pays in a year, and how it is split. One row per class.',
  columns: [
    { key: 'standard', label: 'Class', required: true, max: 24, width: 12, example: '5' },
    { key: 'totalAmount', label: 'Yearly total', type: 'number', required: true, minValue: 0, width: 16, example: 120000 },
    { key: 'totalInstallments', label: 'Instalments', type: 'number', integer: true, minValue: 1, maxValue: 12, width: 14, example: 4, note: 'How many times a year the family pays. The yearly total is split evenly between them.' },
    { key: 'totalMonths', label: 'Months', type: 'number', integer: true, minValue: 1, maxValue: 12, width: 10, example: 12 },
    { key: 'academicYear', label: 'Academic year', max: 16, width: 14, example: '2026-27' },
  ],
  // the four instalment amounts the rest of the fee module reads, worked out the same way the
  // fee screen works them out, so a structure made from a sheet behaves like one made by hand
  toDoc: (v) => {
    const parts = v.totalInstallments ?? 4;
    const each = Math.round((v.totalAmount / parts) * 100) / 100;
    return { standard: v.standard, totalAmount: v.totalAmount, totalInstallments: parts, totalMonths: v.totalMonths ?? 12, academicYear: v.academicYear || '', q1Amount: each, q2Amount: each, q3Amount: each, q4Amount: each };
  },
  label1: (v) => `Class ${v.standard}`,
});

const libraryTitles = simple({
  key: 'library-titles', label: 'Library books', group: 'Library', model: 'LbTitle', unique: ['isbn'], feature: 'library',
  help: 'One row per book title. Copies are added on the Library copies sheet.',
  columns: [
    { key: 'isbn', label: 'ISBN', required: true, max: 20, width: 18, example: '9789694021234', note: 'A book with no ISBN can be given your own code instead.' },
    { key: 'title', label: 'Title', required: true, max: 160, width: 30, example: 'Pakistan Studies' },
    { key: 'authors', label: 'Authors', type: 'list', maxItems: 8, width: 24, example: 'M. Ikram Rabbani' },
    { key: 'publisher', label: 'Publisher', max: 80, width: 20, example: 'Caravan' },
    { key: 'year', label: 'Year', type: 'number', integer: true, minValue: 1400, maxValue: 2100, width: 10, example: 2024 },
    { key: 'kind', label: 'Kind', type: 'choice', enum: ['book', 'textbook', 'reference', 'periodical', 'other'], default: 'book', width: 12, example: 'textbook' },
    { key: 'language', label: 'Language', max: 30, width: 12, example: 'English' },
    { key: 'shelf', label: 'Shelf', max: 30, width: 12, example: 'B-3' },
    { key: 'price', label: 'Replacement cost', type: 'number', minValue: 0, width: 18, example: 850 },
  ],
  toDoc: (v) => ({ isbn: v.isbn, title: v.title, authors: v.authors || [], publisher: v.publisher || '', year: v.year ?? null, kind: v.kind || 'book', language: v.language || 'English', shelf: v.shelf || '', price: v.price ?? 0, lendable: v.kind !== 'reference', active: true, source: 'import' }),
  label1: (v) => v.title,
});

const libraryCopies = {
  key: 'library-copies',
  label: 'Library copies',
  group: 'Library',
  sheet: 'Library copies',
  feature: 'library',
  help: 'One row per physical copy. The book must already be in the library list.',
  unique: ['barcode'],
  columns: [
    { key: 'barcode', label: 'Barcode', required: true, max: 40, width: 18, example: 'LIB-000123' },
    { key: 'isbn', label: 'Book ISBN', required: true, max: 20, width: 18, example: '9789694021234' },
    { key: 'condition', label: 'Condition', type: 'choice', enum: ['new', 'good', 'fair', 'poor'], default: 'good', width: 12, example: 'good' },
    { key: 'shelf', label: 'Shelf', max: 30, width: 12, example: 'B-3' },
    { key: 'acquiredOn', label: 'Bought on', type: 'date', width: 16, example: '2025-09-01' },
    { key: 'price', label: 'Cost', type: 'number', minValue: 0, width: 12, example: 850 },
  ],
  prepare: async ({ schoolId }) => ({ schoolId }),
  refine: async (value, row, c) => {
    const t = await M.LbTitle.findOne({ schoolId: c.schoolId, isbn: value.isbn }).select('title');
    if (t) { value._titleId = t._id; value._title = t.title; return; }
    if (c.pending && c.pending['library-titles'] && c.pending['library-titles'].has(String(value.isbn).toLowerCase())) {
      row.warnings.push(`This book is on the Library books sheet of this same file and will exist by the time this row is written.`);
      return;
    }
    throw new Error(`No book has the ISBN ${value.isbn}. Load the library books first.`);
  },
  label1: (v) => v.barcode,
  match: async (value, c) => {
    const hit = await M.LbCopy.findOne({ schoolId: c.schoolId, barcode: value.barcode });
    return hit ? { id: hit._id, label: hit.barcode, doc: hit } : null;
  },
  changes: (hit, value) => diff(hit.doc, value, [{ key: 'condition', label: 'Condition' }, { key: 'shelf', label: 'Shelf' }]),
  create: async (value, c) => {
    if (!value._titleId) throw new Error('The book for this copy does not exist yet. Load the Library books sheet first.');
    const copy = await M.LbCopy.create({ schoolId: c.schoolId, titleId: value._titleId, barcode: value.barcode, condition: value.condition || 'good', shelf: value.shelf || '', acquiredOn: value.acquiredOn || new Date(), price: value.price ?? 0, status: 'available' });
    await M.LbTitle.updateOne({ _id: value._titleId, schoolId: c.schoolId }, { $inc: { copies: 1, available: 1 } });
    return { id: copy._id, label: `${value.barcode} · ${value._title}` };
  },
  update: async (hit, value, c) => {
    const set = {};
    if (value.condition) set.condition = value.condition;
    if (value.shelf) set.shelf = value.shelf;
    if (value.price != null) set.price = value.price;
    await M.LbCopy.updateOne({ _id: hit.id, schoolId: c.schoolId }, { $set: set });
    return { id: hit.id, changed: Object.keys(set).map((k) => ({ field: k, from: String(hit.doc[k] ?? ''), to: String(set[k]) })) };
  },
};

const transportRoutes = simple({
  key: 'transport-routes', label: 'Transport routes', group: 'Transport', model: 'TransportRoute', unique: ['name'], feature: 'transport',
  help: 'One row per bus route, with what it costs a family each month.',
  columns: [
    { key: 'name', label: 'Route', required: true, max: 80, width: 26, example: 'Route 1 — Bahria Town' },
    { key: 'monthlyFee', label: 'Monthly fee', type: 'number', required: true, minValue: 0, width: 16, example: 4500 },
    { key: 'vehicle', label: 'Vehicle', max: 40, width: 14, example: 'LES-1234' },
    { key: 'driverName', label: 'Driver', max: 60, width: 18, example: 'Rashid Ali' },
    { key: 'driverPhone', label: 'Driver mobile', type: 'phone', width: 18, example: '+92 302 1112233' },
    { key: 'notes', label: 'Notes', max: 200, width: 24, example: 'Morning and afternoon' },
  ],
  toDoc: (v) => ({ name: v.name, monthlyFee: v.monthlyFee, vehicle: v.vehicle || '', driverName: v.driverName || '', driverPhone: v.driverPhone || '', notes: v.notes || '', isActive: true }),
});

const storeItems = simple({
  key: 'store-items', label: 'Store items', group: 'Store', model: 'StSku', unique: ['sku'], feature: 'store',
  help: 'Uniforms, books and stationery sold at the school counter.',
  columns: [
    { key: 'sku', label: 'Item code', required: true, max: 32, width: 14, example: 'UNI-SH-32' },
    { key: 'name', label: 'Item', required: true, max: 80, width: 24, example: 'Boys shirt' },
    { key: 'category', label: 'Category', type: 'choice', enum: ['uniform', 'book', 'stationery', 'other'], default: 'other', width: 14, example: 'uniform' },
    { key: 'variant', label: 'Size or variant', max: 40, width: 16, example: 'Size 32' },
    { key: 'price', label: 'Selling price', type: 'number', required: true, minValue: 0, width: 14, example: 1200 },
    { key: 'cost', label: 'Cost price', type: 'number', minValue: 0, width: 12, example: 900 },
    { key: 'onHand', label: 'In stock', type: 'number', integer: true, minValue: 0, width: 12, example: 45 },
    { key: 'reorderLevel', label: 'Reorder at', type: 'number', integer: true, minValue: 0, width: 12, example: 10 },
    { key: 'barcode', label: 'Barcode', max: 40, width: 16, example: '2001234500011' },
  ],
  toDoc: (v) => ({ sku: codeKey(v.sku), name: v.name, category: v.category || 'other', variant: v.variant || '', price: v.price, cost: v.cost ?? 0, onHand: v.onHand ?? 0, available: v.onHand ?? 0, reorderLevel: v.reorderLevel ?? 0, barcode: v.barcode || undefined, active: true }),
});

const vendors = simple({
  key: 'vendors', label: 'Suppliers', group: 'Procurement', model: 'PcVendor', unique: ['name'], feature: 'procurement',
  help: 'The suppliers the school buys from.',
  columns: [
    { key: 'name', label: 'Supplier', required: true, max: 120, width: 26, example: 'Al-Noor Stationers' },
    { key: 'taxNo', label: 'NTN', max: 30, width: 16, example: '1234567-8' },
    { key: 'contact', label: 'Contact person', max: 80, width: 20, example: 'Bilal Ahmed' },
    { key: 'phone', label: 'Phone', type: 'phone', width: 18, example: '+92 51 2345678' },
    { key: 'email', label: 'Email', type: 'email', width: 24, example: 'sales@alnoor.example' },
    { key: 'address', label: 'Address', max: 200, width: 28, example: 'Blue Area, Islamabad' },
    { key: 'categories', label: 'Supplies', type: 'list', maxItems: 10, width: 24, example: 'Stationery, Printing' },
  ],
  toDoc: (v) => ({ name: v.name, nameKey: nameKey(v.name), taxNo: v.taxNo || '', taxKey: v.taxNo ? codeKey(v.taxNo) : undefined, contact: v.contact || '', phone: v.phone || '', email: v.email || '', address: v.address || '', categories: v.categories || [], status: 'active' }),
  extraKeys: { name: 'nameKey' },
});

/* ────────────────────────── the registry ────────────────────────── */

const LIST = [
  students, teachers, staff, guardians,
  classes, subjects, rooms, campuses,
  feeStructures,
  libraryTitles, libraryCopies,
  transportRoutes, storeItems, vendors,
];

// Suppliers match on a folded name, so the simple matcher needs the folded value.
vendors.match = async (value, c) => {
  const hit = await M.PcVendor.findOne({ schoolId: c.schoolId, nameKey: nameKey(value.name) });
  return hit ? { id: hit._id, label: clean(hit.name, 60), doc: hit } : null;
};
rooms.match = async (value, c) => {
  const hit = await M.Room.findOne({ schoolId: c.schoolId, nameKey: nameKey(value.name) });
  return hit ? { id: hit._id, label: clean(hit.name, 60), doc: hit } : null;
};

// The keys a row will exist under once it is written. A later sheet in the same workbook uses
// these to accept a reference to something an earlier sheet is about to create.
const PENDING_KEY = {
  classes: (v) => `${stdKey(v.standard)}|${divKey(v.division)}`,
  teachers: (v) => String(v.email || '').toLowerCase(),
  students: (v) => String(v.admissionNumber || '').toLowerCase(),
  'library-titles': (v) => String(v.isbn || '').toLowerCase(),
  campuses: (v) => nameKey(v.name),
  subjects: (v) => nameKey(v.name),
};

const BY_KEY = new Map(LIST.map((d) => [d.key, d]));
const get = (key) => BY_KEY.get(String(key || '').toLowerCase()) || null;
const head = (d) => ({ key: d.key, label: d.label, group: d.group, help: d.help, feature: d.feature || null, columns: d.columns.map((c) => ({ key: c.key, label: c.label, required: !!c.required, note: c.note || '', enum: c.enum || null, type: c.type || 'text', example: c.example == null ? '' : String(c.example) })) });

module.exports = { LIST, BY_KEY, get, head, M, resolveClass, classIndex, simple, diff, PENDING_KEY };
