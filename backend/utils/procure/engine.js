// The rules of procurement, assets and facilities (PRD E19), with no database in them so they can be tested on their own.
const L = require('../library/engine');
const { luhn, dayNum, addDays, daysBetween } = L;

const DEFAULTS = {
  costCentres: ['General', 'Academic', 'Facilities', 'Administration', 'Sports'],
  categories: ['Stationery', 'Furniture', 'IT equipment', 'Lab equipment', 'Books', 'Repairs and maintenance', 'Utilities', 'Construction', 'Cleaning', 'Sports', 'Services', 'Other'],
  assetCategories: { furniture: 10, it: 4, lab: 8, vehicle: 8, building: 30, sports: 5, other: 5 },
  singleApprovalLimit: 100000, quoteThreshold: 50000, minQuotes: 3, tolerancePercent: 2, capitalizationThreshold: 25000, fiscalYearStartMonth: 7,
};
const merge = (v = {}) => ({ ...DEFAULTS, ...v, assetCategories: { ...DEFAULTS.assetCategories, ...(v.assetCategories || {}) } });
const list = (a, max, len = 60) => [...new Set((Array.isArray(a) ? a : String(a || '').split(',')).map((x) => String(x).trim().slice(0, len)).filter(Boolean))].slice(0, max);
function cleanSettings(raw = {}) {
  const n = (v, lo, hi, name) => { const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) return { error: `${name} must be between ${lo} and ${hi}.` }; return { v: x }; };
  const out = {};
  for (const [k, lo, hi, name] of [['singleApprovalLimit', 0, 1e9, 'The one-approver limit'], ['quoteThreshold', 0, 1e9, 'The quotes threshold'], ['minQuotes', 1, 5, 'The number of quotes'], ['tolerancePercent', 0, 20, 'The tolerance'], ['capitalizationThreshold', 0, 1e9, 'The asset threshold'], ['fiscalYearStartMonth', 1, 12, 'The first month of the year']]) {
    if (raw[k] === undefined) continue; const r = n(raw[k], lo, hi, name); if (r.error) return r; out[k] = Math.round(r.v * (k === 'tolerancePercent' ? 10 : 1)) / (k === 'tolerancePercent' ? 10 : 1);
  }
  if (raw.costCentres !== undefined) { out.costCentres = list(raw.costCentres, 30); if (!out.costCentres.length) return { error: 'Keep at least one cost centre.' }; }
  if (raw.categories !== undefined) { out.categories = list(raw.categories, 60); if (!out.categories.length) return { error: 'Keep at least one spending category.' }; }
  if (raw.assetCategories !== undefined) {
    const ac = {}; for (const [k, v] of Object.entries(raw.assetCategories || {})) { const key = String(k).trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30); const y = Number(v); if (!key) continue; if (!(y >= 0 && y <= 100)) return { error: `The life of ${key} must be 0 to 100 years.` }; ac[key] = y; }
    if (!Object.keys(ac).length) return { error: 'Keep at least one asset kind.' }; out.assetCategories = ac;
  }
  return { settings: out };
}

/* ── the budget year ── */
function fiscalYear(day, startMonth = 7) {
  const [y, m] = String(day).split('-').map(Number); if (!y || !m) return '';
  if (startMonth === 1) return String(y);
  const s = m >= startMonth ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
}
const yearRange = (label, startMonth = 7) => {
  const s = Number(String(label).slice(0, 4)); if (!s) return null; const pad = (m) => String(m).padStart(2, '0');
  if (startMonth === 1) return { from: `${s}-01-01`, to: `${s}-12-31` };
  const endM = startMonth - 1; return { from: `${s}-${pad(startMonth)}-01`, to: `${s + 1}-${pad(endM)}-${new Date(Date.UTC(s + 1, endM, 0)).getUTCDate()}` };
};

/* ── approval, quotes and matching ── */
const levelsFor = (total, s) => (total > s.singleApprovalLimit ? 2 : 1);
function quoteRule(total, quotes, s) { const need = total >= s.quoteThreshold ? s.minQuotes : 0; const have = (quotes || []).length; return { need, have, ok: have >= need }; }
const tolerance = (amount, s) => Math.round((Number(amount) || 0) * (s.tolerancePercent || 0) / 100);
// A bill is compared with the order and with what has actually arrived (PRD CAP-0409).
function matchInvoice({ amount, orderTotal, invoicedBefore = 0, receivedValue = 0 }, s) {
  const tol = tolerance(orderTotal, s); const orderBalance = orderTotal + tol - invoicedBefore;
  if (amount > orderBalance) return { match: 'over', orderBalance, tol, note: `The bill is more than the order allows (${orderBalance} left including the ${s.tolerancePercent}% tolerance).` };
  const billable = receivedValue - invoicedBefore; if (amount <= billable) return { match: 'matched', orderBalance, tol, note: '' };
  if (amount <= billable + tol) return { match: 'within_tolerance', orderBalance, tol, note: `${amount - billable} more than what has arrived, inside the ${s.tolerancePercent}% tolerance.` };
  return { match: 'exception', orderBalance, tol, note: `The bill is ${amount - Math.max(0, billable)} more than the goods or services received so far.` };
}

/* ── assets ── */
const PREFIX = 'AS';
const makeTag = (n) => { const body = String(n).padStart(7, '0'); if (body.length > 7) throw new Error('tag number too large'); return `${PREFIX}${body}${luhn(body)}`; };
function readTag(raw) {
  const m = /^AS(\d{7})(\d)$/.exec(String(raw || '').trim().toUpperCase()); if (!m) return { ok: false, reason: 'format' };
  if (luhn(m[1]) !== Number(m[2])) return { ok: false, reason: 'check' }; return { ok: true, code: `AS${m[1]}${m[2]}` };
}
const wholeMonths = (from, to) => { const [y1, m1, d1] = from.split('-').map(Number); const [y2, m2, d2] = to.split('-').map(Number); return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)); };
function depreciation(a, asOf) {
  const cost = a.cost || 0; const base = Math.max(0, cost - (a.salvage || 0)); const life = a.usefulLifeYears || 0;
  const end = a.status === 'disposed' && a.disposal?.on && a.disposal.on < asOf ? a.disposal.on : asOf;
  if (!a.capitalizedOn || end < a.capitalizedOn || life <= 0) return { months: 0, accumulated: 0, book: cost, monthly: 0 };
  const months = wholeMonths(a.capitalizedOn, end); const accumulated = Math.min(base, Math.round(base * months / (life * 12)));
  return { months, accumulated, book: cost - accumulated, monthly: Math.round(base / (life * 12)) };
}

/* ── recurring costs ── */
function monthAdd(day, n) { const [y, m, d] = day.split('-').map(Number); const t = (y * 12 + (m - 1)) + n; const yy = Math.floor(t / 12); const mm = (t % 12) + 1; const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; }
const STEP = { monthly: 1, quarterly: 3, yearly: 12 };
function occurrences(c, from, to) {
  const step = STEP[c.frequency] || 1; const out = []; for (let i = 0; i < 600; i += 1) { const on = monthAdd(c.startOn, i * step); if (on > to) break; if (c.endOn && on > c.endOn) break; if (on >= from) out.push({ on, amount: c.amount }); } return out;
}

module.exports = { DEFAULTS, merge, cleanSettings, fiscalYear, yearRange, levelsFor, quoteRule, tolerance, matchInvoice, makeTag, readTag, wholeMonths, depreciation, monthAdd, occurrences, dayNum, addDays, daysBetween };
