// School general ledger rules (PRD E23). Pure functions: no database. Whole PKR everywhere.
const crypto = require('crypto');

const KINDS = ['asset', 'liability', 'net_assets', 'income', 'expense'];
const KIND_LABEL = { asset: 'Assets', liability: 'Liabilities', net_assets: 'Net assets', income: 'Income', expense: 'Expenses' };
const DEBIT_NORMAL = new Set(['asset', 'expense']);
const FUND_KINDS = new Set(['income', 'expense']);      // a fund may be named on these lines (and on fixed assets bought from a grant, see isCapex)
const MAX_AMOUNT = 1e12;
const MAX_LINES = 200;

// The starting chart for a school. Codes are the school's to change; the map below says which account each automatic posting uses.
const CHART = [
  ['1010', 'Cash in hand', 'asset', 'Current assets', { cash: true }],
  ['1020', 'Bank accounts and wallets', 'asset', 'Current assets', { bank: true, cash: true }],
  ['1200', 'Fee receivable', 'asset', 'Current assets', {}],
  ['1250', 'Staff advances', 'asset', 'Current assets', {}],
  ['1300', 'Prepayments and deposits', 'asset', 'Current assets', {}],
  ['1500', 'Furniture, equipment and buildings', 'asset', 'Fixed assets', {}],
  ['1590', 'Accumulated depreciation', 'asset', 'Fixed assets', {}],
  ['2100', 'Accounts payable (suppliers)', 'liability', 'Current liabilities', {}],
  ['2200', 'Fees received in advance', 'liability', 'Current liabilities', {}],
  ['2310', 'Salaries payable', 'liability', 'Current liabilities', {}],
  ['2320', 'Tax withheld payable', 'liability', 'Current liabilities', {}],
  ['2330', 'Other payroll deductions payable', 'liability', 'Current liabilities', {}],
  ['3000', 'Net assets (accumulated)', 'net_assets', 'Net assets', {}],
  ['4100', 'Tuition fees', 'income', 'Fee income', {}],
  ['4110', 'Other fees and charges', 'income', 'Fee income', {}],
  ['4190', 'Late fees', 'income', 'Fee income', {}],
  ['4300', 'School store sales', 'income', 'Other income', {}],
  ['4500', 'Grants and donations', 'income', 'Other income', {}],
  ['4900', 'Other income', 'income', 'Other income', {}],
  ['5100', 'Salaries and wages', 'expense', 'Staff costs', {}],
  ['5200', 'Supplies and materials', 'expense', 'Running costs', {}],
  ['5210', 'Repairs and maintenance', 'expense', 'Running costs', {}],
  ['5220', 'Utilities', 'expense', 'Running costs', {}],
  ['5230', 'Services', 'expense', 'Running costs', {}],
  ['5240', 'Books and learning resources', 'expense', 'Running costs', {}],
  ['5250', 'Sports and activities', 'expense', 'Running costs', {}],
  ['5400', 'Bad debts written off', 'expense', 'Other costs', {}],
  ['5600', 'Depreciation', 'expense', 'Other costs', {}],
  ['5800', 'Bank charges', 'expense', 'Other costs', {}],
  ['5900', 'Fee concessions and credit notes', 'expense', 'Other costs', {}],
];

const DEFAULTS = {
  fiscalStartMonth: 7,                // fiscal year starts in this month (1-12); July to June by default
  startDate: '',                      // the ledger starts here; nothing earlier is posted by the feeds (opening balances cover it)
  budgetControl: 'warn',              // off | warn | block (applies to manual journals; automatic postings are only flagged)
  requireReconciliation: false,       // a month cannot close until every bank account has a signed reconciliation
  map: {
    cash: '1010', bank: '1020', feeReceivable: '1200', staffAdvances: '1250', fixedAssets: '1500', ap: '2100', feeAdvance: '2200',
    salariesPayable: '2310', taxPayable: '2320', deductionsPayable: '2330', netAssets: '3000',
    incomeTuition: '4100', incomeOtherFees: '4110', incomeLate: '4190', incomeStore: '4300', incomeGrants: '4500',
    salaries: '5100', suppliesDefault: '5200', badDebt: '5400', concessions: '5900',
  },
  categoryMap: { Stationery: '5200', Cleaning: '5200', Other: '5200', 'Repairs and maintenance': '5210', Utilities: '5220', Services: '5230', Books: '5240', Sports: '5250' },
  capitalCategories: ['Furniture', 'IT equipment', 'Lab equipment', 'Construction'],
};
const MAP_KINDS = {
  cash: 'asset', bank: 'asset', feeReceivable: 'asset', staffAdvances: 'asset', fixedAssets: 'asset', ap: 'liability', feeAdvance: 'liability',
  salariesPayable: 'liability', taxPayable: 'liability', deductionsPayable: 'liability', netAssets: 'net_assets',
  incomeTuition: 'income', incomeOtherFees: 'income', incomeLate: 'income', incomeStore: 'income', incomeGrants: 'income',
  salaries: 'expense', suppliesDefault: 'expense', badDebt: 'expense', concessions: 'expense',
};
const MAP_LABEL = {
  cash: 'Cash in hand', bank: 'Bank and wallets', feeReceivable: 'Fee receivable', staffAdvances: 'Staff advances', fixedAssets: 'Fixed assets bought', ap: 'Suppliers owed', feeAdvance: 'Fees received in advance',
  salariesPayable: 'Net salaries owed', taxPayable: 'Tax withheld', deductionsPayable: 'Other payroll deductions', netAssets: 'Net assets',
  incomeTuition: 'Tuition fees', incomeOtherFees: 'Other fees', incomeLate: 'Late fees', incomeStore: 'Store sales', incomeGrants: 'Grants and donations',
  salaries: 'Salaries', suppliesDefault: 'Supplies (default for purchases)', badDebt: 'Bad debts', concessions: 'Fee concessions',
};

/* ───────── settings ───────── */
const merge = (raw = {}) => {
  const s = { ...DEFAULTS, ...raw, map: { ...DEFAULTS.map, ...(raw.map || {}) }, categoryMap: { ...DEFAULTS.categoryMap, ...(raw.categoryMap || {}) }, capitalCategories: raw.capitalCategories || DEFAULTS.capitalCategories };
  return s;
};
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
function checkSettings(raw, accountsByCode) {
  const o = {};
  if (raw.fiscalStartMonth !== undefined) { const m = Number(raw.fiscalStartMonth); if (!Number.isInteger(m) || m < 1 || m > 12) return { error: 'The fiscal year must start in a month from 1 to 12.' }; o.fiscalStartMonth = m; }
  if (raw.startDate !== undefined) { if (raw.startDate && !isDay(raw.startDate)) return { error: 'Give the start date as a date.' }; o.startDate = raw.startDate || ''; }
  if (raw.budgetControl !== undefined) { if (!['off', 'warn', 'block'].includes(raw.budgetControl)) return { error: 'Budget control is off, warn or block.' }; o.budgetControl = raw.budgetControl; }
  if (raw.requireReconciliation !== undefined) o.requireReconciliation = !!raw.requireReconciliation;
  if (raw.map !== undefined) {
    const map = {};
    for (const [k, code] of Object.entries(raw.map || {})) {
      if (!MAP_KINDS[k]) return { error: `Unknown automatic posting account "${k}".` };
      const a = accountsByCode && accountsByCode.get(String(code));
      if (!a) return { error: `${MAP_LABEL[k]}: account ${code} does not exist.` };
      if (!a.active) return { error: `${MAP_LABEL[k]}: account ${code} is switched off.` };
      if (a.kind !== MAP_KINDS[k]) return { error: `${MAP_LABEL[k]} must be a${/^[aeiou]/.test(MAP_KINDS[k]) ? 'n' : ''} ${KIND_LABEL[MAP_KINDS[k]].toLowerCase()} account.` };
      map[k] = String(code);
    }
    o.map = map;
  }
  if (raw.categoryMap !== undefined) {
    const cm = {};
    for (const [cat, code] of Object.entries(raw.categoryMap || {})) {
      const a = accountsByCode && accountsByCode.get(String(code));
      if (!a || !a.active || a.kind !== 'expense') return { error: `Purchases of "${cat}" must go to an active expense account (${code} is not).` };
      cm[String(cat).slice(0, 60)] = String(code);
    }
    o.categoryMap = cm;
  }
  if (raw.capitalCategories !== undefined) o.capitalCategories = [...new Set((raw.capitalCategories || []).map((s) => String(s).trim().slice(0, 60)).filter(Boolean))].slice(0, 40);
  return { value: o };
}

/* ───────── time ───────── */
const pad = (n) => String(n).padStart(2, '0');
const ymOf = (day) => String(day).slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
const monthsBetween = (a, b) => { const out = []; let cur = a; for (let i = 0; i < 600 && cur <= b; i += 1) { out.push(cur); cur = addMonths(cur, 1); } return out; };
// Fiscal year label: starting 2026 and running July to June is "2026-27"; a calendar-year school gets "2026".
const fyOf = (ym, startMonth = 7) => {
  const [y, m] = ym.split('-').map(Number); const sy = m >= startMonth ? y : y - 1;
  return startMonth === 1 ? String(sy) : `${sy}-${pad((sy + 1) % 100)}`;
};
const fyRange = (fy, startMonth = 7) => { const sy = Number(String(fy).slice(0, 4)); const first = `${sy}-${pad(startMonth)}`; return { from: first, to: addMonths(first, 11), months: monthsBetween(first, addMonths(first, 11)) }; };
const validFy = (fy, startMonth) => (startMonth === 1 ? /^\d{4}$/.test(fy) : /^\d{4}-\d{2}$/.test(fy) && (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5)));

/* ───────── journals ───────── */
const normal = (kind) => (DEBIT_NORMAL.has(kind) ? 'debit' : 'credit');
const signed = (kind, debit, credit) => (DEBIT_NORMAL.has(kind) ? debit - credit : credit - debit);
const isCapex = (account, cfg) => account.kind === 'asset' && account.code === cfg.map.fixedAssets;
const fundable = (account, cfg) => FUND_KINDS.has(account.kind) || isCapex(account, cfg);

// Check a list of lines. Returns { lines, totalDebit, totalCredit } or { error, at }.
function checkLines(raw, accountsByCode, cfg) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 2) return { error: 'A journal needs at least two lines.' };
  if (list.length > MAX_LINES) return { error: `A journal can have at most ${MAX_LINES} lines.` };
  const lines = []; let dr = 0; let cr = 0;
  for (let i = 0; i < list.length; i += 1) {
    const l = list[i] || {}; const at = i + 1;
    const code = String(l.code || '').trim(); const a = accountsByCode.get(code);
    if (!a) return { error: `Line ${at}: account ${code || '(none)'} does not exist.`, at };
    if (!a.active) return { error: `Line ${at}: account ${code} is switched off.`, at };
    const debit = Number(l.debit || 0); const credit = Number(l.credit || 0);
    if (![debit, credit].every((x) => Number.isFinite(x) && Number.isInteger(x) && x >= 0 && x <= MAX_AMOUNT)) return { error: `Line ${at}: amounts must be whole rupees of zero or more.`, at };
    if ((debit > 0) === (credit > 0)) return { error: `Line ${at}: give either a debit or a credit, not both and not neither.`, at };
    const fundId = String(l.fundId || '').trim();
    if (fundId && !fundable(a, cfg)) return { error: `Line ${at}: a fund can be named only on income, expense and fixed-asset lines.`, at };
    lines.push({ code, debit, credit, memo: String(l.memo || '').trim().slice(0, 200), fundId, campusId: String(l.campusId || '').trim().slice(0, 40), costCentre: String(l.costCentre || '').trim().slice(0, 60) });
    dr += debit; cr += credit;
  }
  if (dr !== cr) return { error: `The journal does not balance: debits are ${dr.toLocaleString('en-US')} and credits are ${cr.toLocaleString('en-US')} (difference ${Math.abs(dr - cr).toLocaleString('en-US')}).`, difference: dr - cr };
  if (dr === 0) return { error: 'A journal cannot be for nothing.' };
  return { lines, totalDebit: dr, totalCredit: cr };
}

// A fingerprint of a posted journal, so a changed line shows up when the books are checked.
const journalHash = (number, date, lines) => crypto.createHash('sha256').update(JSON.stringify([number, date, lines.map((l) => [l.code, l.debit, l.credit, l.fundId || '', l.campusId || ''])])).digest('hex').slice(0, 32);

/* ───────── fund rules ───────── */
// Why a line may not be charged to this fund. Empty list = eligible. spent = what the fund has already paid for.
function fundReasons(fund, account, line, date, spent, cfg) {
  const out = [];
  if (!fund) return ['That fund does not exist.'];
  if (fund.status !== 'active') out.push(`${fund.name} is closed.`);
  if (fund.kind === 'unrestricted') return out;
  if (fund.validFrom && date < fund.validFrom) out.push(`${fund.name} starts on ${fund.validFrom}; this is dated ${date}.`);
  if (fund.validTo && date > fund.validTo) out.push(`${fund.name} ended on ${fund.validTo}; this is dated ${date}.`);
  const spends = account.kind === 'expense' || isCapex(account, cfg);
  if (spends && fund.allowedCodes && fund.allowedCodes.length && !fund.allowedCodes.includes(account.code)) out.push(`${fund.name} does not cover ${account.code} ${account.name}.`);
  if (spends && fund.ceiling > 0) {
    const add = (line.debit || 0) - (line.credit || 0);
    if (add > 0 && spent + add > fund.ceiling) out.push(`${fund.name} would be overspent: ${ (spent + add).toLocaleString('en-US')} against ${fund.ceiling.toLocaleString('en-US')} awarded.`);
  }
  return out;
}

// Differences between two sets of net positions, as lines.
const keyOfLine = (code, fundId) => `${code}|${fundId || ''}`;
function deltaLines(target, posted) {
  const keys = new Set([...Object.keys(target || {}), ...Object.keys(posted || {})]); const lines = [];
  for (const k of [...keys].sort()) {
    const d = Math.round((target?.[k] || 0) - (posted?.[k] || 0)); if (!d) continue;
    const [code, fundId] = k.split('|');
    lines.push({ code, fundId: fundId || '', debit: d > 0 ? d : 0, credit: d < 0 ? -d : 0 });
  }
  return lines;
}
const addNet = (net, code, fundId, amount) => { if (!amount) return; const k = keyOfLine(code, fundId); net[k] = (net[k] || 0) + Math.round(amount); if (!net[k]) delete net[k]; };

/* ───────── csv ───────── */
const guard = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csv = (rows) => rows.map((r) => r.map((c) => { const s = guard(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');

module.exports = {
  KINDS, KIND_LABEL, DEBIT_NORMAL, FUND_KINDS, CHART, DEFAULTS, MAP_KINDS, MAP_LABEL, MAX_AMOUNT, merge, checkSettings, isDay,
  pad, ymOf, addMonths, lastDay, monthsBetween, fyOf, fyRange, validFy, normal, signed, fundable, isCapex, checkLines, journalHash, fundReasons, deltaLines, addNet, keyOfLine, guard, csv,
};
