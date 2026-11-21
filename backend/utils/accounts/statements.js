// Finance statements and reports (PRD E23), worked out from posted lines only.
const crypto = require('crypto');
const S = require('./service');
const E = require('./engine');
const L = require('./ledger');
const AcAccount = require('../../models/AcAccount'); const AcFund = require('../../models/AcFund'); const AcBudget = require('../../models/AcBudget'); const AcLine = require('../../models/AcLine');
const AcJournal = require('../../models/AcJournal'); const AcPeriod = require('../../models/AcPeriod'); const AcRecon = require('../../models/AcRecon');

const num = (n) => Math.round(Number(n) || 0);
const byCode = (a, b) => a.code.localeCompare(b.code);

// Debits and credits by account up to a date, one row for every account that has any.
async function trialBalance(schoolId, { asOf = '', from = '', fundId, campusId } = {}) {
  const accounts = await L.accountsOf(schoolId);
  const rows = await L.sums(schoolId, { to: asOf || undefined, from: from || undefined, fundId, campusId, group: ['code'] });
  const out = rows.map((r) => {
    const a = accounts.get(r.code) || { code: r.code, name: r.code, kind: 'asset' };
    const bal = E.signed(a.kind, r.debit, r.credit);
    return { code: r.code, name: a.name, kind: a.kind, debit: r.debit, credit: r.credit, balance: bal, side: bal >= 0 ? E.normal(a.kind) : (E.normal(a.kind) === 'debit' ? 'credit' : 'debit') };
  }).sort(byCode);
  const debit = out.reduce((s, r) => s + (r.debit - r.credit > 0 ? r.debit - r.credit : 0), 0); const credit = out.reduce((s, r) => s + (r.credit - r.debit > 0 ? r.credit - r.debit : 0), 0);
  return { asOf, rows: out.map((r) => ({ ...r, debitBalance: Math.max(0, r.debit - r.credit), creditBalance: Math.max(0, r.credit - r.debit) })), totalDebit: debit, totalCredit: credit, balanced: debit === credit };
}
const tbHash = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows.map((r) => [r.code, r.debit, r.credit]))).digest('hex').slice(0, 32);

// Income and expenditure for a date range, optionally for one fund.
async function incomeExpenditure(schoolId, { from, to, fundId, campusId }) {
  const accounts = await L.accountsOf(schoolId);
  const rows = await L.sums(schoolId, { from, to, fundId, campusId, group: ['code', 'kind'] }); const income = []; const expense = [];
  for (const r of rows) {
    if (r.kind === 'income') income.push({ code: r.code, name: accounts.get(r.code)?.name || r.code, amount: r.credit - r.debit });
    else if (r.kind === 'expense') expense.push({ code: r.code, name: accounts.get(r.code)?.name || r.code, amount: r.debit - r.credit });
  }
  income.sort(byCode); expense.sort(byCode);
  const totalIncome = income.reduce((s, r) => s + r.amount, 0); const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
  return { from, to, fundId: fundId || '', income, expense, totalIncome, totalExpense, surplus: totalIncome - totalExpense };
}

// Position at a date. Net assets are the opening figure plus everything earned and spent since the ledger began; funds with rules are shown apart.
async function balanceSheet(schoolId, { asOf }) {
  const accounts = await L.accountsOf(schoolId); const rows = await L.sums(schoolId, { to: asOf, group: ['code', 'kind'] });
  const sec = { asset: [], liability: [], net_assets: [] }; let income = 0; let expense = 0;
  for (const r of rows) {
    if (r.kind === 'income') { income += r.credit - r.debit; continue; } if (r.kind === 'expense') { expense += r.debit - r.credit; continue; }
    const bal = E.signed(r.kind, r.debit, r.credit); if (bal) sec[r.kind].push({ code: r.code, name: accounts.get(r.code)?.name || r.code, amount: bal });
  }
  Object.values(sec).forEach((l) => l.sort(byCode));
  const sum = (l) => l.reduce((s, r) => s + r.amount, 0); const surplus = income - expense;
  const funds = await fundPositions(schoolId, { asOf }); const restricted = funds.filter((f) => f.kind !== 'unrestricted').reduce((s, f) => s + f.balance, 0);
  const netAssets = sum(sec.net_assets) + surplus; const assets = sum(sec.asset); const liabilities = sum(sec.liability);
  return { asOf, assets: sec.asset, totalAssets: assets, liabilities: sec.liability, totalLiabilities: liabilities, netAssetsAccounts: sec.net_assets, accumulatedSurplus: surplus, totalNetAssets: netAssets, restricted, unrestricted: netAssets - restricted, balanced: assets === liabilities + netAssets };
}

// Each fund: what came in, what was paid for, what is left, the award ceiling and any rule breaks flagged on automatic postings.
async function fundPositions(schoolId, { asOf, fundId } = {}) {
  const cfg = (await S.getCfg(schoolId)).settings; const accounts = await L.accountsOf(schoolId);
  const funds = await AcFund.find({ schoolId: S.oid(schoolId), ...(fundId ? { _id: fundId } : {}) }).sort({ name: 1 }).lean();
  const rows = await L.sums(schoolId, { to: asOf || undefined, group: ['fundId', 'code', 'kind'] }); const flagged = await AcJournal.find({ schoolId: S.oid(schoolId), 'flags.kind': 'fund' }).select('number flags date').lean();
  return funds.map((f) => {
    const mine = rows.filter((r) => r.fundId === String(f._id)); const received = mine.filter((r) => r.kind === 'income').reduce((s, r) => s + r.credit - r.debit, 0);
    const spendRows = mine.filter((r) => r.kind === 'expense' || r.code === cfg.map.fixedAssets); const spent = spendRows.reduce((s, r) => s + r.debit - r.credit, 0);
    const flags = flagged.filter((j) => j.flags.some((x) => x.kind === 'fund' && x.text.startsWith(f.name))).map((j) => ({ number: j.number, date: j.date, text: j.flags.find((x) => x.kind === 'fund').text }));
    return {
      id: String(f._id), name: f.name, kind: f.kind, donor: f.donor, reference: f.reference, purpose: f.purpose, status: f.status, validFrom: f.validFrom, validTo: f.validTo, ceiling: f.ceiling, allowedCodes: f.allowedCodes, pcFundId: f.pcFundId || '',
      received, spent, balance: received - spent, remainingCeiling: f.ceiling > 0 ? Math.max(0, f.ceiling - spent) : null, spentBy: spendRows.map((r) => ({ code: r.code, name: accounts.get(r.code)?.name || r.code, amount: r.debit - r.credit })).filter((r) => r.amount).sort(byCode), flags,
    };
  });
}

// Budget against what was posted, for a fiscal year up to a month.
async function budgetVsActual(schoolId, { fy, upTo, version }) {
  const cfg = (await S.getCfg(schoolId)).settings; const accounts = await L.accountsOf(schoolId); const range = E.fyRange(fy, cfg.fiscalStartMonth);
  const bud = version ? await AcBudget.findOne({ schoolId: S.oid(schoolId), fy, version }) : (await AcBudget.findOne({ schoolId: S.oid(schoolId), fy, status: 'approved' })) || (await AcBudget.find({ schoolId: S.oid(schoolId), fy }).sort({ version: -1 }).limit(1))[0];
  const to = upTo && upTo <= range.to ? upTo : range.to; const months = E.monthsBetween(range.from, to);
  const actual = await L.sums(schoolId, { fromYm: range.from, toYm: to, group: ['code', 'kind'] });
  const lines = new Map((bud?.lines || []).map((l) => [l.code, l]));
  for (const r of actual) if (r.kind === 'income' || r.kind === 'expense') if (!lines.has(r.code)) lines.set(r.code, { code: r.code, months: new Array(12).fill(0), total: 0 });
  const rows = [...lines.values()].map((l) => {
    const a = accounts.get(l.code) || { name: l.code, kind: 'expense' }; const act = actual.find((r) => r.code === l.code); const spent = act ? (a.kind === 'income' ? act.credit - act.debit : act.debit - act.credit) : 0;
    const ytd = (l.months || []).slice(0, months.length).reduce((s, v) => s + (v || 0), 0);
    const variance = a.kind === 'income' ? spent - ytd : ytd - spent;                // positive is favourable
    return { code: l.code, name: a.name, kind: a.kind, annual: l.total || 0, budgetYtd: ytd, actualYtd: spent, variance, percent: ytd ? Math.round((spent / ytd) * 100) : null };
  }).filter((r) => r.kind === 'income' || r.kind === 'expense').sort(byCode);
  const tot = (k, f) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r[f], 0);
  return { fy, upTo: to, version: bud?.version || 0, status: bud?.status || 'none', rows, income: { budget: tot('income', 'budgetYtd'), actual: tot('income', 'actualYtd') }, expense: { budget: tot('expense', 'budgetYtd'), actual: tot('expense', 'actualYtd') } };
}

// The ledger of one account: opening balance, every line, running balance.
async function accountLedger(schoolId, { code, from, to, fundId }) {
  const accounts = await L.accountsOf(schoolId); const a = accounts.get(code); if (!a) throw new S.Fail(404, 'That account was not found.');
  const before = from ? await L.sums(schoolId, { to: E.addMonths(E.ymOf(from), 0) && new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), codes: [code], fundId }) : [];
  let running = before.reduce((s, r) => s + E.signed(a.kind, r.debit, r.credit), 0); const opening = running;
  const q = { schoolId: S.oid(schoolId), code }; if (from || to) q.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }; if (fundId) q.fundId = fundId;
  const total = await AcLine.countDocuments(q); if (total > 5000) throw new S.Fail(422, `That is ${total.toLocaleString('en-US')} lines. Narrow the dates to see the ledger.`);
  const lines = await AcLine.find(q).sort({ date: 1, journalNo: 1, seq: 1 }).lean();
  const rows = lines.map((l) => { running += E.signed(a.kind, l.debit, l.credit); return { date: l.date, journalNo: l.journalNo, journalId: String(l.journalId), memo: l.memo, fundId: l.fundId || '', debit: l.debit, credit: l.credit, balance: running }; });
  return { account: { code: a.code, name: a.name, kind: a.kind }, from, to, opening, rows, closing: running };
}

// Where the cash and bank money came from and went, by the other side of each journal.
async function receiptsPayments(schoolId, { from, to }) {
  const accounts = await L.accountsOf(schoolId); const cashCodes = [...accounts.values()].filter((a) => a.cash || a.bank).map((a) => a.code); const isCash = new Set(cashCodes);
  const before = await L.sums(schoolId, { to: new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), codes: cashCodes }); const opening = before.reduce((s, r) => s + r.debit - r.credit, 0);
  const cashLines = await AcLine.find({ schoolId: S.oid(schoolId), code: { $in: cashCodes }, date: { $gte: from, $lte: to } }).select('journalId').lean();
  const ids = [...new Set(cashLines.map((l) => String(l.journalId)))]; const receipts = new Map(); const payments = new Map(); let totalIn = 0; let totalOut = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const all = await AcLine.find({ schoolId: S.oid(schoolId), journalId: { $in: ids.slice(i, i + 200) } }).lean(); const perJ = new Map();
    all.forEach((l) => { const k = String(l.journalId); if (!perJ.has(k)) perJ.set(k, []); perJ.get(k).push(l); });
    for (const ls of perJ.values()) {
      const cashNet = ls.filter((l) => isCash.has(l.code) && l.date >= from && l.date <= to).reduce((s, l) => s + l.debit - l.credit, 0); if (!cashNet) continue;
      const contra = ls.filter((l) => !isCash.has(l.code)); const into = cashNet > 0; const sign = (l) => (into ? l.credit - l.debit : l.debit - l.credit);
      const side = contra.map((l) => ({ l, v: sign(l) })).filter((x) => x.v > 0); const tot = side.reduce((s, x) => s + x.v, 0); const bucket = into ? receipts : payments; const abs = Math.abs(cashNet); let given = 0;
      if (!tot) { bucket.set('Transfers and other', (bucket.get('Transfers and other') || 0) + abs); } else side.forEach((x, idx) => {
        const part = idx === side.length - 1 ? abs - given : Math.round((x.v * abs) / tot); given += part; const a = accounts.get(x.l.code); const name = `${x.l.code} ${a ? a.name : ''}`.trim(); bucket.set(name, (bucket.get(name) || 0) + part);
      });
      if (into) totalIn += abs; else totalOut += abs;
    }
  }
  const list = (m) => [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => a.name.localeCompare(b.name));
  return { from, to, opening, receipts: list(receipts), totalReceipts: totalIn, payments: list(payments), totalPayments: totalOut, closing: opening + totalIn - totalOut };
}

async function journalList(schoolId, { status, ym, q, type, fundId, page = 1, limit = 30 }) {
  const f = { schoolId: S.oid(schoolId) }; if (status) f.status = status; if (ym) f.ym = ym; if (type) f.type = type; if (fundId) f['lines.fundId'] = fundId;
  if (q) { const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ number: re }, { memo: re }, { reference: re }]; }
  const [rows, total] = await Promise.all([AcJournal.find(f).sort({ date: -1, number: -1 }).skip((page - 1) * limit).limit(limit).select('-trail').lean(), AcJournal.countDocuments(f)]);
  return { rows, total, page, limit };
}

// Month-end evidence: totals and a fingerprint of the trial balance, kept when the month closes.
async function snapshotFor(schoolId, ym) {
  const tb = await trialBalance(schoolId, { asOf: E.lastDay(ym) }); const raw = await L.sums(schoolId, { to: E.lastDay(ym), group: ['code'] });
  return { asOf: E.lastDay(ym), lines: raw.reduce((s, r) => s + r.n, 0), totalDebit: raw.reduce((s, r) => s + r.debit, 0), totalCredit: raw.reduce((s, r) => s + r.credit, 0), hash: tbHash(raw.sort(byCode)), accounts: tb.rows.length };
}
async function verifyPeriod(schoolId, ym) {
  const p = await AcPeriod.findOne({ schoolId: S.oid(schoolId), ym }); if (!p || !p.snapshot) return { ok: false, reason: 'That month has no closing record.' };
  const now = await snapshotFor(schoolId, ym); return { ok: now.hash === p.snapshot.hash && now.totalDebit === p.snapshot.totalDebit, closed: p.snapshot, now };
}

async function overview(schoolId, user) {
  const { settings: cfg, ready } = await S.getCfg(schoolId); if (!ready) return { ready: false };
  const sid = S.oid(schoolId); const today = await S.today(schoolId); const ym = E.ymOf(today); const fy = E.fyOf(ym, cfg.fiscalStartMonth); const range = E.fyRange(fy, cfg.fiscalStartMonth);
  const accounts = await L.accountsOf(schoolId); const bal = await L.sums(schoolId, { to: today, group: ['code', 'kind'] });
  const of = (code) => { const r = bal.find((x) => x.code === code); const a = accounts.get(code); return r && a ? E.signed(a.kind, r.debit, r.credit) : 0; };
  const cash = [...accounts.values()].filter((a) => a.cash || a.bank).reduce((s, a) => s + of(a.code), 0);
  const ytd = await L.sums(schoolId, { fromYm: range.from, toYm: ym, group: ['kind'] }); const inc = ytd.find((r) => r.kind === 'income'); const exp = ytd.find((r) => r.kind === 'expense');
  const [drafts, submitted, rejected, periods, state, funds, recons] = await Promise.all([
    AcJournal.countDocuments({ schoolId: sid, status: 'draft', type: { $ne: 'system' } }), AcJournal.countDocuments({ schoolId: sid, status: 'submitted' }), AcJournal.countDocuments({ schoolId: sid, status: 'rejected' }),
    AcPeriod.find({ schoolId: sid, status: { $ne: 'open' } }).select('ym status').lean(), S.getState(schoolId), AcFund.countDocuments({ schoolId: sid, status: 'active', kind: { $ne: 'unrestricted' } }), AcRecon.countDocuments({ schoolId: sid, status: 'draft' }),
  ]);
  const closed = periods.filter((p) => p.status === 'closed').map((p) => p.ym).sort();
  return {
    ready: true, today, ym, fy, startDate: cfg.startDate, cash, feeReceivable: of(cfg.map.feeReceivable), feeAdvance: of(cfg.map.feeAdvance), suppliersOwed: of(cfg.map.ap), salariesOwed: of(cfg.map.salariesPayable),
    yearIncome: inc ? inc.credit - inc.debit : 0, yearExpense: exp ? exp.debit - exp.credit : 0, drafts, submitted, rejected, closedThrough: closed.length ? closed[closed.length - 1] : '', closing: periods.filter((p) => p.status === 'closing').map((p) => p.ym),
    restrictedFunds: funds, openReconciliations: recons, feed: { lastRunAt: state.lastRunAt || null, last: state.lastRun || null, held: (state.held || []).slice(0, 20), heldCount: (state.held || []).length },
  };
}

module.exports = { trialBalance, tbHash, incomeExpenditure, balanceSheet, fundPositions, budgetVsActual, accountLedger, receiptsPayments, journalList, snapshotFor, verifyPeriod, overview };
