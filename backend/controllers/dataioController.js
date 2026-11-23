// Filling a module from a sheet, and the blank template to fill in.
//
// The uploaded file lives in memory for the length of one request and is then dropped: nothing is
// written to disk, and no half-finished job is kept on the server between requests. The browser
// holds the checked rows and sends them back in small batches, and every row is checked again here
// before anything is written.

const Reg = require('../utils/dataio/modules');
const WB = require('../utils/dataio/workbook');
const Engine = require('../utils/dataio/engine');
const School = require('../models/School');
const { audit } = require('../utils/audit');
const { featuresForSchool } = require('../utils/plans');

const bad = (res, status, message, extra) => res.status(status).json({ message, ...(extra || {}) });
const wrap = (what, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e && e.status) return bad(res, e.status, e.message);
    console.error(`dataio ${what}:`, e);
    return bad(res, 500, 'Something went wrong. Please try again.');
  }
};
const sid = (req) => req.user.schoolId;

// A module the school cannot use (its plan does not include that part) is not offered at all.
const allowed = async (schoolId) => {
  let feats = {};
  try { feats = (await featuresForSchool(schoolId)).features || {}; } catch (e) { feats = {}; }
  return (def) => !def.feature || feats[def.feature] !== false;
};

const loadDef = async (req) => {
  const def = Reg.get(req.params.module);
  if (!def) throw Object.assign(new Error('That is not something we can fill from a file.'), { status: 404 });
  const ok = await allowed(sid(req));
  if (!ok(def)) throw Object.assign(new Error(`${def.label} is not part of your plan.`), { status: 403 });
  return def;
};

const ctxOf = async (req) => {
  const school = await School.findById(sid(req)).select('name nameUr code academicYear');
  if (!school) throw Object.assign(new Error('School not found.'), { status: 404 });
  return { schoolId: sid(req), school, user: { id: String(req.user.userId), name: req.actorName || '' } };
};

/* ── what can be filled from a file ── */
exports.modules = wrap('modules', async (req, res) => {
  const ok = await allowed(sid(req));
  const groups = new Map();
  for (const def of Reg.LIST) {
    if (!ok(def)) continue;
    if (!groups.has(def.group)) groups.set(def.group, []);
    groups.get(def.group).push(Reg.head(def));
  }
  res.json({
    groups: [...groups.entries()].map(([group, modules]) => ({ group, modules })),
    limits: { maxRows: WB.MAX_ROWS, maxBytes: WB.MAX_BYTES, batch: Engine.BATCH },
  });
});

/* ── the blank template ── */
exports.template = wrap('template', async (req, res) => {
  const def = await loadDef(req);
  const school = await School.findById(sid(req)).select('name code');
  const wb = WB.templateBook(def, { school });
  const buf = await wb.xlsx.writeBuffer();
  res
    .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('Content-Disposition', `attachment; filename="aulensia-${def.key}-template.xlsx"`)
    .set('Cache-Control', 'private, no-store')
    .send(Buffer.from(buf));
});

/* ── check a file, write nothing ── */
exports.preview = wrap('preview', async (req, res) => {
  const def = await loadDef(req);
  if (!req.file || !req.file.buffer) return bad(res, 400, 'Attach the filled-in file.');
  let parsed;
  try {
    parsed = await WB.readSheet(req.file.buffer, { columns: def.columns, sheet: def.sheet });
  } finally {
    // the file never outlives the request
    req.file.buffer = null;
  }
  if (parsed.missing.length) return bad(res, 422, `These columns are needed and were not found: ${parsed.missing.join(', ')}. Download the template and fill that in.`, { unknown: parsed.unknown });
  if (!parsed.rows.length) return bad(res, 422, 'The sheet has headings but no rows to load.');

  const ctx = await ctxOf(req);
  const { rows, summary } = await Engine.preview(def, ctx, parsed.rows);
  await audit(req, { action: 'dataio.preview', entityType: 'Import', entityId: def.key, schoolId: sid(req), detail: { rows: summary.total, errors: summary.error } }).catch(() => {});
  res.json({
    module: Reg.head(def), rows, summary,
    fileName: String(req.file.originalname || '').slice(0, 120),
    sheetName: parsed.sheetName, unknown: parsed.unknown, truncated: parsed.truncated,
    batch: Engine.BATCH,
  });
});

/* ── write one batch ── */
exports.commit = wrap('commit', async (req, res) => {
  const def = await loadDef(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return bad(res, 400, 'Send the rows to add.');
  if (!rows.length) return res.json({ results: [], tally: { created: 0, updated: 0, skipped: 0, failed: 0 } });
  if (rows.length > Engine.BATCH) return bad(res, 400, `Send at most ${Engine.BATCH} rows at a time.`);

  const ctx = await ctxOf(req);
  const out = await Engine.commit(def, ctx, rows, { updateExisting: !!req.body?.updateExisting });
  await audit(req, { action: 'dataio.commit', entityType: 'Import', entityId: def.key, schoolId: sid(req), detail: out.tally }).catch(() => {});
  res.json(out);
});

/* ── what is already here, as a sheet ── */
exports.export = wrap('export', async (req, res) => {
  const def = await loadDef(req);
  const rowsOut = await listFor(def, sid(req));
  const school = await School.findById(sid(req)).select('name code');
  const wb = WB.templateBook(def, { school, sample: false });
  const ws = wb.worksheets[0];
  for (const r of rowsOut) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  await audit(req, { action: 'dataio.export', entityType: 'Import', entityId: def.key, schoolId: sid(req), detail: { rows: rowsOut.length } }).catch(() => {});
  res
    .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('Content-Disposition', `attachment; filename="aulensia-${def.key}-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    .set('Cache-Control', 'private, no-store')
    .send(Buffer.from(buf));
});

// What a module's records look like as template rows. Kept here rather than in the registry so a
// module only has to describe how data comes in; going out is the same shape by definition.
const EXPORT_MAX = 5000;
async function listFor(def, schoolId) {
  const M = Reg.M;
  const take = (docs, map) => docs.slice(0, EXPORT_MAX).map(map);
  switch (def.key) {
    case 'students': {
      const [rows, classes] = await Promise.all([
        M.Student.find({ schoolId, isActive: { $ne: false } }).limit(EXPORT_MAX),
        M.Class.find({ schoolId }).select('standard division'),
      ]);
      const byId = new Map(classes.map((c) => [String(c._id), c]));
      return take(rows, (s) => ({
        name: s.name, admissionNumber: s.admissionNumber || '', className: byId.get(String(s.classId))?.standard || '',
        division: byId.get(String(s.classId))?.division || '', rollNumber: s.rollNumber || '', gender: s.gender || '',
        dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().slice(0, 10) : '', bloodGroup: s.bloodGroup || '',
        email: /\.local$/.test(s.email || '') ? '' : (s.email || ''), mobileNumber: s.mobileNumber || '', address: s.currentAddress || '',
        guardianName: s.guardian?.name || '', guardianRelationship: s.guardian?.relationship || '', guardianPhone: s.guardian?.mobileNumber || '',
        guardianEmail: s.father?.email || s.mother?.email || '', previousSchool: s.previousSchool || '',
        admissionDate: s.admissionDate ? new Date(s.admissionDate).toISOString().slice(0, 10) : '',
      }));
    }
    case 'teachers':
      return take(await M.Teacher.find({ schoolId }).limit(EXPORT_MAX), (t) => ({
        name: t.name, email: t.email, employeeId: t.employeeId || '', phone: t.phone || '', gender: t.gender || '',
        dateOfBirth: t.dateOfBirth ? new Date(t.dateOfBirth).toISOString().slice(0, 10) : '', cnicNumber: t.cnicNumber || '',
        designation: t.designation || '', department: t.department || '',
        joiningDate: t.joiningDate ? new Date(t.joiningDate).toISOString().slice(0, 10) : '',
        qualification: (t.qualifications || [])[0]?.degree || '', experience: t.experience || 0,
        subjects: '', basicSalary: t.salaryDetails?.basicSalary || 0, currentAddress: t.currentAddress || '',
      }));
    case 'staff':
      return take(await M.Employee.find({ schoolId }).limit(EXPORT_MAX), (e) => ({
        code: e.code, name: e.name, kind: e.kind, department: e.department || '', phone: e.phone || '', email: e.email || '',
        joinDate: e.joinDate ? new Date(e.joinDate).toISOString().slice(0, 10) : '', status: e.status, basicSalary: e.basicSalary || 0,
      }));
    case 'guardians': {
      const rows = await M.Parent.find({ schoolId }).limit(EXPORT_MAX);
      const kids = await M.Student.find({ schoolId }).select('admissionNumber');
      const adm = new Map(kids.map((k) => [String(k._id), k.admissionNumber || '']));
      return take(rows, (p) => ({ name: p.name, email: p.email, phone: p.phone || '', relationship: p.relationship || 'Guardian', children: (p.children || []).map((id) => adm.get(String(id))).filter(Boolean).join(', ') }));
    }
    case 'classes': {
      const [rows, teachers, camps] = await Promise.all([
        M.Class.find({ schoolId }).limit(EXPORT_MAX),
        M.Teacher.find({ schoolId }).select('email'),
        M.Campus.find({ schoolId }).select('name'),
      ]);
      const te = new Map(teachers.map((t) => [String(t._id), t.email]));
      const cp = new Map(camps.map((x) => [String(x._id), x.name]));
      return take(rows, (c) => ({ standard: c.standard, division: c.division, capacity: c.capacity || '', room: c.room || '', classTeacherEmail: te.get(String(c.classTeacherId)) || '', campus: cp.get(String(c.campusId)) || '', academicYear: c.academicYear || '' }));
    }
    case 'subjects':
      return take(await M.Subject.find({ schoolId }).limit(EXPORT_MAX), (s) => ({ code: s.code, name: s.name, standard: s.standard || '', maxMarks: s.maxMarks, minMarks: s.minMarks, defaultWeeklyLectures: s.defaultWeeklyLectures, description: s.description || '' }));
    case 'rooms':
      return take(await M.Room.find({ schoolId }).limit(EXPORT_MAX), (r) => ({ name: r.name, kind: r.kind, capacity: r.capacity, notes: r.notes || '' }));
    case 'campuses':
      return take(await M.Campus.find({ schoolId }).limit(EXPORT_MAX), (c) => ({ code: c.code, name: c.name, address: c.address || '', phone: c.phone || '' }));
    case 'fee-structures':
      return take(await M.FeeStructure.find({ schoolId }).limit(EXPORT_MAX), (f) => ({ standard: f.standard, totalAmount: f.totalAmount, totalInstallments: f.totalInstallments, totalMonths: f.totalMonths, admissionFee: f.admissionFee || 0, academicYear: f.academicYear || '' }));
    case 'library-titles':
      return take(await M.LbTitle.find({ schoolId }).limit(EXPORT_MAX), (t) => ({ isbn: t.isbn || '', title: t.title, authors: (t.authors || []).join(', '), publisher: t.publisher || '', year: t.year || '', kind: t.kind, language: t.language || '', shelf: t.shelf || '', price: t.price || 0 }));
    case 'library-copies': {
      const rows = await M.LbCopy.find({ schoolId }).limit(EXPORT_MAX);
      const titles = await M.LbTitle.find({ schoolId }).select('isbn');
      const isbn = new Map(titles.map((t) => [String(t._id), t.isbn || '']));
      return take(rows, (c) => ({ barcode: c.barcode, isbn: isbn.get(String(c.titleId)) || '', condition: c.condition, shelf: c.shelf || '', acquiredOn: c.acquiredOn ? new Date(c.acquiredOn).toISOString().slice(0, 10) : '', price: c.price || 0 }));
    }
    case 'transport-routes':
      return take(await M.TransportRoute.find({ schoolId }).limit(EXPORT_MAX), (r) => ({ name: r.name, monthlyFee: r.monthlyFee, vehicle: r.vehicle || '', driverName: r.driverName || '', driverPhone: r.driverPhone || '', notes: r.notes || '' }));
    case 'store-items':
      return take(await M.StSku.find({ schoolId }).limit(EXPORT_MAX), (s) => ({ sku: s.sku, name: s.name, category: s.category, variant: s.variant || '', price: s.price, cost: s.cost || 0, onHand: s.onHand || 0, reorderLevel: s.reorderLevel || 0, barcode: s.barcode || '' }));
    case 'vendors':
      return take(await M.PcVendor.find({ schoolId }).limit(EXPORT_MAX), (v) => ({ name: v.name, taxNo: v.taxNo || '', contact: v.contact || '', phone: v.phone || '', email: v.email || '', address: v.address || '', categories: (v.categories || []).join(', ') }));
    default:
      return [];
  }
}

/* ────────────────────────── the whole school in one workbook ──────────────────────────
   One file with a sheet per part of the school, read in the order the parts depend on each other.
   The writing itself goes back through the per-module endpoints, sheet by sheet, so a big file is
   written in small pieces and the server never holds the whole thing.                          */

const Whole = require('../utils/dataio/wholeSystem');

exports.wholeTemplate = wrap('wholeTemplate', async (req, res) => {
  const ok = await allowed(sid(req));
  const school = await School.findById(sid(req)).select('name code');
  const wb = await Whole.templateBook(ok, { school });
  const buf = await wb.xlsx.writeBuffer();
  res
    .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('Content-Disposition', 'attachment; filename="aulensia-whole-school-template.xlsx"')
    .set('Cache-Control', 'private, no-store')
    .send(Buffer.from(buf));
});

exports.wholePlan = wrap('wholePlan', async (req, res) => {
  const ok = await allowed(sid(req));
  res.json({
    steps: Whole.steps(ok).map((d) => Reg.head(d)),
    limits: { maxRows: WB.MAX_ROWS, maxBytes: WB.MAX_BYTES, batch: Engine.BATCH },
  });
});

exports.wholePreview = wrap('wholePreview', async (req, res) => {
  if (!req.file || !req.file.buffer) return bad(res, 400, 'Attach the filled-in workbook.');
  const ok = await allowed(sid(req));
  const ctx = await ctxOf(req);
  let out;
  try {
    out = await Whole.preview(req.file.buffer, ctx, ok);
  } finally {
    req.file.buffer = null;   // the file never outlives the request
  }
  const used = out.sheets.filter((s) => s.summary.total);
  if (!used.length) return bad(res, 422, 'None of the sheets in this workbook had rows we could read. Start from the whole-school template.');
  await audit(req, { action: 'dataio.whole.preview', entityType: 'Import', entityId: 'whole-school', schoolId: sid(req), detail: out.totals }).catch(() => {});
  res.json({
    sheets: out.sheets, totals: out.totals, batch: Engine.BATCH,
    fileName: String(req.file.originalname || '').slice(0, 120),
  });
});

exports._listFor = listFor;
