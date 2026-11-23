// Reading a cell the way a school secretary would write it: "12/03/2015", "f", "yes", "Grade 5".
// Every parser returns { v } when it understood the cell, { empty: true } when the cell is blank,
// or { error } with words a person can act on.

const clean = (v, n = 300) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .trim()
  .slice(0, n);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const phoneKey = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const stdKey = (s) => String(s || '').toLowerCase().replace(/\b(grade|class|std|standard)\b/g, '').replace(/[^a-z0-9]/g, '');
const divKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const text = (raw, col) => {
  const t = clean(raw, col.max || 300);
  if (!t) return { empty: true };
  if (/[<>]/.test(t)) return { error: 'Plain text only: no < or >' };
  if (col.min && t.length < col.min) return { error: `At least ${col.min} characters` };
  return { v: t };
};

const email = (raw) => {
  const t = clean(raw, 160).toLowerCase();
  if (!t) return { empty: true };
  if (!EMAIL.test(t)) return { error: 'This is not an email address' };
  return { v: t };
};

const phone = (raw) => {
  const t = clean(raw, 32);
  if (!t) return { empty: true };
  const digits = t.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return { error: 'A phone number has 7 to 15 digits' };
  return { v: t };
};

const number = (raw, col = {}) => {
  const t = clean(raw, 32).replace(/[, ]/g, '');
  if (!t) return { empty: true };
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: 'This should be a number' };
  if (col.integer && !Number.isInteger(n)) return { error: 'This should be a whole number' };
  if (col.minValue != null && n < col.minValue) return { error: `This cannot be less than ${col.minValue}` };
  if (col.maxValue != null && n > col.maxValue) return { error: `This cannot be more than ${col.maxValue}` };
  return { v: n };
};

const bool = (raw) => {
  const t = clean(raw, 12).toLowerCase();
  if (!t) return { empty: true };
  if (['yes', 'y', 'true', '1', 'haan', 'ہاں'].includes(t)) return { v: true };
  if (['no', 'n', 'false', '0', 'nahi', 'نہیں'].includes(t)) return { v: false };
  return { error: 'Write Yes or No' };
};

// Dates: a real date from Excel, or text in the orders Pakistani schools use.
const date = (raw, col = {}) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const d = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
    return future(d, col);
  }
  const t = clean(raw, 30);
  if (!t) return { empty: true };
  let y; let m; let d; let x;
  if ((x = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; }
  else return { error: 'Not a date (use YYYY-MM-DD, for example 2015-03-12)' };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { error: 'Not a real date' };
  return future(dt, col);
};
const future = (dt, col) => {
  if (col.noFuture && dt > new Date()) return { error: 'This date is in the future' };
  if (col.noPast && dt < new Date(Date.now() - 86400000)) return { error: 'This date is in the past' };
  return { v: dt };
};

const gender = (raw) => {
  const t = clean(raw, 20).toLowerCase();
  if (!t) return { empty: true };
  if (['m', 'male', 'boy', 'b', 'مرد', 'لڑکا'].includes(t)) return { v: 'Male' };
  if (['f', 'female', 'girl', 'g', 'عورت', 'لڑکی'].includes(t)) return { v: 'Female' };
  if (['o', 'other', 'x'].includes(t)) return { v: 'Other' };
  return { error: 'Write Male, Female or Other' };
};

// One of a fixed list. The sheet offers these as a dropdown, but a typed value is matched
// case-insensitively so a file from another system still loads.
const choice = (raw, col) => {
  const t = clean(raw, 60);
  if (!t) return { empty: true };
  const hit = (col.enum || []).find((o) => String(o).toLowerCase() === t.toLowerCase());
  if (!hit) return { error: `Write one of: ${(col.enum || []).join(', ')}` };
  return { v: hit };
};

const list = (raw, col = {}) => {
  const t = clean(raw, col.max || 500);
  if (!t) return { empty: true };
  const parts = [...new Set(t.split(/[,;|]/).map((x) => x.trim()).filter(Boolean))];
  if (!parts.length) return { empty: true };
  if (col.maxItems && parts.length > col.maxItems) return { error: `Up to ${col.maxItems} entries` };
  return { v: parts };
};

const PARSERS = { text, email, phone, number, bool, date, gender, choice, list };

// A whole row of cells → values, errors and warnings, using the module's column list.
const parseRow = (raw, columns) => {
  const value = {}; const errors = []; const warnings = [];
  for (const col of columns) {
    const fn = PARSERS[col.type || 'text'] || text;
    const cell = raw[col.key];
    const out = fn(cell, col);
    if (out.error) { errors.push(`${col.label}: ${out.error}`); continue; }
    if (out.empty || out.v === undefined) {
      if (col.required) errors.push(`${col.label} is needed`);
      else if (col.default !== undefined) value[col.key] = col.default;
      continue;
    }
    value[col.key] = out.v;
  }
  return { value, errors, warnings };
};

module.exports = { clean, EMAIL, nameKey, phoneKey, stdKey, divKey, codeKey, PARSERS, parseRow };
