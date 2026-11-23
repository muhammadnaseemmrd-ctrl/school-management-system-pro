// Reading an uploaded sheet and writing the blank template for it.
//
// Nothing is ever written to disk. The upload arrives as a buffer in memory (multer's memory
// storage), is turned into plain rows here, and the caller drops the buffer straight after. The
// row cap and the size cap keep one upload from taking the whole process down.

const ExcelJS = require('exceljs');
const { clean } = require('./values');

const MAX_ROWS = 2000;          // data rows accepted from one file
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_COLUMNS = 80;

const headerKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A cell as a plain value: Excel gives dates, formula results and rich text, we want text or Date.
const cellValue = (c) => {
  const v = c == null ? null : (c.value !== undefined ? c.value : c);
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.text !== undefined) return String(v.text);
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.result !== undefined) return v.result instanceof Date ? v.result : String(v.result);
    if (v.hyperlink && v.text) return String(v.text);
    if (v.error) return '';
    return '';
  }
  return v;
};

// Match the file's headings to the module's columns. A file that still has last year's headings,
// or headings in a different order, or extra columns of its own, still loads.
const mapHeaders = (headerRow, columns) => {
  const byKey = new Map();
  for (const col of columns) {
    byKey.set(headerKey(col.label), col.key);
    byKey.set(headerKey(col.key), col.key);
    for (const a of col.aliases || []) byKey.set(headerKey(a), col.key);
  }
  const mapped = []; const unknown = [];
  headerRow.forEach((h, i) => {
    const raw = clean(h, 80);
    if (!raw) { mapped[i] = null; return; }
    const key = byKey.get(headerKey(raw));
    if (key) mapped[i] = key; else { mapped[i] = null; unknown.push(raw); }
  });
  return { mapped, unknown };
};

// A workbook is opened once. A file with many sheets is read once too, not once per sheet.
const loadBook = async (buffer) => {
  if (!buffer || !buffer.length) throw Object.assign(new Error('The file is empty.'), { status: 400 });
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error(`The file is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Split it into a few smaller files.`), { status: 413 });
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) {
    throw Object.assign(new Error('This file could not be read as an Excel workbook. Save it as .xlsx and try again.'), { status: 400 });
  }
  return wb;
};

// workbook → { rows, unknown, missing }. The sheet is picked by name when the module names one,
// otherwise the first sheet with anything in it.
const sheetRows = (wb, { columns, sheet }) => {
  let ws = sheet ? wb.worksheets.find((w) => headerKey(w.name) === headerKey(sheet)) : null;
  if (!ws) ws = wb.worksheets.find((w) => w.actualRowCount > 1) || wb.worksheets[0];
  if (!ws) throw Object.assign(new Error('The workbook has no sheets.'), { status: 400 });

  // first row with text is the heading row (people often leave a title line above it)
  let headerIdx = 0; let headerRow = null;
  for (let i = 1; i <= Math.min(ws.rowCount, 10); i += 1) {
    const vals = (ws.getRow(i).values || []).slice(1, MAX_COLUMNS + 1).map((v) => clean(cellValue(v), 80));
    const filled = vals.filter(Boolean);
    if (filled.length >= 2) { headerIdx = i; headerRow = vals; break; }
  }
  if (!headerRow) throw Object.assign(new Error('No column headings were found. Start from the template.'), { status: 400 });

  const { mapped, unknown } = mapHeaders(headerRow, columns);
  const known = mapped.filter(Boolean);
  if (!known.length) throw Object.assign(new Error('None of the headings match this template. Download the template and fill that in.'), { status: 422 });
  const missing = columns.filter((c) => c.required && !known.includes(c.key)).map((c) => c.label);

  const rows = []; let truncated = false;
  for (let i = headerIdx + 1; i <= ws.rowCount; i += 1) {
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
    const r = ws.getRow(i);
    const vals = (r.values || []).slice(1, MAX_COLUMNS + 1);
    const data = {}; let any = false;
    mapped.forEach((key, idx) => {
      if (!key) return;
      const v = cellValue(vals[idx]);
      if (v instanceof Date) { data[key] = v; any = true; return; }
      const t = clean(v, 500);
      if (t) { data[key] = t; any = true; }
    });
    if (any) rows.push({ n: i, data });
  }
  return { rows, unknown: [...new Set(unknown)].slice(0, 20), missing, sheetName: ws.name, truncated };
};

// The common case: one file, one module.
const readSheet = async (buffer, opts) => sheetRows(await loadBook(buffer), opts);

// ── the blank template ──
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2837' } };
const REQ_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A5CAC' } };

const templateBook = (def, { school, sample = true } = {}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aulensia';
  wb.created = new Date();

  const ws = wb.addWorksheet(def.sheet || def.label.slice(0, 28), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = def.columns.map((c) => ({ header: c.label, key: c.key, width: c.width || Math.min(32, Math.max(12, c.label.length + 6)) }));

  const head = ws.getRow(1);
  head.height = 22;
  def.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = c.required ? REQ_FILL : HEAD_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    if (c.note || c.required) cell.note = `${c.required ? 'Needed. ' : 'Optional. '}${c.note || ''}`.trim();
  });

  if (sample) {
    const row = ws.addRow(Object.fromEntries(def.columns.map((c) => [c.key, c.example ?? ''])));
    row.font = { color: { argb: 'FF8A94A6' }, italic: true };
    row.getCell(1).note = 'This is an example row. Delete it before you upload, or leave it — a row that still says the example text is skipped.';
  }

  // dropdowns for the fixed lists, so people pick instead of typing
  def.columns.forEach((c, i) => {
    if (!c.enum || !c.enum.length) return;
    const joined = c.enum.join(',');
    if (joined.length > 250) return; // Excel's inline list limit
    const letter = ws.getColumn(i + 1).letter;
    ws.dataValidations.add(`${letter}2:${letter}1000`, {
      type: 'list', allowBlank: !c.required, formulae: [`"${joined}"`],
      showErrorMessage: true, errorTitle: c.label, error: `Choose one of: ${c.enum.join(', ')}`,
    });
  });

  // a second sheet explaining every column, so the file explains itself
  const notes = wb.addWorksheet('How to fill this in');
  notes.columns = [
    { header: 'Column', key: 'c', width: 26 },
    { header: 'Needed?', key: 'r', width: 10 },
    { header: 'What to write', key: 'n', width: 68 },
    { header: 'Example', key: 'e', width: 24 },
  ];
  notes.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  notes.getRow(1).fill = HEAD_FILL;
  notes.addRow({ c: def.label, r: '', n: def.help || '', e: '' }).font = { bold: true };
  notes.addRow({ c: '', r: '', n: `Up to ${MAX_ROWS} rows in one file. Headings may be in any order, and extra columns of your own are ignored.`, e: '' });
  notes.addRow({});
  def.columns.forEach((c) => {
    notes.addRow({
      c: c.label,
      r: c.required ? 'Yes' : 'No',
      n: [c.note, c.enum ? `One of: ${c.enum.join(', ')}` : '', c.type === 'date' ? 'A date, for example 2015-03-12' : ''].filter(Boolean).join(' '),
      e: c.example == null ? '' : String(c.example),
    });
  });
  notes.getColumn('n').alignment = { wrapText: true, vertical: 'top' };
  if (school) notes.addRow({}) && notes.addRow({ c: 'School', r: '', n: `${school.name} (${school.code})`, e: '' });

  return wb;
};

module.exports = { readSheet, loadBook, sheetRows, templateBook, MAX_ROWS, MAX_BYTES, cellValue, headerKey };
