// School backups: build a complete copy of one school's data, store weekly snapshots, and produce a downloadable ZIP
// (full data as JSON + an Excel workbook with one sheet per table + optionally the uploaded files).
const zlib = require('zlib');
const { promisify } = require('util');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const db = require('../lib/pgdoc/db');
const registry = require('../lib/pgdoc/registry');
const School = require('../models/School');
const Backup = require('../models/Backup');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Models that belong to one school (everything keyed by schoolId). Notifications and push subscriptions are
// short-lived, per-device data, so they are left out.
const TABLES = [
  'User', 'Teacher', 'Student', 'Parent', 'Class', 'Subject', 'Timetable', 'TimetableConfig',
  'Attendance', 'DailyAttendance', 'Exam', 'Marks', 'Homework', 'Notice', 'Event', 'Message', 'Complaint',
  'FeeStructure', 'StudentFee', 'FeeCharge', 'PaymentProof', 'TransportRoute', 'TransportAssignment', 'StoredFile',
];
const SECRET_KEYS = new Set(['password', 'passwordResetToken', 'passwordResetExpires', 'refreshToken', 'refreshTokens', 'resetToken']);
const RETENTION = { auto: 4, manual: 3 };
const WEEK_MS = 7 * 24 * 3600 * 1000;
// Vercel functions cannot send more than 4.5 MB in one response
const RESPONSE_CAP = process.env.VERCEL ? 4.2 * 1024 * 1024 : Infinity;
const FILE_CAP = process.env.VERCEL ? 2.5 * 1024 * 1024 : 200 * 1024 * 1024;

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET_KEYS.has(k)) o[k] = strip(x);
    return o;
  }
  return v;
};

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

// Read all rows of one school straight from the tables. Passwords stay in the stored copy (so a full restore keeps
// everybody's login) and are removed again whenever a file is handed to a person.
async function collect(schoolId, { withFiles = false } = {}) {
  const sid = String(schoolId);
  const school = (await db.get().query(`SELECT id, doc FROM ${q(registry.get('School').table)} WHERE id = $1`, [sid])).rows[0];
  if (!school) throw Object.assign(new Error('School not found'), { status: 404 });
  const tables = {}; const counts = {}; const files = [];
  for (const name of TABLES) {
    const M = registry.get(name);
    if (!M) continue;
    if (name === 'StoredFile') {
      const { rows } = await db.get().query(
        `SELECT id, doc - 'key' AS doc${withFiles ? ', bin_data' : ''} FROM ${q(M.table)} WHERE doc->>'schoolId' = $1 ORDER BY id`, [sid]);
      tables[name] = rows.map((r) => ({ _id: r.id, ...r.doc }));
      if (withFiles) for (const r of rows) if (r.bin_data) files.push({ id: r.id, name: r.doc.originalName || r.id, mime: r.doc.mimeType, data: Buffer.from(r.bin_data) });
    } else {
      const { rows } = await db.get().query(`SELECT id, doc FROM ${q(M.table)} WHERE doc->>'schoolId' = $1 ORDER BY id`, [sid]);
      tables[name] = rows.map((r) => ({ _id: r.id, ...r.doc }));
    }
    counts[name] = tables[name].length;
  }
  return { school: { _id: school.id, ...school.doc }, tables, counts, files };
}

const buildPayload = (c, { clean }) => ({
  format: 'aulensia-backup', version: 1, createdAt: new Date().toISOString(),
  credentials: clean ? 'removed' : 'included',
  school: clean ? strip(c.school) : c.school,
  counts: c.counts,
  tables: clean ? strip(c.tables) : c.tables,
});

// ───────────────────────── stored snapshots ─────────────────────────
async function prune(schoolId, kind) {
  const old = await Backup.find({ schoolId, kind }).sort({ createdAt: -1 }).skip(RETENTION[kind]).select('_id');
  if (old.length) await Backup.deleteMany({ _id: { $in: old.map((o) => o._id) } });
}

async function createSnapshot(schoolId, { kind = 'auto', createdBy = null, createdByName = '' } = {}) {
  const c = await collect(schoolId);
  const json = Buffer.from(JSON.stringify(buildPayload(c, { clean: false })));
  const data = await gzip(json, { level: 9 });
  const doc = await Backup.create({
    schoolId, kind, createdBy: createdBy || undefined, createdByName, size: data.length, rawSize: json.length, counts: c.counts, data,
  });
  await prune(schoolId, kind);
  return doc;
}

const listSnapshots = (schoolId) =>
  Backup.find({ schoolId }).sort({ createdAt: -1 }).select('kind createdAt createdByName size rawSize counts');

async function readSnapshot(schoolId, id) {
  const b = await Backup.findOne({ _id: id, schoolId }).select('+data');
  if (!b || !b.data) return null;
  return { meta: b, payload: JSON.parse((await gunzip(b.data)).toString()) };
}

// Run by the daily cron (Vercel) or weekly timer (Render): back up every school that has no copy from the last week.
async function runWeekly({ budgetMs = 45000, force = false } = {}) {
  const started = Date.now();
  const schools = await School.find({ isActive: true }).select('_id name');
  const due = [];
  for (const s of schools) {
    const last = await Backup.findOne({ schoolId: s._id, kind: 'auto' }).sort({ createdAt: -1 }).select('createdAt');
    if (force || !last || Date.now() - new Date(last.createdAt).getTime() >= WEEK_MS - 12 * 3600 * 1000) due.push({ s, at: last ? new Date(last.createdAt).getTime() : 0 });
  }
  due.sort((a, b) => a.at - b.at);
  const done = []; const failed = [];
  for (const { s } of due) {
    if (Date.now() - started > budgetMs) break;
    try { await createSnapshot(s._id, { kind: 'auto', createdByName: 'Weekly automatic backup' }); done.push(s.name); }
    catch (e) { failed.push({ school: s.name, error: e.message }); console.error('[backup] failed for', s.name, e.message); }
  }
  const result = { schools: schools.length, due: due.length, backedUp: done.length, remaining: due.length - done.length - failed.length, failed };
  console.log('[backup] weekly run', JSON.stringify(result));
  return result;
}

// ───────────────────────── downloadable ZIP ─────────────────────────
const safeName = (s) => String(s || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 80);
const sheetName = (s) => String(s).replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31);

function flatten(obj, prefix = '', out = {}, depth = 0) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) out[key] = JSON.stringify(v).slice(0, 1000);
    else if (typeof v === 'object') { if (depth < 2) flatten(v, key, out, depth + 1); else out[key] = JSON.stringify(v).slice(0, 1000); }
    else if (typeof v === 'string' && v.length > 2000) out[key] = '[large content omitted – see backup.json]';
    else out[key] = v;
  }
  return out;
}

async function buildWorkbook(payload) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aulensia';
  const info = wb.addWorksheet('About');
  info.addRows([['Aulensia school backup'], ['School', payload.school.name], ['School code', payload.school.code], ['Created', payload.createdAt], [], ['Table', 'Rows']]);
  for (const [name, n] of Object.entries(payload.counts)) info.addRow([name, n]);
  info.getColumn(1).width = 28; info.getColumn(2).width = 40;
  for (const [name, rows] of Object.entries(payload.tables)) {
    if (!rows.length) continue;
    const flat = rows.slice(0, 100000).map((r) => flatten(r));
    const cols = [...flat.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())];
    const ws = wb.addWorksheet(sheetName(name));
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 2, 12), 40) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of flat) ws.addRow(r);
  }
  return wb.xlsx.writeBuffer();
}

const readme = (payload, notes) => `AULENSIA – SCHOOL DATA BACKUP
=============================
School : ${payload.school.name} (${payload.school.code})
Created: ${payload.createdAt}

What is inside
  backup.json         Complete copy of the school's data (students, teachers, parents, classes, fees, attendance, marks, notices ...).
  school-data.xlsx    The same data as an Excel workbook: one sheet per table, easy to open and search.
  files/              Uploaded documents and payment screenshots (only when requested and small enough).

Please note
  * Passwords and login tokens are NOT included in this file for your safety. After a restore, users set new passwords.
  * Keep this ZIP somewhere private (it contains student and staff personal data such as CNIC / B-Form numbers).
  * To restore, send this file to the platform owner / support.
${notes.length ? '\nNotes\n' + notes.map((n) => '  * ' + n).join('\n') + '\n' : ''}
ڈرس گاہ – اسکول ڈیٹا بیک اپ: اس فائل میں آپ کے اسکول کا مکمل ڈیٹا موجود ہے۔ اسے محفوظ جگہ پر رکھیں۔
`;

async function buildArchive(schoolId, { includeFiles = false } = {}) {
  const notes = [];
  const c = await collect(schoolId, { withFiles: includeFiles });
  const payload = buildPayload(c, { clean: true });
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(payload));
  zip.file('school-data.xlsx', await buildWorkbook(payload));
  if (includeFiles) {
    const total = c.files.reduce((n, f) => n + f.data.length, 0);
    if (total > FILE_CAP) notes.push(`Uploaded files (${(total / 1048576).toFixed(1)} MB) are too large for one download on this server, so they were left out. The file list is in backup.json.`);
    else for (const f of c.files) zip.file(`files/${f.id}_${safeName(f.name)}`, f.data, { binary: true });
  }
  zip.file('README.txt', readme(payload, notes));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (buffer.length > RESPONSE_CAP) {
    throw Object.assign(new Error(`This backup is ${(buffer.length / 1048576).toFixed(1)} MB, above the 4.5 MB limit of the current free server. ${includeFiles ? 'Try again without uploaded files, or ' : ''}ask the platform owner to export it for you.`), { status: 413 });
  }
  return { buffer, filename: `aulensia-backup-${safeName(c.school.code)}-${new Date().toISOString().slice(0, 10)}.zip`, notes, counts: c.counts };
}

// Same ZIP, but built from a stored weekly/manual copy (credentials removed)
async function archiveFromSnapshot(schoolId, id) {
  const snap = await readSnapshot(schoolId, id);
  if (!snap) return null;
  const payload = { ...snap.payload, credentials: 'removed', school: strip(snap.payload.school), tables: strip(snap.payload.tables) };
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(payload));
  zip.file('school-data.xlsx', await buildWorkbook(payload));
  zip.file('README.txt', readme({ ...payload, createdAt: new Date(snap.meta.createdAt).toISOString() }, ['Uploaded files are not part of stored weekly copies; use "Download full backup" to include them.']));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (buffer.length > RESPONSE_CAP) throw Object.assign(new Error('This backup is larger than the 4.5 MB limit of the current free server.'), { status: 413 });
  return { buffer, filename: `aulensia-backup-${safeName(payload.school.code)}-${new Date(snap.meta.createdAt).toISOString().slice(0, 10)}.zip` };
}

module.exports = { TABLES, collect, createSnapshot, listSnapshots, readSnapshot, runWeekly, buildArchive, archiveFromSnapshot, strip, prune };
