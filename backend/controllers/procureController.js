// Purchasing, funds, assets and facilities (PRD E19): requests and orders, bills, budgets, projects, the asset register, maintenance and reports.
const S = require('../utils/procure/service');
const U = require('../utils/procure/setup');
const B = require('../utils/procure/buying');
const X = require('../utils/procure/assets');
const F = require('../utils/procure/funding');
const { E, Fail, oid, sid, wrap, ctxOf, clean } = S;
const { audit } = require('../utils/audit');
const PcFund = require('../models/PcFund'); const PcBudgetLine = require('../models/PcBudgetLine'); const PcBudget = require('../models/PcBudget'); const PcProject = require('../models/PcProject'); const PcVendor = require('../models/PcVendor'); const PcOrder = require('../models/PcOrder');
const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'procure', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const body = (req) => req.body || {};
const id = (d) => String(d && d._id);
const decision = (v) => v === true || v === 'approve' || v === 'approved';

/* ───────── who am I here ───────── */
exports.access = wrap('pc.access', async (req, res) => { res.json({ officer: await S.isOfficer(req.user), request: await S.canRequest(req.user), admin: req.user.role === 'admin' }); });
// What a request form needs to offer.
exports.options = wrap('pc.options', async (req, res) => {
  const g = await S.getCfg(sid(req)); const t = await S.today(sid(req)); const year = E.fiscalYear(t, g.settings.fiscalYearStartMonth);
  const [lines, budgets, projects] = await Promise.all([PcBudgetLine.find({ schoolId: sid(req), year }), PcBudget.find({ schoolId: sid(req), year, status: 'approved' }).select('_id'), PcProject.find({ schoolId: sid(req), phase: { $in: ['approved', 'building', 'handover'] } }).select('code title')]);
  const ok = new Set(budgets.map(id)); res.json({ year, costCentres: g.settings.costCentres, categories: g.settings.categories, quoteThreshold: g.settings.quoteThreshold, minQuotes: g.settings.minQuotes, singleApprovalLimit: g.settings.singleApprovalLimit, lines: lines.filter((l) => ok.has(String(l.budgetId))).map((l) => ({ _id: l._id, costCentre: l.costCentre, category: l.category, available: l.available })), projects: projects.map((p) => ({ _id: p._id, code: p.code, title: p.title })) });
});
exports.overview = wrap('pc.overview', async (req, res) => { res.json(await X.overview(sid(req))); });
exports.settings = wrap('pc.settings', async (req, res) => { const g = await S.getCfg(sid(req)); res.json({ settings: g.settings, version: g.version, history: g.history.map((h) => ({ version: h.version, reason: h.reason, at: h.at, byName: h.byName })) }); });
exports.saveSettings = wrap('pc.saveSettings', async (req, res) => {
  const reason = clean(body(req).reason, 300); if (reason.length < 5) throw new Fail(422, 'Write why the settings are changing.'); const r = E.cleanSettings(body(req).settings || {}); if (r.error) throw new Fail(422, r.error);
  const g = await S.getCfg(sid(req)); const merged = { ...g.settings, ...r.settings }; const next = { version: g.version + 1, reason, at: new Date(), byName: ctxOf(req).actor.name || '', settings: merged };
  await S.putCfg(sid(req), { history: [...g.history.slice(-19), next] }); await A(req, 'procure.settings', String(next.version), reason); res.json({ version: next.version, settings: E.merge(merged) });
});

/* ───────── suppliers ───────── */
exports.vendors = wrap('pc.vendors', async (req, res) => { res.json(await U.listVendors(sid(req), req.query)); });
exports.vendor = wrap('pc.vendor', async (req, res) => { res.json(await U.vendorDetail(sid(req), req.params.id)); });
exports.createVendor = wrap('pc.createVendor', async (req, res) => { const v = await U.createVendor(ctxOf(req), body(req)); await A(req, 'procure.vendor.create', id(v), v.name); res.status(201).json(U.vendorView(v)); });
exports.updateVendor = wrap('pc.updateVendor', async (req, res) => { const r = await U.updateVendor(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.vendor.update', req.params.id); res.json(r); });
exports.requestBank = wrap('pc.requestBank', async (req, res) => { const r = await U.requestBank(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.vendor.bank.request', req.params.id); res.json(r); });
exports.decideBank = wrap('pc.decideBank', async (req, res) => { const r = await U.decideBank(ctxOf(req), req.params.id, { approve: decision(body(req).approve), note: body(req).note }); await A(req, 'procure.vendor.bank.decide', req.params.id, r.status); res.json(r); });

/* ───────── funds ───────── */
exports.funds = wrap('pc.funds', async (req, res) => { res.json(await X.fundsReport(sid(req))); });
exports.fund = wrap('pc.fund', async (req, res) => { res.json(await U.fundDetail(sid(req), req.params.id, req.query)); });
exports.createFund = wrap('pc.createFund', async (req, res) => { const f = await U.createFund(ctxOf(req), body(req)); await A(req, 'procure.fund.create', id(f), f.name); res.status(201).json(f); });
exports.fundMoney = wrap('pc.fundMoney', async (req, res) => { const r = await U.fundMoney(ctxOf(req), req.params.id, body(req)); await A(req, `procure.fund.${body(req).kind === 'adjust' ? 'adjust' : 'receipt'}`, req.params.id, String(body(req).amount)); res.json({ available: r.available }); });
exports.closeFund = wrap('pc.closeFund', async (req, res) => { const r = await U.closeFund(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.fund.close', req.params.id); res.json(r); });
exports.reconcile = wrap('pc.reconcile', async (req, res) => { res.json(await F.reconcile(sid(req))); });

/* ───────── budgets ───────── */
exports.budgets = wrap('pc.budgets', async (req, res) => { res.json(await U.listBudgets(sid(req), req.query)); });
exports.createBudget = wrap('pc.createBudget', async (req, res) => { const b = await U.createBudget(ctxOf(req), body(req)); await A(req, 'procure.budget.create', id(b), `${b.costCentre} ${b.year}`); res.status(201).json(b); });
exports.updateBudget = wrap('pc.updateBudget', async (req, res) => { const r = await U.updateBudget(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.budget.update', req.params.id); res.json(r); });
exports.approveBudget = wrap('pc.approveBudget', async (req, res) => { const r = await U.approveBudget(ctxOf(req), req.params.id); await A(req, 'procure.budget.approve', req.params.id, r.sole ? 'sole administrator' : ''); res.json(r); });
exports.closeBudget = wrap('pc.closeBudget', async (req, res) => { const r = await U.closeBudget(ctxOf(req), req.params.id); await A(req, 'procure.budget.close', req.params.id); res.json(r); });
exports.variations = wrap('pc.variations', async (req, res) => { res.json(await U.listVariations(sid(req), req.query)); });
exports.requestVariation = wrap('pc.requestVariation', async (req, res) => { const v = await U.requestVariation(ctxOf(req), body(req)); await A(req, 'procure.variation.request', id(v), v.varNo); await S.tellAdmins(sid(req), 'Budget variation to decide', `${v.varNo}: ${S.money(v.amount)} (${v.reason}).`, '/admin#/purchasing', ctxOf(req).actor.id); res.status(201).json(v); });
exports.decideVariation = wrap('pc.decideVariation', async (req, res) => { const r = await U.decideVariation(ctxOf(req), req.params.id, { approve: decision(body(req).approve), note: body(req).note }); await A(req, 'procure.variation.decide', req.params.id, r.status); res.json(r); });

/* ───────── projects ───────── */
exports.projects = wrap('pc.projects', async (req, res) => { res.json(await U.listProjects(sid(req), req.query)); });
exports.project = wrap('pc.project', async (req, res) => { res.json(await U.projectDetail(sid(req), req.params.id)); });
exports.createProject = wrap('pc.createProject', async (req, res) => { const p = await U.createProject(ctxOf(req), body(req)); await A(req, 'procure.project.create', id(p), p.code); await S.tellAdmins(sid(req), 'Project to approve', `${p.code}: ${p.title} (${S.money(p.proposed)}).`, '/admin#/purchasing', ctxOf(req).actor.id); res.status(201).json(p); });
exports.approveProject = wrap('pc.approveProject', async (req, res) => { const r = await U.approveProject(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.project.approve', req.params.id); res.json(r); });
exports.setPhase = wrap('pc.setPhase', async (req, res) => { const r = await U.setPhase(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.project.phase', req.params.id, body(req).phase); res.json(r); });
exports.milestone = wrap('pc.milestone', async (req, res) => { const r = await U.milestone(ctxOf(req), req.params.id, req.params.key, body(req)); await A(req, 'procure.project.milestone', req.params.id, req.params.key); res.json(r); });
exports.requestChange = wrap('pc.requestChange', async (req, res) => { const c = await U.requestChange(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.change.request', id(c), c.chgNo); await S.tellAdmins(sid(req), 'Project change order to decide', `${c.chgNo}: ${c.kind}${c.amount ? ` ${S.money(c.amount)}` : ''}.`, '/admin#/purchasing', ctxOf(req).actor.id); res.status(201).json(c); });
exports.decideChange = wrap('pc.decideChange', async (req, res) => { const r = await U.decideChange(ctxOf(req), req.params.id, { approve: decision(body(req).approve), note: body(req).note }); await A(req, 'procure.change.decide', req.params.id, r.status); res.json(r); });

/* ───────── requests ───────── */
exports.reqs = wrap('pc.reqs', async (req, res) => { res.json(await B.listReqs(ctxOf(req), req.query, await S.isOfficer(req.user))); });
exports.req = wrap('pc.req', async (req, res) => { res.json(await B.reqDetail(ctxOf(req), req.params.id, await S.isOfficer(req.user))); });
exports.createReq = wrap('pc.createReq', async (req, res) => { const r = await B.createReq(ctxOf(req), body(req)); await A(req, 'procure.req.create', id(r), r.reqNo); res.status(201).json(r); });
exports.updateReq = wrap('pc.updateReq', async (req, res) => { const r = await B.updateReq(ctxOf(req), req.params.id, body(req), await S.isOfficer(req.user)); res.json(r); });
exports.submitReq = wrap('pc.submitReq', async (req, res) => { const r = await B.submitReq(ctxOf(req), req.params.id, body(req), await S.isOfficer(req.user)); await A(req, 'procure.req.submit', req.params.id); res.json(r); });
exports.cancelReq = wrap('pc.cancelReq', async (req, res) => { const r = await B.cancelReq(ctxOf(req), req.params.id, body(req), await S.isOfficer(req.user)); await A(req, 'procure.req.cancel', req.params.id); res.json(r); });
exports.decideReq = wrap('pc.decideReq', async (req, res) => { const r = await B.decideReq(ctxOf(req), req.params.id, { approve: decision(body(req).approve), note: body(req).note }); await A(req, 'procure.req.decide', req.params.id, r.status); res.json(r); });
exports.addQuote = wrap('pc.addQuote', async (req, res) => { const r = await B.addQuote(ctxOf(req), req.params.id, body(req)); res.status(201).json(r); });
exports.removeQuote = wrap('pc.removeQuote', async (req, res) => { res.json(await B.removeQuote(ctxOf(req), req.params.id, req.params.key)); });
exports.chooseQuote = wrap('pc.chooseQuote', async (req, res) => { res.json(await B.chooseQuote(ctxOf(req), req.params.id, body(req))); });

/* ───────── orders, goods and bills ───────── */
exports.orders = wrap('pc.orders', async (req, res) => { res.json(await B.listOrders(sid(req), req.query)); });
exports.order = wrap('pc.order', async (req, res) => { res.json(await B.orderDetail(sid(req), req.params.id)); });
exports.issueOrder = wrap('pc.issueOrder', async (req, res) => { const o = await B.issueOrder(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.order.issue', id(o), o.poNo); res.status(201).json(o); });
exports.cancelOrder = wrap('pc.cancelOrder', async (req, res) => { const r = await B.cancelOrder(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.order.cancel', req.params.id); res.json(r); });
exports.closeOrder = wrap('pc.closeOrder', async (req, res) => { const r = await B.closeOrder(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.order.close', req.params.id); res.json(r); });
exports.receive = wrap('pc.receive', async (req, res) => { const g = await B.receiveGoods(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.receipt', id(g), g.grnNo); res.status(g.repeat ? 200 : 201).json(g); });
exports.invoices = wrap('pc.invoices', async (req, res) => { res.json(await B.listInvoices(sid(req), req.query)); });
exports.enterInvoice = wrap('pc.enterInvoice', async (req, res) => { const i = await B.enterInvoice(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.bill.enter', id(i), i.billNo); if (i.match === 'exception') await S.tellAdmins(sid(req), 'A supplier bill does not match', `${i.billNo}: ${i.matchNote}`, '/admin#/purchasing', ctxOf(req).actor.id); res.status(201).json(i); });
exports.decideInvoice = wrap('pc.decideInvoice', async (req, res) => { const r = await B.decideInvoice(ctxOf(req), req.params.id, { approve: decision(body(req).approve), note: body(req).note, exceptionReason: body(req).exceptionReason }); await A(req, 'procure.bill.decide', req.params.id, r.status); res.json(r); });
exports.payInvoice = wrap('pc.payInvoice', async (req, res) => { const r = await B.payInvoice(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.bill.pay', req.params.id); res.json(r); });
exports.voidInvoice = wrap('pc.voidInvoice', async (req, res) => { const r = await B.voidInvoice(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.bill.void', req.params.id); res.json(r); });
exports.creditNote = wrap('pc.creditNote', async (req, res) => { const r = await B.creditNote(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.bill.credit', req.params.id, String(r.credited)); res.json(r); });

/* ───────── assets ───────── */
exports.assets = wrap('pc.assets', async (req, res) => { res.json(await X.listAssets(sid(req), req.query)); });
exports.asset = wrap('pc.asset', async (req, res) => { res.json(await X.assetDetail(sid(req), req.params.id)); });
exports.assetByTag = wrap('pc.assetByTag', async (req, res) => { res.json(await X.byTag(sid(req), req.query.tag)); });
exports.createAsset = wrap('pc.createAsset', async (req, res) => { const a = await X.createAsset(ctxOf(req), body(req)); await A(req, 'procure.asset.create', id(a), a.tag); res.status(201).json(a); });
exports.tagFromOrder = wrap('pc.tagFromOrder', async (req, res) => { const r = await X.tagFromOrder(ctxOf(req), body(req)); await A(req, 'procure.asset.tag', String(body(req).orderId), `${r.added} tagged`); res.status(201).json(r); });
exports.updateAsset = wrap('pc.updateAsset', async (req, res) => { const r = await X.updateAsset(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.asset.update', req.params.id); res.json(r); });
exports.transfer = wrap('pc.transfer', async (req, res) => { const r = await X.transfer(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.asset.transfer', req.params.id); res.json(r); });
exports.requestDisposal = wrap('pc.requestDisposal', async (req, res) => { const r = await X.requestDisposal(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.asset.dispose.request', req.params.id); res.json(r); });
exports.decideDisposal = wrap('pc.decideDisposal', async (req, res) => { const r = await X.decideDisposal(ctxOf(req), req.params.id, { approve: decision(body(req).approve), note: body(req).note }); await A(req, 'procure.asset.dispose.decide', req.params.id, r.status); res.json(r); });
exports.assetLabels = wrap('pc.assetLabels', async (req, res) => { const pdf = await X.assetLabels(sid(req), body(req)); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="asset-tags.pdf"' }); res.send(pdf); });

/* ───────── maintenance and running costs ───────── */
exports.tickets = wrap('pc.tickets', async (req, res) => { res.json(await X.listTickets(ctxOf(req), req.query, await S.isOfficer(req.user))); });
exports.reportTicket = wrap('pc.reportTicket', async (req, res) => { const t = await X.reportTicket(ctxOf(req), body(req)); await A(req, 'procure.ticket.report', id(t), t.ticketNo); res.status(201).json(t); });
exports.updateTicket = wrap('pc.updateTicket', async (req, res) => { const r = await X.updateTicket(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.ticket.update', req.params.id, body(req).status || ''); res.json(r); });
exports.plans = wrap('pc.plans', async (req, res) => { res.json(await X.listPlans(sid(req))); });
exports.createPlan = wrap('pc.createPlan', async (req, res) => { const p = await X.createPlan(ctxOf(req), body(req)); await A(req, 'procure.plan.create', id(p), p.task); res.status(201).json(p); });
exports.updatePlan = wrap('pc.updatePlan', async (req, res) => { const r = await X.updatePlan(ctxOf(req), req.params.id, body(req)); await A(req, 'procure.plan.update', req.params.id); res.json(r); });
exports.contracts = wrap('pc.contracts', async (req, res) => { res.json(await X.listContracts(sid(req))); });
exports.saveContract = wrap('pc.saveContract', async (req, res) => { const r = await X.saveContract(ctxOf(req), req.params.id || null, body(req)); await A(req, req.params.id ? 'procure.contract.update' : 'procure.contract.create', req.params.id || id(r)); res.status(req.params.id ? 200 : 201).json(r); });
exports.forecast = wrap('pc.forecast', async (req, res) => { res.json(await X.forecast(sid(req), req.query)); });

/* ───────── reports ───────── */
const cell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csv = (rows) => rows.map((r) => r.map((v) => `"${cell(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
const REPORTS = {
  budget: async (s, q) => { const d = await X.budgetActual(s, q); return { json: d, csv: [['Cost centre', 'Category', 'Budget', 'Set aside', 'Spent', 'Left', 'Used %'], ...d.rows.map((r) => [r.costCentre, r.category, r.amount, r.committed, r.spent, r.available, r.usedPercent])] }; },
  funds: async (s) => { const d = await X.fundsReport(s); return { json: d, csv: [['Fund', 'Kind', 'Donor', 'Received', 'Set aside', 'Spent', 'Left', 'Status'], ...d.rows.map((r) => [r.name, r.kind, r.donor, r.received, r.committed, r.spent, r.available, r.status])] }; },
  pipeline: async (s) => ({ json: await X.pipeline(s) }),
  payables: async (s) => { const d = await X.payables(s); return { json: d, csv: [['Bill', 'Supplier', 'Order', 'Amount', 'Due', 'Days late', 'Status'], ...d.rows.map((r) => [r.billNo, r.vendorName, r.poNo, r.amount, r.dueOn, r.daysLate, r.status])] }; },
  projects: async (s) => { const d = await X.projectsReport(s); return { json: d, csv: [['Code', 'Project', 'Phase', 'Proposed', 'Authorised', 'Set aside', 'Spent', 'Left'], ...d.rows.map((r) => [r.code, r.title, r.phase, r.proposed, r.authorized, r.committed, r.spent, r.available])] }; },
  assets: async (s, q) => { const d = await X.assetRegister(s, q); return { json: d, csv: [['Tag', 'Asset', 'Kind', 'Location', 'Custodian', 'Capitalised', 'Cost', 'Depreciation', 'Book value', 'Status'], ...d.rows.map((r) => [r.tag, r.name, r.category, r.location, r.custodianName, r.capitalizedOn, r.cost, r.accumulated, r.book, r.status])] }; },
  vendors: async (s, q) => { const d = await X.spendByVendor(s, q); return { json: d, csv: [['Supplier', 'Bills paid', 'Paid (after credits)'], ...d.rows.map((r) => [r.vendor, r.bills, r.paid])] }; },
  contracts: async (s, q) => ({ json: await X.forecast(s, q) }),
};
exports.report = wrap('pc.report', async (req, res) => { const r = REPORTS[req.params.name]; if (!r) throw new Fail(404, 'There is no such report.'); const out = await r(sid(req), req.query); if (req.query.format === 'csv' && out.csv) { res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${req.params.name}.csv"` }); return res.send(`﻿${csv(out.csv)}`); } res.json(out.json); });
exports.sweepNow = wrap('pc.sweep', async (req, res) => { res.json(await X.sweep(sid(req))); });
