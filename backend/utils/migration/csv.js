// Small CSV reader and the column-name aliases used by the importer (PRD E29). Accepts comma, semicolon or tab files, quoted cells and a leading BOM.
const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseCsv(text) {
  let s = String(text || '').replace(/^﻿/, '');
  if (!s.trim()) return [];
  const first = s.split(/\r?\n/)[0];
  const delim = [',', ';', '\t'].map((d) => [d, (first.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => String(x).trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => String(x).trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES = {
  students: {
    name: ['name', 'studentname', 'fullname', 'student', 'childname', 'learnername'],
    gender: ['gender', 'sex'],
    dateOfBirth: ['dob', 'dateofbirth', 'birthdate', 'birthday', 'bday'],
    class: ['class', 'classname', 'classsection', 'gradesection', 'classdivision'],
    standard: ['standard', 'std', 'grade', 'level', 'classlevel'],
    division: ['division', 'section', 'div'],
    admissionNumber: ['admissionnumber', 'admissionno', 'admno', 'admission', 'grno', 'regno', 'registrationno', 'registrationnumber', 'studentid', 'enrollmentno'],
    rollNumber: ['rollnumber', 'rollno', 'roll'],
    guardianName: ['guardianname', 'parentname', 'guardian', 'parent', 'fathername', 'father'],
    guardianRelationship: ['relationship', 'guardianrelationship', 'relation', 'parentrelationship'],
    guardianPhone: ['guardianphone', 'parentphone', 'phone', 'mobile', 'contact', 'contactnumber', 'fatherphone', 'mobilenumber', 'whatsapp', 'guardianmobile'],
    guardianEmail: ['guardianemail', 'parentemail', 'fatheremail'],
    email: ['email', 'studentemail'],
    previousSchool: ['previousschool', 'lastschool', 'previousinstitute'],
    address: ['address', 'currentaddress', 'homeaddress'],
    bloodGroup: ['bloodgroup', 'blood'],
    password: ['password', 'initialpassword'],
  },
  classes: {
    standard: ['standard', 'std', 'grade', 'level', 'class', 'classname'],
    division: ['division', 'section', 'div'],
    capacity: ['capacity', 'seats', 'maxstudents'],
    room: ['room', 'roomno', 'classroom'],
    classTeacherEmail: ['classteacher', 'classteacheremail', 'teacheremail', 'teacher'],
    academicYear: ['academicyear', 'year', 'session'],
  },
};
const TEMPLATE = {
  students: ['name', 'gender', 'dateOfBirth', 'standard', 'division', 'admissionNumber', 'rollNumber', 'guardianName', 'guardianRelationship', 'guardianPhone', 'guardianEmail', 'email', 'previousSchool'],
  classes: ['standard', 'division', 'capacity', 'room', 'classTeacherEmail'],
};
const TEMPLATE_SAMPLE = {
  students: ['Hira Malik', 'Female', '2014-03-21', '5', 'A', '2026-0101', '12', 'Imran Malik', 'Father', '03001234567', 'imran@example.com', '', 'Fresh'],
  classes: ['5', 'A', '40', 'R-12', 'sara.khan@demo.school'],
};

// rows (array of arrays) -> [{n, raw:{field:value}}]; n is the line number in the file, so errors can point at it
function toRecords(kind, matrix) {
  if (!matrix.length) return { records: [], unknown: [], missing: [] };
  const map = {}; const unknown = [];
  matrix[0].forEach((h, i) => {
    const k = norm(h); if (!k) return;
    const field = Object.keys(ALIASES[kind]).find((f) => norm(f) === k || ALIASES[kind][f].includes(k));
    if (field && map[field] === undefined) map[field] = i; else if (!field) unknown.push(String(h).trim());
  });
  const records = matrix.slice(1).map((r, i) => { const raw = {}; for (const [f, idx] of Object.entries(map)) raw[f] = String(r[idx] == null ? '' : r[idx]).trim(); return { n: i + 2, raw }; });
  return { records, unknown, mapped: Object.keys(map) };
}

const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (header, rows) => [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');

module.exports = { parseCsv, toRecords, toCsv, norm, TEMPLATE, TEMPLATE_SAMPLE };
