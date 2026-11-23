// One workbook that sets up a whole school: branches, classes, subjects, teachers, staff and
// guards, children and their guardians, fees, library, transport and the store.
//
// The order matters and is not left to the person filling it in: a class needs its branch, a child
// needs a class, a guardian needs a child. The sheets are always read in that order, so a school
// can hand over one file and have the lot come in standing up.

const Reg = require('./modules');
const WB = require('./workbook');
const Engine = require('./engine');

// Dependency order. Each step names the module it fills; a step may only need what earlier steps made.
const ORDER = [
  { key: 'campuses', needs: [] },
  { key: 'subjects', needs: [] },
  { key: 'rooms', needs: [] },
  { key: 'teachers', needs: [] },
  { key: 'staff', needs: [] },
  { key: 'classes', needs: ['teachers', 'campuses'] },
  { key: 'fee-structures', needs: ['classes'] },
  { key: 'students', needs: ['classes'] },
  { key: 'guardians', needs: ['students'] },
  { key: 'transport-routes', needs: [] },
  { key: 'library-titles', needs: [] },
  { key: 'library-copies', needs: ['library-titles'] },
  { key: 'store-items', needs: [] },
  { key: 'vendors', needs: [] },
];

const steps = (allow) => ORDER.map((s) => Reg.get(s.key)).filter(Boolean).filter((d) => !allow || allow(d));

// The blank workbook: one sheet per step, in the order they are read, plus a front page.
const templateBook = async (allow, { school } = {}) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aulensia';
  wb.created = new Date();

  const front = wb.addWorksheet('Start here');
  front.columns = [{ header: 'Order', key: 'o', width: 8 }, { header: 'Sheet', key: 's', width: 24 }, { header: 'What goes on it', key: 'n', width: 76 }];
  front.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  front.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2837' } };
  front.addRow({ o: '', s: school ? `${school.name} (${school.code})` : 'Your school', n: 'Fill in the sheets you have. A sheet you leave empty is simply skipped.' }).font = { bold: true };
  front.addRow({ o: '', s: '', n: 'The sheets are read from the top down, because a class needs its branch, a child needs a class and a guardian needs a child. Fill them in that order and everything links up.' });
  front.addRow({ o: '', s: '', n: `Up to ${WB.MAX_ROWS} rows on each sheet. Headings may be in any order, and columns of your own are ignored.` });
  front.addRow({});

  const list = steps(allow);
  list.forEach((def, i) => front.addRow({ o: i + 1, s: def.sheet || def.label, n: def.help || '' }));
  front.getColumn('n').alignment = { wrapText: true, vertical: 'top' };

  for (const def of list) {
    const one = WB.templateBook(def, { sample: true });
    const src = one.worksheets[0];
    const ws = wb.addWorksheet(def.sheet || def.label.slice(0, 28), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = def.columns.map((c) => ({ header: c.label, key: c.key, width: c.width || 18 }));
    src.eachRow((row, n) => {
      if (n === 1) return;
      ws.addRow(row.values.slice(1)).font = { color: { argb: 'FF8A94A6' }, italic: true };
    });
    const head = ws.getRow(1);
    head.height = 22;
    def.columns.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FF2A5CAC' : 'FF1B2837' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      if (c.note || c.required) cell.note = `${c.required ? 'Needed. ' : 'Optional. '}${c.note || ''}`.trim();
      if (c.enum && c.enum.join(',').length <= 250) {
        const letter = ws.getColumn(i + 1).letter;
        ws.dataValidations.add(`${letter}2:${letter}1000`, { type: 'list', allowBlank: !c.required, formulae: [`"${c.enum.join(',')}"`], showErrorMessage: true, errorTitle: c.label, error: `Choose one of: ${c.enum.join(', ')}` });
      }
    });
  }
  return wb;
};

// Read every sheet we know, in order. Sheets that are not in the file, or are empty, are skipped.
// The workbook is opened once, however many sheets it holds.
const read = async (buffer, allow) => {
  const wb = await WB.loadBook(buffer);
  const out = [];
  for (const def of steps(allow)) {
    let parsed = null;
    try {
      parsed = WB.sheetRows(wb, { columns: def.columns, sheet: def.sheet || def.label });
    } catch (e) {
      // a workbook that cannot be opened at all is the caller's problem, not one sheet's
      if (/workbook|no sheets/i.test(e.message)) throw e;
      out.push({ key: def.key, label: def.label, rows: [], missing: [], unknown: [], note: e.message });
      continue;
    }
    // readSheet falls back to the first filled sheet when the named one is absent; only take a
    // sheet whose name really is this step's, or the whole file would load as one module
    const named = WB.headerKey(parsed.sheetName) === WB.headerKey(def.sheet || def.label);
    if (!named) { out.push({ key: def.key, label: def.label, rows: [], missing: [], unknown: [], absent: true }); continue; }
    out.push({ key: def.key, label: def.label, rows: parsed.rows, missing: parsed.missing, unknown: parsed.unknown, truncated: parsed.truncated });
  }
  return out;
};

// What would happen, sheet by sheet. Nothing is written.
//
// The sheets are looked at in the order they will be written, and each one is told what the
// earlier sheets are going to create. Without that, the first import of a new school would show
// every child in red because its class is three sheets further up and not in the database yet.
const preview = async (buffer, ctx, allow) => {
  const sheets = await read(buffer, allow);
  const out = [];
  const pending = {};
  for (const sheet of sheets) {
    if (!sheet.rows.length) { out.push({ ...sheet, rows: [], summary: { total: 0, create: 0, update: 0, skip: 0, error: 0 } }); continue; }
    const def = Reg.get(sheet.key);
    if (sheet.missing.length) {
      out.push({ ...sheet, rows: [], summary: { total: sheet.rows.length, create: 0, update: 0, skip: 0, error: sheet.rows.length }, blocked: `These columns are needed and were not found: ${sheet.missing.join(', ')}` });
      continue;
    }
    const { rows, summary } = await Engine.preview(def, { ...ctx, pending }, sheet.rows);
    out.push({ ...sheet, rows, summary });

    // whatever this sheet will add is in place for the sheets below it
    const keyOf = Reg.PENDING_KEY[sheet.key];
    if (keyOf) {
      const set = pending[sheet.key] || new Set();
      for (const r of rows) {
        if (r.state !== 'create') continue;
        const parsed = require('./values').parseRow(r.raw, def.columns).value;
        const k = keyOf(parsed);
        if (k && k.replace(/\|/g, '')) set.add(k);
      }
      pending[sheet.key] = set;
    }
  }
  const totals = out.reduce((a, s) => ({
    total: a.total + s.summary.total, create: a.create + s.summary.create,
    update: a.update + s.summary.update, skip: a.skip + s.summary.skip, error: a.error + s.summary.error,
  }), { total: 0, create: 0, update: 0, skip: 0, error: 0 });
  return { sheets: out, totals };
};

module.exports = { ORDER, steps, templateBook, read, preview };
