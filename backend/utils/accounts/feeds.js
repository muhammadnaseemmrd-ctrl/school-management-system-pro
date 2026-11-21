// Automatic postings (PRD E23): fees, pay runs, supplier bills and store sales reach the ledger by themselves.
// Every source record has a "target": what the ledger should show for it right now. A feed posts only the difference between that
// target and what it has already posted, so a void, a refund or a correction follows through and nothing is ever posted twice.
const School = require('../../models/School');
const FeeInvoice = require('../../models/FeeInvoice'); const FeePayment = require('../../models/FeePayment'); const PayrollBatch = require('../../models/PayrollBatch');
const StaffAdvance = require('../../models/StaffAdvance'); const PcInvoice = require('../../models/PcInvoice'); const PcOrder = require('../../models/PcOrder'); const StSale = require('../../models/StSale');
const AcSource = require('../../models/AcSource'); const AcJournal = require('../../models/AcJournal'); const AcFund = require('../../models/AcFund');
const PcFund = require('../../models/PcFund');
const { nowInTz } = require('../time');
const S = require('./service');
const E = require('./engine');
const L = require('./ledger');

const BATCH = 400; const OVERLAP_MS = 5 * 60 * 1000;
const SYSTEM = { id: null, name: 'Automatic posting' };

/* ───────── what each source should look like in the books ───────── */
const cashCode = (cfg, method) => (method === 'cash' ? cfg.map.cash : cfg.map.bank);
const feeIncome = (cfg, l) => (l.lateFee ? cfg.map.incomeLate : l.kind === 'installment' ? cfg.map.incomeTuition : cfg.map.incomeOtherFees);

const feeds = {
  fee_invoice: {
    label: 'Fee invoices', model: FeeInvoice, dateOf: (d) => d.issueDate, no: (d) => d.number, memo: (d) => `Fee invoice ${d.number}`,
    target(d, cfg) {
      const net = {}; if (d.status === 'Void') return net;
      let total = 0; for (const l of d.lines || []) { const n = Math.round(l.net ?? l.amount ?? 0); if (n) { E.addNet(net, feeIncome(cfg, l), '', -n); total += n; } }
      E.addNet(net, cfg.map.feeReceivable, '', total);
      const adj = Math.round(d.adjusted || 0); const off = Math.min(adj, Math.round(d.writtenOff || 0));
      if (adj) { E.addNet(net, cfg.map.feeReceivable, '', -adj); E.addNet(net, cfg.map.badDebt, '', off); E.addNet(net, cfg.map.concessions, '', adj - off); }
      return net;
    },
  },
  fee_payment: {
    label: 'Fee payments', model: FeePayment, dateOf: (d) => d.receivedAt, no: (d) => d.receiptNo || '', memo: (d) => `Fee payment ${d.receiptNo || ''}`.trim(),
    target(d, cfg) {
      const net = {}; if (d.status !== 'Confirmed') return net;
      const cash = Math.round(d.amount - (d.refunded || 0)); const allocated = Math.round((d.allocations || []).reduce((s, a) => s + (a.amount || 0), 0));
      E.addNet(net, cashCode(cfg, d.method), '', cash); E.addNet(net, cfg.map.feeReceivable, '', -allocated); E.addNet(net, cfg.map.feeAdvance, '', -(cash - allocated));
      return net;
    },
  },
  payroll: {
    label: 'Pay runs', model: PayrollBatch, dateOf: (d) => d.finalizedAt, no: (d) => `${d.period} v${d.version}`, memo: (d) => `Pay run ${d.period}`,
    target(d, cfg) {
      const net = {}; if (d.status !== 'Finalized') return net;
      let gross = 0; let tax = 0; let advance = 0; let pay = 0;
      for (const l of d.lines || []) { gross += Math.round(l.gross || 0); tax += Math.round(l.tax || 0); advance += Math.round(l.advance || 0); pay += Math.round(l.net || 0); }
      const other = gross - tax - advance - pay;
      E.addNet(net, cfg.map.salaries, '', gross); E.addNet(net, cfg.map.salariesPayable, '', -pay); E.addNet(net, cfg.map.taxPayable, '', -tax); E.addNet(net, cfg.map.staffAdvances, '', -advance); E.addNet(net, cfg.map.deductionsPayable, '', -other);
      return net;
    },
  },
  advance: {
    label: 'Staff advances', model: StaffAdvance, dateOf: (d) => d.decidedAt || d.createdAt, no: () => '', memo: (d) => 'Staff advance paid out',
    target(d, cfg) { const net = {}; if (!['Active', 'Cleared'].includes(d.status)) return net; E.addNet(net, cfg.map.staffAdvances, '', Math.round(d.amount)); E.addNet(net, cfg.map.cash, '', -Math.round(d.amount)); return net; },
  },
  bill: {
    label: 'Supplier bills', model: PcInvoice, dateOf: (d) => d.approvedAt || d.createdAt, no: (d) => d.billNo || d.invoiceNo, memo: (d) => `Supplier bill ${d.billNo || d.invoiceNo} (${d.vendorName || 'supplier'})`,
    async prepare(docs, ctx) {
      const ids = [...new Set(docs.map((d) => String(d.orderId)).filter(Boolean))]; ctx.orders = new Map((await PcOrder.find({ schoolId: ctx.oid, _id: { $in: ids } }).lean()).map((o) => [String(o._id), o]));
      const funds = await AcFund.find({ schoolId: ctx.oid, pcFundId: { $ne: null } }).lean(); ctx.fundOfPc = new Map(funds.map((f) => [f.pcFundId, String(f._id)]));
    },
    target(d, cfg, ctx) {
      const net = {}; if (!['approved', 'paid'].includes(d.status)) return net;
      const o = ctx.orders.get(String(d.orderId)) || {}; const amount = Math.round(d.amount - (d.creditTotal || 0)); if (amount <= 0) return net;
      const capital = (cfg.capitalCategories || []).includes(o.category); const code = capital ? cfg.map.fixedAssets : (cfg.categoryMap[o.category] || cfg.map.suppliesDefault);
      const fund = o.fundId ? (ctx.fundOfPc.get(String(o.fundId)) || '') : '';
      E.addNet(net, code, fund, amount); E.addNet(net, cfg.map.ap, '', -amount); return net;
    },
  },
  bill_payment: {
    label: 'Supplier payments', model: PcInvoice, dateOf: (d) => d.pay?.paidOn || d.updatedAt, no: (d) => d.billNo || d.invoiceNo, memo: (d) => `Paid supplier bill ${d.billNo || d.invoiceNo}`, keyOf: (d) => `billpay:${d._id}`,
    target(d, cfg) {
      const net = {}; if (d.status !== 'paid') return net; const amount = Math.round(d.amount - (d.creditTotal || 0)); if (amount <= 0) return net;
      E.addNet(net, cfg.map.ap, '', amount); E.addNet(net, d.pay?.method === 'cash' ? cfg.map.cash : cfg.map.bank, '', -amount); return net;
    },
  },
  store_sale: {
    label: 'Store sales', model: StSale, dateOf: (d) => d.paidAt || d.createdAt, no: (d) => d.receiptNo || d.orderNo || '', memo: (d) => `Store sale ${d.receiptNo || d.orderNo || ''}`.trim(),
    target(d, cfg) {
      const net = {}; if (!['paid', 'partly_refunded', 'refunded'].includes(d.status)) return net;
      const n = Math.round((d.total || 0) - (d.refundedTotal || 0)); E.addNet(net, cashCode(cfg, d.method), '', n); E.addNet(net, cfg.map.incomeStore, '', -n); return net;
    },
  },
};
const keyFor = (name, d) => (feeds[name].keyOf ? feeds[name].keyOf(d) : `${name}:${d._id}`);

/* ───────── apply one target ───────── */
async function applyTarget(schoolId, cfg, accounts, item) {
  const target = item.net;
  const total = Object.values(target).reduce((s, v) => s + v, 0);
  if (total !== 0) return { state: 'held', reason: `${item.memo}: the posting does not balance.` };
  const sid = S.oid(schoolId); const src = await AcSource.findOne({ schoolId: sid, key: item.key });
  if (!src && Object.keys(target).length === 0) return { state: 'skipped' };
  if (!src && item.date < cfg.startDate) return { state: 'skipped' };
  const posted = src ? src.net || {} : {}; const lines = E.deltaLines(target, posted);
  if (!lines.length) return { state: 'same' };
  for (const l of lines) {
    const a = accounts.get(l.code);
    if (!a || !a.active) return { state: 'held', reason: `${item.memo}: account ${l.code} is missing or switched off. Fix the account under Settings, then run the feeds again.` };
  }
  const first = !src; const wanted = first ? item.date : item.today; const when = await L.openDateFrom(schoolId, wanted < cfg.startDate ? cfg.startDate : wanted);
  const rev = (src ? src.rev : 0) + 1; const sourceKey = `${item.key}#${rev}`;
  let j;
  try {
    j = await S.numbered(AcJournal, schoolId, 'number', 'JE', {
      date: when.date, ym: when.ym, type: 'system', status: 'draft', memo: `${item.memo}${first ? '' : ' (change)'}`.slice(0, 300), reference: item.refNo || '',
      lines: lines.map((l) => ({ ...l, memo: '' })), totalDebit: lines.reduce((s, l) => s + l.debit, 0), totalCredit: lines.reduce((s, l) => s + l.credit, 0),
      sourceType: item.kind, sourceId: item.refId, sourceKey, shifted: when.shifted, preparedByName: 'Automatic posting', trail: [S.trail(SYSTEM, 'made from the source record')],
    });
  } catch (e) {
    if (!S.isDup(e)) throw e;
    j = await AcJournal.findOne({ sourceKey });                                  // an earlier run made it; adopt it
    if (!j) throw e;
  }
  if (j.status === 'draft') { try { j = await L.post({ schoolId, actor: SYSTEM, role: 'system' }, j, { system: true }); } catch (e) { if (e instanceof S.Fail) { if (e.code === 409) return { state: 'same' }; return { state: 'held', reason: `${item.memo}: ${e.message}` }; } throw e; } }
  else if (j.status === 'posting') await L.finishStuck(schoolId);
  const next = { ...posted }; for (const l of j.lines) { const k = E.keyOfLine(l.code, l.fundId); next[k] = (next[k] || 0) + l.debit - l.credit; if (!next[k]) delete next[k]; }
  if (first) { try { await AcSource.create({ schoolId: sid, key: item.key, kind: item.kind, refId: item.refId, refNo: item.refNo || '', net: next, rev, lastJournalNo: j.number }); } catch (e) { if (!S.isDup(e)) throw e; } }
  else await AcSource.updateOne({ _id: src._id, rev: src.rev }, { $set: { net: next, rev, lastJournalNo: j.number, refNo: item.refNo || src.refNo } });
  return { state: first ? 'posted' : 'changed', journal: j.number };
}

/* ───────── running the feeds ───────── */
// full = look at every record again (used by the nightly run); otherwise only records changed since the last run.
async function run(schoolId, { full = false, only = null } = {}) {
  const { settings: cfg, ready } = await S.getCfg(schoolId);
  if (!ready) return { ready: false, posted: 0, changed: 0, held: [], scanned: 0 };
  const accounts = await L.accountsOf(schoolId); const state = await S.getState(schoolId); const cursors = { ...(state.cursors || {}) };
  const school = await School.findById(schoolId).select('timezone'); const tz = school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC';
  const dayOf = (d) => (d ? nowInTz(tz, new Date(d)).dateKey : '');
  const today = nowInTz(tz).dateKey; const sid = S.oid(schoolId); const out = { ready: true, posted: 0, changed: 0, same: 0, skipped: 0, scanned: 0, held: [], byFeed: {} };
  await syncFunds(schoolId);
  for (const name of Object.keys(feeds)) {
    if (only && only !== name) continue;
    const f = feeds[name]; const cursorKey = name;
    const since = full || !cursors[cursorKey] ? new Date(`${cfg.startDate}T00:00:00Z`) : new Date(new Date(cursors[cursorKey]).getTime() - OVERLAP_MS);
    let after = since; let latest = cursors[cursorKey] ? new Date(cursors[cursorKey]) : since; const counts = { posted: 0, changed: 0, same: 0, skipped: 0, held: 0 };
    for (let page = 0; page < 200; page += 1) {
      const docs = await f.model.find({ schoolId: sid, updatedAt: { $gte: after } }).sort({ updatedAt: 1 }).limit(BATCH).lean();
      if (!docs.length) break;
      const ctx = { oid: sid }; if (f.prepare) await f.prepare(docs, ctx);
      for (const d of docs) {
        out.scanned += 1;
        try {
          const res = await applyTarget(schoolId, cfg, accounts, { key: keyFor(name, d), kind: name, refId: String(d._id), refNo: f.no(d), memo: f.memo(d), net: f.target(d, cfg, ctx), date: dayOf(f.dateOf(d)), today });
          counts[res.state] = (counts[res.state] || 0) + 1; if (res.state === 'held') out.held.push({ feed: name, refId: String(d._id), text: res.reason });
        } catch (e) { console.error(`accounts feed ${name}:`, e.message); counts.held += 1; out.held.push({ feed: name, refId: String(d._id), text: `${f.memo(d)}: ${e.message}` }); }
        if (d.updatedAt && new Date(d.updatedAt) > latest) latest = new Date(d.updatedAt);
      }
      if (docs.length < BATCH) break;
      const last = new Date(docs[docs.length - 1].updatedAt); if (last.getTime() === after.getTime()) { after = new Date(after.getTime() + 1); } else after = last;
    }
    cursors[cursorKey] = latest.toISOString(); out.byFeed[name] = counts;
    for (const k of ['posted', 'changed', 'same', 'skipped']) out[k] += counts[k] || 0;
  }
  out.finished = await L.finishStuck(schoolId);
  await S.putState(schoolId, { ...state, cursors, lastRunAt: new Date().toISOString(), lastRun: { posted: out.posted, changed: out.changed, scanned: out.scanned, heldCount: out.held.length }, held: out.held.slice(0, 100) });
  return out;
}

// The purchasing funds of E19 appear as ledger funds, so a bill paid from a grant is charged to that grant.
async function syncFunds(schoolId) {
  const sid = S.oid(schoolId); const pcs = await PcFund.find({ schoolId: sid }).lean(); if (!pcs.length) return 0;
  const have = new Set((await AcFund.find({ schoolId: sid, pcFundId: { $ne: null } }).select('pcFundId').lean()).map((f) => f.pcFundId)); let made = 0;
  for (const p of pcs) {
    if (have.has(String(p._id))) continue;
    const kind = p.kind === 'grant' ? 'grant' : p.kind === 'general' ? 'unrestricted' : 'restricted';
    try {
      await AcFund.create({
        schoolId: sid, name: `${p.name} (purchasing)`.slice(0, 120), kind, donor: p.donor || '', reference: p.reference || '', purpose: p.purpose || '', allowedCodes: [], pcFundId: String(p._id),
        validFrom: p.validFrom ? new Date(p.validFrom).toISOString().slice(0, 10) : '', validTo: p.validTo ? new Date(p.validTo).toISOString().slice(0, 10) : '', status: p.status === 'closed' ? 'closed' : 'active', createdByName: 'Linked from purchasing',
        history: [{ at: new Date(), byName: 'Automatic', action: 'linked', note: `from purchasing fund ${p.name}` }],
      }); made += 1;
    } catch (e) { if (!S.isDup(e)) throw e; }
  }
  return made;
}

// A rough opening position for the day the ledger starts, to help fill the opening balance journal.
async function openingSuggestion(schoolId, startDate) {
  const sid = S.oid(schoolId); const before = new Date(`${startDate}T00:00:00Z`); const out = { feeReceivable: 0, feeAdvance: 0, note: 'Worked out from the fee records as they stand now: invoices issued before the start date, less what was allocated to them before it. Check it against your own books.' };
  const invs = await FeeInvoice.find({ schoolId: sid, issueDate: { $lt: before }, status: { $ne: 'Void' } }).select('total adjusted _id').lean();
  const ids = new Set(invs.map((i) => String(i._id))); let paidBefore = 0;
  if (ids.size) {
    const pays = await FeePayment.find({ schoolId: sid, status: 'Confirmed' }).select('allocations').lean();
    pays.forEach((p) => (p.allocations || []).forEach((a) => { if (ids.has(String(a.invoiceId)) && new Date(a.at) < before) paidBefore += a.amount || 0; }));
  }
  out.feeReceivable = Math.max(0, invs.reduce((s, i) => s + (i.total || 0) - (i.adjusted || 0), 0) - paidBefore);
  const adv = await FeePayment.find({ schoolId: sid, status: 'Confirmed', receivedAt: { $lt: before } }).select('amount refunded allocations').lean();
  out.feeAdvance = Math.max(0, adv.reduce((s, p) => s + (p.amount - (p.refunded || 0) - (p.allocations || []).reduce((x, a) => x + (a.amount || 0), 0)), 0));
  return out;
}

module.exports = { feeds, run, applyTarget, syncFunds, openingSuggestion, BATCH };
