// Pure rules for the library and the school store (PRD E18): barcodes that can be checked, ISBNs, the fine and fee rules, due dates and catalogue import.
// Nothing here touches the database, so every rule can be tested on its own.
const crypto = require('crypto');

const sha = (b) => crypto.createHash('sha256').update(String(b)).digest('hex');

/* ───────── barcodes ───────── */
// A barcode is a prefix, seven digits and a check digit (Luhn over the seven digits). A scan that was misread fails the check instead of finding a wrong copy.
const luhn = (digits) => { let sum = 0; [...String(digits)].reverse().forEach((c, i) => { let d = Number(c); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } sum += d; }); return (10 - (sum % 10)) % 10; };
const PREFIX = { copy: 'BK', card: 'LC', sku: 'ST' };
const makeBarcode = (kind, n) => { const body = String(n).padStart(7, '0'); if (body.length > 7) throw new Error('barcode number too large'); return `${PREFIX[kind]}${body}${luhn(body)}`; };
// -> { ok, kind } or { ok:false, reason }
function readBarcode(raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase();
  const m = /^(BK|LC|ST)(\d{7})(\d)$/.exec(s);
  if (!m) return { ok: false, reason: 'format' };
  if (luhn(m[2]) !== Number(m[3])) return { ok: false, reason: 'check' };
  return { ok: true, code: s, kind: Object.keys(PREFIX).find((k) => PREFIX[k] === m[1]) };
}

/* ───────── ISBN ───────── */
function isbn13Check(d12) { let s = 0; [...d12].forEach((c, i) => { s += Number(c) * (i % 2 === 0 ? 1 : 3); }); return (10 - (s % 10)) % 10; }
function normalizeIsbn(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\s-]/g, '').toUpperCase();
  if (!s) return { ok: true, isbn: '' };
  if (/^\d{13}$/.test(s)) { if (!/^97[89]/.test(s)) return { ok: false, error: 'An ISBN-13 starts with 978 or 979.' }; if (isbn13Check(s.slice(0, 12)) !== Number(s[12])) return { ok: false, error: 'The last digit of this ISBN does not match the others. Check it again.' }; return { ok: true, isbn: s }; }
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0; for (let i = 0; i < 9; i += 1) sum += (10 - i) * Number(s[i]); sum += s[9] === 'X' ? 10 : Number(s[9]);
    if (sum % 11 !== 0) return { ok: false, error: 'The last digit of this ISBN does not match the others. Check it again.' };
    const d12 = `978${s.slice(0, 9)}`; return { ok: true, isbn: `${d12}${isbn13Check(d12)}` };
  }
  return { ok: false, error: 'An ISBN has 10 or 13 digits.' };
}

/* ───────── days ───────── */
const DAY = 86400000;
const keyOf = (d) => new Date(d).toISOString().slice(0, 10);
const dayNum = (keyOrDate) => Math.floor(Date.parse(`${typeof keyOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(keyOrDate) ? keyOrDate : keyOf(keyOrDate)}T00:00:00Z`) / DAY);
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY);
const daysBetween = (fromKey, toKey) => dayNum(toKey) - dayNum(fromKey);

/* ───────── the library policy ───────── */
const POLICY_DEFAULTS = {
  loanDays: { student: 14, teacher: 30, staff: 30 }, maxLoans: { student: 3, teacher: 8, staff: 5 }, maxRenewals: 2,
  graceDays: 1, finePerDay: 5, fineCap: 500, blockAtFines: 200, blockWhenOverdue: true,
  holdDays: 3, reminderDaysBefore: 2,
  lostPercent: 100, lostProcessingFee: 100, lostDefaultPrice: 500, damagePercent: { minor: 25, major: 60, destroyed: 100 },
};
const mergePolicy = (v) => ({ ...POLICY_DEFAULTS, ...(v || {}), loanDays: { ...POLICY_DEFAULTS.loanDays, ...((v || {}).loanDays || {}) }, maxLoans: { ...POLICY_DEFAULTS.maxLoans, ...((v || {}).maxLoans || {}) }, damagePercent: { ...POLICY_DEFAULTS.damagePercent, ...((v || {}).damagePercent || {}) } });
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
// Checks a proposed policy; returns the clean policy or { error }.
function cleanPolicy(p) {
  const m = mergePolicy(p); const out = { ...m, loanDays: {}, maxLoans: {}, damagePercent: {} };
  for (const k of ['student', 'teacher', 'staff']) {
    const d = num(m.loanDays[k], 1, 365); const l = num(m.maxLoans[k], 1, 100); if (d === null) return { error: `Loan days for ${k} must be between 1 and 365.` }; if (l === null) return { error: `Books at once for ${k} must be between 1 and 100.` };
    out.loanDays[k] = Math.round(d); out.maxLoans[k] = Math.round(l);
  }
  for (const [k, lo, hi, label] of [['maxRenewals', 0, 10, 'Renewals'], ['graceDays', 0, 30, 'Grace days'], ['finePerDay', 0, 10000, 'Fine per day'], ['fineCap', 0, 1000000, 'Fine cap'], ['blockAtFines', 0, 1000000, 'Block at unpaid fines'], ['holdDays', 1, 30, 'Days a reserved book is held'], ['reminderDaysBefore', 0, 14, 'Reminder days'], ['lostPercent', 0, 300, 'Lost item percent'], ['lostProcessingFee', 0, 100000, 'Lost item processing fee'], ['lostDefaultPrice', 0, 1000000, 'Price when unknown']]) {
    const n = num(m[k], lo, hi); if (n === null) return { error: `${label} must be between ${lo} and ${hi}.` }; out[k] = n;
  }
  for (const k of ['minor', 'major', 'destroyed']) { const n = num(m.damagePercent[k], 0, 300); if (n === null) return { error: `Damage percent (${k}) must be between 0 and 300.` }; out.damagePercent[k] = n; }
  if (!(out.damagePercent.minor <= out.damagePercent.major && out.damagePercent.major <= out.damagePercent.destroyed)) return { error: 'Damage charges must grow from minor to major to destroyed.' };
  if (out.finePerDay > 0 && out.fineCap < out.finePerDay) return { error: 'The fine cap cannot be less than the fine for one day.' };
  out.blockWhenOverdue = m.blockWhenOverdue !== false && m.blockWhenOverdue !== 'false';
  return { policy: out };
}
// The late fine: whole days after the due date and the grace days, times the daily rate, never above the cap. Same inputs, same answer.
function lateFine(policy, dueKey, returnedKey) {
  const late = daysBetween(dueKey, returnedKey) - policy.graceDays; if (late <= 0 || !(policy.finePerDay > 0)) return { amount: 0, days: Math.max(0, late) };
  const raw = late * policy.finePerDay; const amount = Math.min(raw, policy.fineCap);
  return { amount: Math.round(amount), days: late, capped: raw > policy.fineCap };
}
const lostFee = (policy, price) => { const base = Number(price) > 0 ? Number(price) : policy.lostDefaultPrice; return Math.round(base * policy.lostPercent / 100) + policy.lostProcessingFee; };
const damageFee = (policy, level, price) => { const pct = policy.damagePercent[level]; if (pct === undefined) return null; const base = Number(price) > 0 ? Number(price) : policy.lostDefaultPrice; return Math.round(base * pct / 100); };

/* ───────── catalogue import ───────── */
const FIELDS = ['title', 'subtitle', 'authors', 'publisher', 'year', 'edition', 'language', 'subjects', 'shelf', 'kind', 'price', 'summary'];
const listOf = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[;|]/)).map((x) => String(x).trim()).filter(Boolean);
function cleanRow(r) {
  const o = {}; const t = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  o.title = t(r.title, 300); o.subtitle = t(r.subtitle, 300); o.authors = listOf(r.authors).slice(0, 8).map((x) => x.slice(0, 120)); o.publisher = t(r.publisher, 160);
  o.year = r.year === '' || r.year == null ? null : (Number.isInteger(Number(r.year)) && Number(r.year) >= 1400 && Number(r.year) <= 2100 ? Number(r.year) : NaN);
  o.edition = t(r.edition, 60); o.language = t(r.language, 40) || 'English'; o.subjects = listOf(r.subjects).slice(0, 8).map((x) => x.slice(0, 60)); o.shelf = t(r.shelf, 40);
  o.kind = ['book', 'textbook', 'reference', 'periodical', 'other'].includes(String(r.kind || '').toLowerCase()) ? String(r.kind).toLowerCase() : 'book';
  o.price = r.price === '' || r.price == null ? 0 : (Number.isFinite(Number(r.price)) && Number(r.price) >= 0 ? Math.round(Number(r.price)) : NaN); o.summary = t(r.summary, 1000);
  return o;
}
// rows: raw rows; existing: Map isbn -> title doc. Each row becomes add | update | same | conflict-free duplicates in the file are held | problem.
function classifyImport(rows, existing) {
  const seen = new Map(); const out = [];
  rows.forEach((raw, i) => {
    const row = cleanRow(raw); const copies = Math.min(50, Math.max(0, parseInt(raw.copies, 10) || 0)); const problems = [];
    const isbn = normalizeIsbn(raw.isbn); if (!isbn.ok) problems.push(isbn.error);
    if (!row.title) problems.push('A title is needed.'); if (Number.isNaN(row.year)) problems.push('The year is not a year.'); if (Number.isNaN(row.price)) problems.push('The price is not a number.');
    if (problems.length) return out.push({ index: i, state: 'problem', problems, row, isbn: isbn.isbn || '', copies });
    const key = isbn.isbn || '';
    if (key && seen.has(key)) return out.push({ index: i, state: 'duplicate', problems: [`Same ISBN as row ${seen.get(key) + 1} in this file.`], row, isbn: key, copies });
    if (key) seen.set(key, i);
    const ex = key ? existing.get(key) : null;
    if (!ex) return out.push({ index: i, state: 'add', row, isbn: key, copies });
    const diffs = FIELDS.filter((f) => JSON.stringify(f === 'authors' || f === 'subjects' ? (ex[f] || []) : (ex[f] ?? '')) !== JSON.stringify(row[f] ?? '')).filter((f) => !(row[f] === '' || row[f] == null || (Array.isArray(row[f]) && !row[f].length) || (f === 'price' && !row.price) || (f === 'language' && !raw.language)))
      .map((f) => ({ field: f, current: ex[f], incoming: row[f] }));
    out.push({ index: i, state: diffs.length ? 'conflict' : 'same', diffs, row, isbn: key, copies, titleId: String(ex._id), titleName: ex.title });
  });
  return out;
}

module.exports = { sha, luhn, makeBarcode, readBarcode, normalizeIsbn, keyOf, dayNum, addDays, daysBetween, POLICY_DEFAULTS, mergePolicy, cleanPolicy, lateFine, lostFee, damageFee, cleanRow, classifyImport, FIELDS };
