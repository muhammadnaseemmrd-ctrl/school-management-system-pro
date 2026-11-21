// The school's ledger (PRD E23): chart, journals, months, funds and grants, budgets, reconciliations, statements.
const S = require('../utils/accounts/service');
const E = require('../utils/accounts/engine');
const L = require('../utils/accounts/ledger');
const B = require('../utils/accounts/books');
const ST = require('../utils/accounts/statements');
const F = require('../utils/accounts/feeds');
const { Fail, sid, wrap, ctxOf } = S;
const { audit } = require('../utils/audit');
const AcJournal = require('../models/AcJournal'); const AcLine = require('../models/AcLine'); const AcBudget = require('../models/AcBudget'); const AcRecon = require('../models/AcRecon'); const AcFund = require('../models/AcFund'); const AcSource = require('../models/AcSource');
const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'accounts', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const body = (req) => req.body || {};
const idOf = (d) => String(d && d._id);
const decision = (v) => v === true || v === 'approve' || v === 'approved';
const FEED_EVERY_MS = 10 * 60 * 1000;
const clip = (d) => (d && d.toObject ? d.toObject() : d);

const needReady = async (req) => { const g = await S.getCfg(sid(req)); if (!g.ready) throw new Fail(409, 'Set up the ledger first.', { reason: 'not_set_up' }); return g; };
const send = (req, res, name, data, rows) => {
  if (req.query.format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); return res.send(E.csv(rows(data))); }
  return res.json(data);
};

/* ───────── who am I here, set-up, settings ───────── */
exports.access = wrap('ac.access', async (req, res) => { const g = await S.getCfg(sid(req)); res.json({ ...(await S.tiers(req.user)), ready: g.ready }); });
exports.setup = wrap('ac.setup', async (req, res) => { const r = await B.setup(ctxOf(req), body(req)); await A(req, 'accounts.setup', sid(req), r.startDate); res.json(r); });
exports.settings = wrap('ac.settings', async (req, res) => {
  const g = await S.getCfg(sid(req)); const accounts = await L.accountsOf(sid(req));
  res.json({ ready: g.ready, settings: g.settings, version: g.version, history: g.history.map((h) => ({ version: h.version, reason: h.reason, at: h.at, byName: h.byName })).reverse(), labels: E.MAP_LABEL, kinds: E.MAP_KINDS, accounts: [...accounts.values()].map((a) => ({ code: a.code, name: a.name, kind: a.kind, active: a.active })) });
});
exports.saveSettings = wrap('ac.saveSettings', async (req, res) => { const r = await B.saveSettings(ctxOf(req), body(req)); await A(req, 'accounts.settings', String(r.version), body(req).reason); res.json(r); });
exports.openingSuggestion = wrap('ac.opening', async (req, res) => { const g = await needReady(req); res.json({ startDate: g.settings.startDate, ...(await F.openingSuggestion(sid(req), g.settings.startDate)) }); });

/* ───────── overview and automatic postings ───────── */
exports.overview = wrap('ac.overview', async (req, res) => {
  const g = await S.getCfg(sid(req)); if (!g.ready) return res.json({ ready: false });
  const st = await S.getState(sid(req));
  if (!st.lastRunAt || Date.now() - new Date(st.lastRunAt).getTime() > FEED_EVERY_MS) { try { await F.run(sid(req)); } catch (e) { console.error('accounts feeds:', e.message); } }
  res.json({ ...(await ST.overview(sid(req), req.user)), tiers: await S.tiers(req.user) });
});
exports.runFeeds = wrap('ac.feeds', async (req, res) => { await needReady(req); const r = await F.run(sid(req), { full: !!body(req).full && req.user.role === 'admin' }); await A(req, 'accounts.feeds', sid(req), `${r.posted} posted, ${r.changed} changed`); res.json(r); });
exports.feedStatus = wrap('ac.feedStatus', async (req, res) => { const st = await S.getState(sid(req)); res.json({ lastRunAt: st.lastRunAt || null, last: st.lastRun || null, held: st.held || [], feeds: Object.entries(F.feeds).map(([k, f]) => ({ key: k, label: f.label })) }); });
exports.sweepNow = wrap('ac.sweep', async (req, res) => { await needReady(req); const r = await F.run(sid(req), { full: true }); const check = await L.check(sid(req)); res.json({ ...r, check }); });
exports.check = wrap('ac.check', async (req, res) => { await needReady(req); res.json(await L.check(sid(req))); });
// Where a record in another part of the school went in the ledger, and back again.
exports.trace = wrap('ac.trace', async (req, res) => {
  const type = String(req.params.type || ''); if (!F.feeds[type]) throw new Fail(404, 'Unknown source type.');
  const journals = await AcJournal.find({ schoolId: sid(req), sourceType: type, sourceId: String(req.params.id) }).sort({ createdAt: 1 }).select('-trail').lean(); const src = await AcSource.findOne({ schoolId: sid(req), kind: type, refId: String(req.params.id) }).lean();
  res.json({ source: src ? { refNo: src.refNo, rev: src.rev, key: src.key } : null, journals });
});

/* ───────── chart of accounts ───────── */
exports.accounts = wrap('ac.accounts', async (req, res) => { await needReady(req); res.json({ accounts: await B.listAccounts(sid(req)), kinds: E.KIND_LABEL }); });
exports.createAccount = wrap('ac.createAccount', async (req, res) => { await needReady(req); const a = await B.createAccount(ctxOf(req), body(req)); await A(req, 'accounts.account.create', idOf(a), `${a.code} ${a.name}`); res.status(201).json(clip(a)); });
exports.updateAccount = wrap('ac.updateAccount', async (req, res) => { await needReady(req); const a = await B.updateAccount(ctxOf(req), req.params.id, body(req)); await A(req, 'accounts.account.update', idOf(a), `${a.code}`); res.json(clip(a)); });

/* ───────── journals ───────── */
const shapeJournal = async (req, j) => {
  const o = clip(j); const accounts = await L.accountsOf(sid(req)); const name = (c) => (accounts.get(c) ? accounts.get(c).name : c);
  if (o.status === 'posted') { const lines = await AcLine.find({ schoolId: sid(req), journalId: o._id }).sort({ seq: 1 }).lean(); o.lines = lines.map((l) => ({ code: l.code, debit: l.debit, credit: l.credit, memo: l.memo || '', fundId: l.fundId || '', campusId: l.campusId || '', costCentre: l.costCentre || '' })); }
  o.lines = o.lines.map((l) => ({ ...l, name: name(l.code) }));
  const fundIds = [...new Set(o.lines.map((l) => l.fundId).filter(Boolean))]; if (fundIds.length) { const funds = await AcFund.find({ schoolId: sid(req), _id: { $in: fundIds } }).select('name').lean(); const fm = new Map(funds.map((f) => [String(f._id), f.name])); o.lines = o.lines.map((l) => ({ ...l, fundName: fm.get(l.fundId) || '' })); }
  if (o.reversalOf) { const r = await AcJournal.findOne({ _id: o.reversalOf }).select('number').lean(); o.reversalOfNo = r ? r.number : ''; }
  if (o.reversedBy) { const r = await AcJournal.findOne({ _id: o.reversedBy }).select('number').lean(); o.reversedByNo = r ? r.number : ''; }
  return o;
};
exports.journals = wrap('ac.journals', async (req, res) => { await needReady(req); const q = req.query; res.json(await ST.journalList(sid(req), { status: q.status, ym: q.ym, q: q.q, type: q.type, fundId: q.fundId, page: Math.max(1, +q.page || 1), limit: Math.min(100, +q.limit || 30) })); });
exports.journal = wrap('ac.journal', async (req, res) => { await needReady(req); res.json(await shapeJournal(req, await L.mustJournal(ctxOf(req), req.params.id))); });
exports.previewJournal = wrap('ac.preview', async (req, res) => {
  const g = await needReady(req); const accounts = await L.accountsOf(sid(req)); const b = body(req); const date = S.day(b.date, 'the journal date'); const r = E.checkLines(b.lines, accounts, g.settings);
  if (r.error) return res.json({ ok: false, error: r.error, at: r.at || null, difference: r.difference || 0 });
  const per = await L.ensurePeriod(sid(req), E.ymOf(date)); const rev = await L.reviewLines(sid(req), g.settings, accounts, r.lines, date);
  res.json({ ok: !rev.problems.length && !rev.blocks.length && per.status === 'open', totalDebit: r.totalDebit, totalCredit: r.totalCredit, periodStatus: per.status, problems: rev.problems, warnings: rev.warnings, blocks: rev.blocks });
});
exports.createJournal = wrap('ac.createJournal', async (req, res) => { await needReady(req); const type = ['manual', 'opening', 'adjusting'].includes(body(req).type) ? body(req).type : 'manual'; const j = await L.createDraft(ctxOf(req), body(req), type); await A(req, 'accounts.journal.draft', idOf(j), j.number); res.status(201).json(await shapeJournal(req, j)); });
exports.updateJournal = wrap('ac.updateJournal', async (req, res) => { await needReady(req); const j = await L.updateDraft(ctxOf(req), req.params.id, body(req)); res.json(await shapeJournal(req, j)); });
exports.deleteJournal = wrap('ac.deleteJournal', async (req, res) => { await needReady(req); const r = await L.deleteDraft(ctxOf(req), req.params.id); await A(req, 'accounts.journal.delete', req.params.id); res.json(r); });
exports.submitJournal = wrap('ac.submit', async (req, res) => { await needReady(req); const j = await L.submit(ctxOf(req), req.params.id); await A(req, 'accounts.journal.submit', idOf(j), j.number); res.json(await shapeJournal(req, j)); });
exports.decideJournal = wrap('ac.decide', async (req, res) => { await needReady(req); const j = await L.decide(ctxOf(req), req.params.id, { approve: decision(body(req).decision ?? body(req).approve), note: body(req).note }); await A(req, `accounts.journal.${j.status}`, idOf(j), j.number); res.json(await shapeJournal(req, j)); });
exports.reverseJournal = wrap('ac.reverse', async (req, res) => { await needReady(req); const j = await L.reverse(ctxOf(req), req.params.id, body(req)); await A(req, 'accounts.journal.reverse', idOf(j), j.number); res.status(201).json(await shapeJournal(req, j)); });

/* ───────── ledger, statements, exports ───────── */
const rangeOf = async (req, g) => {
  const q = req.query; const today = await S.today(sid(req)); const fy = q.fy || E.fyOf(E.ymOf(today), g.settings.fiscalStartMonth); const r = E.fyRange(fy, g.settings.fiscalStartMonth);
  const from = q.from ? S.day(q.from, 'the start date') : `${r.from}-01`; const to = q.to ? S.day(q.to, 'the end date') : E.lastDay(r.to);
  if (to < from) throw new Fail(422, 'The end date is before the start date.'); return { from, to, fy };
};
exports.ledger = wrap('ac.ledger', async (req, res) => {
  const g = await needReady(req); const { from, to } = await rangeOf(req, g); const data = await ST.accountLedger(sid(req), { code: String(req.query.code || ''), from, to, fundId: req.query.fundId || undefined });
  send(req, res, `ledger-${data.account.code}`, data, (d) => [['Date', 'Journal', 'Description', 'Debit', 'Credit', 'Balance'], ['', '', 'Opening balance', '', '', d.opening], ...d.rows.map((r) => [r.date, r.journalNo, r.memo, r.debit || '', r.credit || '', r.balance]), ['', '', 'Closing balance', '', '', d.closing]]);
});
exports.statement = wrap('ac.statement', async (req, res) => {
  const g = await needReady(req); const name = req.params.name; const sidv = sid(req); const today = await S.today(sidv); const fundId = req.query.fundId || undefined; const campusId = req.query.campusId || undefined;
  if (name === 'trial-balance') { const d = await ST.trialBalance(sidv, { asOf: req.query.asOf ? S.day(req.query.asOf, 'the date') : today, fundId, campusId }); return send(req, res, 'trial-balance', d, (x) => [['Code', 'Account', 'Debit', 'Credit'], ...x.rows.map((r) => [r.code, r.name, r.debitBalance || '', r.creditBalance || '']), ['', 'Total', x.totalDebit, x.totalCredit]]); }
  if (name === 'income-expenditure') { const { from, to } = await rangeOf(req, g); const d = await ST.incomeExpenditure(sidv, { from, to, fundId, campusId }); return send(req, res, 'income-expenditure', d, (x) => [['Income and expenditure', `${x.from} to ${x.to}`], ['Income'], ...x.income.map((r) => [r.code, r.name, r.amount]), ['', 'Total income', x.totalIncome], ['Expenditure'], ...x.expense.map((r) => [r.code, r.name, r.amount]), ['', 'Total expenditure', x.totalExpense], ['', 'Surplus or deficit', x.surplus]]); }
  if (name === 'balance-sheet') { const d = await ST.balanceSheet(sidv, { asOf: req.query.asOf ? S.day(req.query.asOf, 'the date') : today }); return send(req, res, 'balance-sheet', d, (x) => [['Balance sheet', x.asOf], ['Assets'], ...x.assets.map((r) => [r.code, r.name, r.amount]), ['', 'Total assets', x.totalAssets], ['Liabilities'], ...x.liabilities.map((r) => [r.code, r.name, r.amount]), ['', 'Total liabilities', x.totalLiabilities], ['Net assets'], ...x.netAssetsAccounts.map((r) => [r.code, r.name, r.amount]), ['', 'Surplus since the ledger began', x.accumulatedSurplus], ['', 'Total net assets', x.totalNetAssets], ['', 'of which restricted by fund rules', x.restricted], ['', 'of which unrestricted', x.unrestricted]]); }
  if (name === 'funds') { const d = { asOf: req.query.asOf || today, funds: await ST.fundPositions(sidv, { asOf: req.query.asOf ? S.day(req.query.asOf, 'the date') : undefined, fundId: req.query.fundId || undefined }) }; return send(req, res, 'funds-and-grants', d, (x) => [['Fund', 'Kind', 'Status', 'Award', 'Received', 'Spent', 'Balance', 'Rule breaks flagged'], ...x.funds.map((f) => [f.name, f.kind, f.status, f.ceiling || '', f.received, f.spent, f.balance, f.flags.length])]); }
  if (name === 'budget') { const fy = req.query.fy || E.fyOf(E.ymOf(today), g.settings.fiscalStartMonth); const d = await ST.budgetVsActual(sidv, { fy, upTo: req.query.upTo || E.ymOf(today), version: req.query.version ? +req.query.version : undefined }); return send(req, res, `budget-${fy}`, d, (x) => [['Code', 'Account', 'Budget for the year', 'Budget to date', 'Actual to date', 'Variance (+ favourable)'], ...x.rows.map((r) => [r.code, r.name, r.annual, r.budgetYtd, r.actualYtd, r.variance])]); }
  if (name === 'receipts-payments') { const { from, to } = await rangeOf(req, g); const d = await ST.receiptsPayments(sidv, { from, to }); return send(req, res, 'receipts-payments', d, (x) => [['Receipts and payments', `${x.from} to ${x.to}`], ['', 'Opening cash and bank', x.opening], ['Receipts'], ...x.receipts.map((r) => ['', r.name, r.amount]), ['', 'Total receipts', x.totalReceipts], ['Payments'], ...x.payments.map((r) => ['', r.name, r.amount]), ['', 'Total payments', x.totalPayments], ['', 'Closing cash and bank', x.closing]]); }
  throw new Fail(404, 'Unknown statement.');
});
exports.fundLines = wrap('ac.fundLines', async (req, res) => {
  await needReady(req); const f = await B.mustFund(ctxOf(req), req.params.id); const rows = await AcLine.find({ schoolId: sid(req), fundId: idOf(f) }).sort({ date: -1, journalNo: -1, seq: 1 }).limit(300).lean();
  res.json({ rows: rows.map((r) => ({ date: r.date, journalNo: r.journalNo, journalId: String(r.journalId), code: r.code, memo: r.memo, debit: r.debit, credit: r.credit })) });
});

/* ───────── funds ───────── */
exports.funds = wrap('ac.funds', async (req, res) => { await needReady(req); const st = await S.getState(sid(req)); res.json({ funds: await ST.fundPositions(sid(req), {}), lastRunAt: st.lastRunAt || null }); });
exports.createFund = wrap('ac.createFund', async (req, res) => { await needReady(req); const f = await B.createFund(ctxOf(req), body(req)); await A(req, 'accounts.fund.create', idOf(f), f.name); res.status(201).json(clip(f)); });
exports.updateFund = wrap('ac.updateFund', async (req, res) => { await needReady(req); const f = await B.updateFund(ctxOf(req), req.params.id, body(req)); await A(req, 'accounts.fund.update', idOf(f), body(req).reason); res.json(clip(f)); });
exports.closeFund = wrap('ac.closeFund', async (req, res) => { await needReady(req); const f = await B.setFundStatus(ctxOf(req), req.params.id, 'closed', body(req).reason); await A(req, 'accounts.fund.close', idOf(f), body(req).reason); res.json(clip(f)); });
exports.reopenFund = wrap('ac.reopenFund', async (req, res) => { await needReady(req); const f = await B.setFundStatus(ctxOf(req), req.params.id, 'active', body(req).reason); await A(req, 'accounts.fund.reopen', idOf(f), body(req).reason); res.json(clip(f)); });

/* ───────── budgets ───────── */
exports.budgets = wrap('ac.budgets', async (req, res) => { await needReady(req); const f = { schoolId: sid(req) }; if (req.query.fy) f.fy = req.query.fy; res.json({ rows: (await AcBudget.find(f).sort({ fy: -1, version: -1 }).limit(60).lean()) }); });
exports.budget = wrap('ac.budget', async (req, res) => { await needReady(req); res.json(clip(await B.mustBudget(ctxOf(req), req.params.id))); });
exports.createBudget = wrap('ac.createBudget', async (req, res) => { await needReady(req); const x = await B.createBudget(ctxOf(req), body(req)); await A(req, 'accounts.budget.create', idOf(x), `${x.fy} v${x.version}`); res.status(201).json(clip(x)); });
exports.updateBudget = wrap('ac.updateBudget', async (req, res) => { await needReady(req); res.json(clip(await B.updateBudget(ctxOf(req), req.params.id, body(req)))); });
exports.deleteBudget = wrap('ac.deleteBudget', async (req, res) => { await needReady(req); res.json(await B.deleteBudget(ctxOf(req), req.params.id)); });
exports.approveBudget = wrap('ac.approveBudget', async (req, res) => { await needReady(req); const x = await B.approveBudget(ctxOf(req), req.params.id, body(req)); await A(req, 'accounts.budget.approve', idOf(x), `${x.fy} v${x.version}`); res.json(clip(x)); });

/* ───────── reconciliations ───────── */
exports.recons = wrap('ac.recons', async (req, res) => { await needReady(req); const f = { schoolId: sid(req) }; if (req.query.ym) f.ym = req.query.ym; if (req.query.code) f.code = req.query.code; res.json({ rows: await AcRecon.find(f).sort({ ym: -1, code: 1 }).limit(100).lean() }); });
exports.saveRecon = wrap('ac.saveRecon', async (req, res) => { await needReady(req); const r = await B.saveRecon(ctxOf(req), body(req)); res.json(clip(r)); });
exports.signRecon = wrap('ac.signRecon', async (req, res) => { await needReady(req); const r = await B.signRecon(ctxOf(req), req.params.id); await A(req, 'accounts.recon.sign', idOf(r), `${r.code} ${r.ym}`); res.json(clip(r)); });
exports.reopenRecon = wrap('ac.reopenRecon', async (req, res) => { await needReady(req); const r = await B.reopenRecon(ctxOf(req), req.params.id, body(req).reason); await A(req, 'accounts.recon.reopen', idOf(r), body(req).reason); res.json(clip(r)); });

/* ───────── months ───────── */
exports.periods = wrap('ac.periods', async (req, res) => { await needReady(req); res.json({ rows: await B.periods(sid(req)) }); });
exports.checklist = wrap('ac.checklist', async (req, res) => { await needReady(req); res.json(await B.closeChecklist(sid(req), req.params.ym)); });
exports.requestClose = wrap('ac.requestClose', async (req, res) => { await needReady(req); const p = await B.requestClose(ctxOf(req), req.params.ym); await A(req, 'accounts.period.request', req.params.ym); res.json(clip(p)); });
exports.approveClose = wrap('ac.approveClose', async (req, res) => { await needReady(req); const p = await B.approveClose(ctxOf(req), req.params.ym); await A(req, 'accounts.period.close', req.params.ym); res.json(clip(p)); });
exports.cancelClose = wrap('ac.cancelClose', async (req, res) => { await needReady(req); res.json(clip(await B.cancelClose(ctxOf(req), req.params.ym))); });
exports.reopenPeriod = wrap('ac.reopenPeriod', async (req, res) => { await needReady(req); const p = await B.reopen(ctxOf(req), req.params.ym, body(req).reason); await A(req, 'accounts.period.reopen', req.params.ym, body(req).reason); res.json(clip(p)); });
exports.verifyPeriod = wrap('ac.verify', async (req, res) => { await needReady(req); res.json(await ST.verifyPeriod(sid(req), req.params.ym)); });
