// Requests, quotes, purchase orders, goods received and supplier bills (PRD E19).
const S = require('./service');
const F = require('./funding');
const PcRequisition = require('../../models/PcRequisition'); const PcOrder = require('../../models/PcOrder'); const PcOrderLine = require('../../models/PcOrderLine');
const PcReceipt = require('../../models/PcReceipt'); const PcInvoice = require('../../models/PcInvoice'); const PcVendor = require('../../models/PcVendor'); const PcBudgetLine = require('../../models/PcBudgetLine');
const PcProject = require('../../models/PcProject');
const { Fail, E, oid, clean, num, day, optDay, key, trail, money } = S;
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60);
const refOf = (type, d, no) => ({ type, id: d._id, no, note: '' });
const mine = (ctx, r) => String(r.requesterId) === String(ctx.actor.id);

/* ───────── requests ───────── */
function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Fail(422, 'Add at least one item to the request.'); if (items.length > 60) throw new Fail(422, 'A request can have up to 60 lines.');
  const out = items.map((i) => { const description = clean(i.description, 200); if (!description) throw new Fail(422, 'Every line needs a description.'); const qty = num(i.qty, 'The quantity', { min: 1, max: 100000 }); const unitPrice = num(i.unitPrice, 'The price', { min: 0 }); return { description, qty, unit: clean(i.unit, 20), unitPrice, amount: qty * unitPrice }; });
  const total = out.reduce((s, i) => s + i.amount, 0); if (!(total > 0)) throw new Fail(422, 'The request must be worth more than nothing.'); return { items: out, total };
}
// The budget line for this cost centre and category in the year the request is for. A project brings its own.
async function resolveFunding(ctx, b, cfg, onDay) {
  let { budgetLineId, fundId, projectId } = b; const out = {};
  if (projectId) { const p = oid(projectId) ? await PcProject.findOne({ _id: projectId, schoolId: ctx.schoolId }) : null; if (!p) throw new Fail(422, 'That project is not in your school.'); out.projectId = p._id; budgetLineId = budgetLineId || p.budgetLineId; fundId = fundId || p.fundId; }
  const year = E.fiscalYear(onDay, cfg.fiscalYearStartMonth);
  if (!budgetLineId && b.costCentre && b.category) { const l = await PcBudgetLine.findOne({ schoolId: ctx.schoolId, costCentre: b.costCentre, category: b.category, year }); if (l) budgetLineId = l._id; }
  if (budgetLineId) { const l = oid(budgetLineId) ? await PcBudgetLine.findOne({ _id: budgetLineId, schoolId: ctx.schoolId }) : null; if (!l) throw new Fail(422, 'That budget line is not in your school.'); out.budgetLineId = l._id; out.year = l.year; }
  if (fundId) out.fundId = oid(fundId); return out;
}
async function createReq(ctx, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const title = clean(b.title, 160); if (!title) throw new Fail(422, 'Say what the request is for.');
  const costCentre = clean(b.costCentre, 60); if (!cfg.costCentres.includes(costCentre)) throw new Fail(422, 'Choose a cost centre from the list.'); const category = clean(b.category, 60); if (!cfg.categories.includes(category)) throw new Fail(422, 'Choose a spending category.');
  const { items, total } = cleanItems(b.items); const t = await S.today(ctx.schoolId); const fund = await resolveFunding(ctx, { ...b, costCentre, category }, cfg, t);
  return S.numbered(PcRequisition, ctx.schoolId, 'reqNo', 'REQ', { title, requesterId: ctx.actor.id, requesterName: ctx.actor.name || '', requesterRole: ctx.role, costCentre, category, items, total, justification: clean(b.justification, 600), neededBy: optDay(b.neededBy, 'the date it is needed'), year: fund.year || E.fiscalYear(t, cfg.fiscalYearStartMonth), budgetLineId: fund.budgetLineId || null, fundId: fund.fundId || null, projectId: fund.projectId || null, trail: [trail(ctx.actor, 'created')] });
}
async function mustHave(ctx, id) { const r = oid(id) ? await PcRequisition.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!r) throw new Fail(404, 'That request is not in your school.'); return r; }
async function updateReq(ctx, id, b, officer) {
  const r = await mustHave(ctx, id); if (!officer && !mine(ctx, r)) throw new Fail(403, 'That is someone else’s request.'); if (r.status !== 'draft') throw new Fail(409, `A ${r.status} request cannot be edited.`);
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const $set = {}; const merged = { ...plain(r), ...b };
  if (b.title !== undefined) { $set.title = clean(b.title, 160); if (!$set.title) throw new Fail(422, 'Say what the request is for.'); }
  if (b.costCentre !== undefined) { if (!cfg.costCentres.includes(b.costCentre)) throw new Fail(422, 'Choose a cost centre from the list.'); $set.costCentre = b.costCentre; }
  if (b.category !== undefined) { if (!cfg.categories.includes(b.category)) throw new Fail(422, 'Choose a spending category.'); $set.category = b.category; }
  if (b.items !== undefined) { const c = cleanItems(b.items); $set.items = c.items; $set.total = c.total; }
  if (b.justification !== undefined) $set.justification = clean(b.justification, 600); if (b.neededBy !== undefined) $set.neededBy = optDay(b.neededBy, 'the date it is needed');
  const fund = await resolveFunding(ctx, { costCentre: merged.costCentre, category: merged.category, budgetLineId: b.budgetLineId, fundId: b.fundId === undefined ? r.fundId : b.fundId, projectId: b.projectId === undefined ? r.projectId : b.projectId }, cfg, await S.today(ctx.schoolId));
  $set.budgetLineId = fund.budgetLineId || null; $set.fundId = fund.fundId || null; $set.projectId = fund.projectId || null; if (fund.year) $set.year = fund.year;
  await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: 'draft' }, { $set, $push: { trail: trail(ctx.actor, 'edited') } }); return { ok: true };
}
async function addQuote(ctx, id, b) {
  const r = await mustHave(ctx, id); if (!['draft', 'submitted'].includes(r.status)) throw new Fail(409, 'Quotes are collected before a request is approved.');
  const v = oid(b.vendorId) ? await PcVendor.findOne({ _id: b.vendorId, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(422, 'Choose a supplier from the directory.'); if (v.status !== 'active') throw new Fail(422, `${v.name} is blocked.`);
  if (r.quotes.some((q) => String(q.vendorId) === String(v._id))) throw new Fail(409, `${v.name} already has a quote on this request.`);
  const q = { key: `q${(r.quotes.length ? Math.max(...r.quotes.map((x) => Number(String(x.key).slice(1)))) : 0) + 1}`, vendorId: v._id, vendorName: v.name, amount: num(b.amount, 'The quoted amount', { min: 1 }), validTo: optDay(b.validTo, 'the date the quote is valid to'), note: clean(b.note, 300), receivedAt: new Date(), byName: ctx.actor.name || '' };
  const done = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: { $in: ['draft', 'submitted'] } }, { $push: { quotes: q, trail: trail(ctx.actor, 'quote', `${v.name}: ${money(q.amount)}`) } }); if (!done.matchedCount) throw new Fail(409, 'That request has just changed.'); return { ok: true, quote: q };
}
async function removeQuote(ctx, id, qk) {
  const r = await mustHave(ctx, id); if (!['draft', 'submitted'].includes(r.status)) throw new Fail(409, 'Quotes can be removed before approval.'); if (!r.quotes.some((q) => q.key === qk)) throw new Fail(404, 'That quote is not on the request.');
  await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: { $in: ['draft', 'submitted'] } }, { $set: { quotes: r.quotes.filter((q) => q.key !== qk).map(plain), ...(r.chosenQuote === qk ? { chosenQuote: '', chosenVendorId: null, chosenReason: '' } : {}) }, $push: { trail: trail(ctx.actor, 'quote removed') } }); return { ok: true };
}
async function chooseQuote(ctx, id, { quoteKey, reason = '' }) {
  const r = await mustHave(ctx, id); if (!['draft', 'submitted', 'approved'].includes(r.status)) throw new Fail(409, 'That request is past choosing a quote.'); const q = r.quotes.find((x) => x.key === quoteKey); if (!q) throw new Fail(404, 'That quote is not on the request.');
  const lowest = Math.min(...r.quotes.map((x) => x.amount)); if (q.amount > lowest && clean(reason, 300).length < 5) throw new Fail(422, 'That is not the lowest quote. Write why it was chosen.');
  await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: r.status }, { $set: { chosenQuote: q.key, chosenVendorId: q.vendorId, chosenReason: q.amount > lowest ? clean(reason, 300) : '' }, $push: { trail: trail(ctx.actor, 'quote chosen', q.vendorName) } }); return { ok: true };
}
async function submitReq(ctx, id, b = {}, officer = false) {
  const r = await mustHave(ctx, id); if (!officer && !mine(ctx, r)) throw new Fail(403, 'That is someone else’s request.'); if (r.status !== 'draft') throw new Fail(409, `That request is already ${r.status}.`);
  const cfg = (await S.getCfg(ctx.schoolId)).settings; if (!r.budgetLineId) throw new Fail(422, `There is no approved ${r.costCentre} budget line for ${r.category} in ${r.year}. Ask the office to set one up, or choose a budget line.`, { reason: 'budget' });
  await F.check(ctx, { lineId: r.budgetLineId, fundId: r.fundId, projectId: r.projectId, category: r.category, at: await S.today(ctx.schoolId), amount: r.total });
  const rule = E.quoteRule(r.total, r.quotes, cfg); const sole = clean(b.soleSourceReason, 300);
  if (!rule.ok && sole.length < 10) throw new Fail(422, `A request of ${money(r.total)} or more needs ${rule.need} quotes (${rule.have} so far). Add quotes, or explain why there can be only one supplier.`, { reason: 'quotes', need: rule.need, have: rule.have });
  if (r.quotes.length && !r.chosenQuote) throw new Fail(422, 'Choose the quote you recommend.', { reason: 'quotes' });
  const levels = E.levelsFor(r.total, cfg); const done = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: 'draft' }, { $set: { status: 'submitted', levels, step: 0, approvals: [], soleSourceReason: rule.ok ? '' : sole }, $push: { trail: trail(ctx.actor, 'submitted', rule.ok ? '' : `One supplier: ${sole}`) } });
  if (!done.matchedCount) throw new Fail(409, 'That request has just changed.'); await S.tellAdmins(ctx.schoolId, 'Purchase request to approve', `${r.reqNo}: ${r.title} (${money(r.total)}) from ${r.requesterName}.`, '/admin#/purchasing', ctx.actor.id); return { ok: true, levels };
}
const targetsOf = (d) => ({ lineId: d.budgetLineId, fundId: d.fundId, projectId: d.projectId });
async function decideReq(ctx, id, { approve, note = '' }) {
  const r = await mustHave(ctx, id); if (r.status !== 'submitted') throw new Fail(409, `That request is ${r.status}, not waiting for a decision.`);
  const alone = await S.separate(ctx, r.requesterId, 'A purchase request'); const dup = r.approvals.some((a) => String(a.byId) === String(ctx.actor.id));
  if (dup && !alone) throw new Fail(403, 'A large request needs two different approvers.', { reason: 'maker_checker' });
  if (!approve) {
    if (clean(note, 300).length < 5) throw new Fail(422, 'Write why the request is turned down.');
    const done = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: 'submitted', step: r.step }, { $set: { status: 'rejected', decisionNote: clean(note, 300) }, $push: { trail: trail(ctx.actor, 'rejected', note) } }); if (!done.matchedCount) throw new Fail(409, 'That request has just been decided.');
    await S.tellPerson(ctx.schoolId, r.requesterId, r.requesterRole === 'admin' ? 'admin' : 'teacher', 'Purchase request turned down', `${r.reqNo}: ${clean(note, 160)}`, r.requesterRole === 'admin' ? '/admin#/purchasing' : '/teacher#/purchasing'); return { ok: true, status: 'rejected' };
  }
  const entry = { byId: ctx.actor.id, byName: ctx.actor.name || '', at: new Date(), note: clean(note, 300) }; const final = r.step + 1 >= r.levels;
  if (!final) {
    const done = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: 'submitted', step: r.step }, { $set: { step: r.step + 1 }, $push: { approvals: entry, trail: trail(ctx.actor, 'approved (first of two)', note) } }); if (!done.matchedCount) throw new Fail(409, 'That request has just been decided.');
    await S.tellAdmins(ctx.schoolId, 'Second approval needed', `${r.reqNo}: ${r.title} (${money(r.total)}) has one approval and needs another.`, '/admin#/purchasing', ctx.actor.id); return { ok: true, status: 'submitted', waitingFor: 'a second approver' };
  }
  const claimed = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: 'submitted', step: r.step }, { $set: { status: 'approved', step: r.step + 1, sole: !!alone, committedAmount: r.total }, $push: { approvals: entry, trail: trail(ctx.actor, 'approved', note) } }); if (!claimed.matchedCount) throw new Fail(409, 'That request has just been decided.');
  const back = async () => PcRequisition.updateOne({ _id: r._id }, { $set: { status: 'submitted', step: r.step, committedAmount: 0, approvals: r.approvals.map(plain) } });
  try { await F.check(ctx, { ...targetsOf(r), category: r.category, at: await S.today(ctx.schoolId), amount: r.total }); await F.commit(ctx, targetsOf(r), r.total, refOf('requisition', r, r.reqNo)); } catch (e) { await back(); throw e; }
  await S.tellPerson(ctx.schoolId, r.requesterId, r.requesterRole === 'admin' ? 'admin' : 'teacher', 'Purchase request approved', `${r.reqNo}: ${r.title} is approved. ${money(r.total)} is set aside.`, r.requesterRole === 'admin' ? '/admin#/purchasing' : '/teacher#/purchasing'); return { ok: true, status: 'approved' };
}
async function cancelReq(ctx, id, { reason = '' }, officer) {
  const r = await mustHave(ctx, id); if (!officer && !mine(ctx, r)) throw new Fail(403, 'That is someone else’s request.'); if (!['draft', 'submitted', 'approved'].includes(r.status)) throw new Fail(409, `A ${r.status} request cannot be cancelled here.`); if (clean(reason, 300).length < 5) throw new Fail(422, 'Write why the request is being cancelled.');
  const done = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: r.status }, { $set: { status: 'cancelled', committedAmount: 0, decisionNote: clean(reason, 300) }, $push: { trail: trail(ctx.actor, 'cancelled', reason) } }); if (!done.matchedCount) throw new Fail(409, 'That request has just changed.');
  if (r.status === 'approved' && r.committedAmount > 0) await F.release(ctx, targetsOf(r), r.committedAmount, refOf('requisition', r, r.reqNo)); return { ok: true };
}
async function listReqs(ctx, q, officer) {
  const { limit, skip, page } = S.pg(q); const f = { schoolId: ctx.schoolId }; if (!officer || q.mine === '1') f.requesterId = ctx.actor.id; if (q.status) f.status = q.status; if (q.costCentre) f.costCentre = q.costCentre; if (q.projectId && oid(q.projectId)) f.projectId = q.projectId;
  if (q.q) { const re = new RegExp(esc(q.q), 'i'); f.$or = [{ title: re }, { reqNo: re }, { requesterName: re }]; }
  const [rows, total] = await Promise.all([PcRequisition.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), PcRequisition.countDocuments(f)]); return { rows: rows.map(plain), total, page, limit };
}
async function reqDetail(ctx, id, officer) {
  const r = await mustHave(ctx, id); if (!officer && !mine(ctx, r)) throw new Fail(403, 'That is someone else’s request.');
  const [line, order] = await Promise.all([r.budgetLineId ? PcBudgetLine.findOne({ _id: r.budgetLineId, schoolId: ctx.schoolId }) : null, r.orderId ? PcOrder.findOne({ _id: r.orderId, schoolId: ctx.schoolId }) : null]);
  const cfg = (await S.getCfg(ctx.schoolId)).settings; return { requisition: plain(r), line: line ? plain(line) : null, order: order ? plain(order) : null, rule: E.quoteRule(r.total, r.quotes, cfg) };
}

/* ───────── orders ───────── */
async function issueOrder(ctx, reqId, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const r = await mustHave(ctx, reqId); if (r.status !== 'approved') throw new Fail(409, r.status === 'ordered' ? 'That request already has an order.' : `A ${r.status} request cannot be ordered.`);
  const vendorId = r.chosenVendorId || b.vendorId; const v = oid(vendorId) ? await PcVendor.findOne({ _id: vendorId, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(422, 'Choose the supplier for this order.'); if (v.status !== 'active') throw new Fail(422, `${v.name} is blocked.`);
  if (r.chosenVendorId && b.vendorId && String(b.vendorId) !== String(r.chosenVendorId) && clean(b.vendorReason, 300).length < 5) throw new Fail(422, 'That is not the supplier the request recommended. Write why.');
  const src = Array.isArray(b.lines) && b.lines.length ? b.lines : r.items.map(plain); const { items, total: subtotal } = cleanItems(src); const tax = b.tax === undefined || b.tax === '' ? 0 : num(b.tax, 'The tax', { min: 0 }); const total = subtotal + tax;
  const tol = E.tolerance(r.committedAmount, cfg); if (total > r.committedAmount + tol) throw new Fail(422, `The order is ${money(total)}, more than the ${money(r.committedAmount)} that was approved (the tolerance is ${cfg.tolerancePercent}%). Raise a new request or ask for a budget variation.`, { reason: 'over_approved' });
  const claimed = await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId, status: 'approved' }, { $set: { status: 'ordered' } }); if (!claimed.matchedCount) throw new Fail(409, 'That request has just been ordered by someone else.');
  let order = null; const t = targetsOf(r);
  try {
    if (total > r.committedAmount) { await F.check(ctx, { ...t, category: r.category, at: await S.today(ctx.schoolId), amount: total - r.committedAmount }); await F.commit(ctx, t, total - r.committedAmount, refOf('requisition', r, r.reqNo)); }
    else if (total < r.committedAmount) await F.release(ctx, t, r.committedAmount - total, refOf('requisition', r, r.reqNo));
  } catch (e) { await PcRequisition.updateOne({ _id: r._id }, { $set: { status: 'approved' } }); throw e; }
  try {
    order = await S.numbered(PcOrder, ctx.schoolId, 'poNo', 'PO', { requisitionId: r._id, vendorId: v._id, vendorName: v.name, title: r.title, costCentre: r.costCentre, category: r.category, budgetLineId: r.budgetLineId, fundId: r.fundId, projectId: r.projectId, subtotal, tax, total, committedLeft: total, expectedOn: optDay(b.expectedOn, 'the expected delivery date'), terms: clean(b.terms, 500), issuedById: ctx.actor.id, issuedByName: ctx.actor.name || '', trail: [trail(ctx.actor, 'issued', v.name)] });
    for (let i = 0; i < items.length; i += 1) await PcOrderLine.create({ schoolId: ctx.schoolId, orderId: order._id, n: i + 1, description: items[i].description, qty: items[i].qty, unit: items[i].unit, unitPrice: items[i].unitPrice, amount: items[i].amount, receivable: items[i].qty + Math.floor(items[i].qty * cfg.tolerancePercent / 100) });
  } catch (e) {
    if (order) { await PcOrderLine.deleteMany({ schoolId: ctx.schoolId, orderId: order._id }); await PcOrder.deleteOne({ _id: order._id, schoolId: ctx.schoolId }); }
    try { if (total > r.committedAmount) await F.release(ctx, t, total - r.committedAmount, refOf('requisition', r, r.reqNo)); else if (total < r.committedAmount) await F.commit(ctx, t, r.committedAmount - total, refOf('requisition', r, r.reqNo)); } catch (x) { /* the reconcile report shows it */ }
    await PcRequisition.updateOne({ _id: r._id }, { $set: { status: 'approved' } }); throw e;
  }
  await PcRequisition.updateOne({ _id: r._id, schoolId: ctx.schoolId }, { $set: { orderId: order._id, committedAmount: 0 }, $push: { trail: trail(ctx.actor, 'ordered', order.poNo) } }); return order;
}
async function mustOrder(ctx, id) { const o = oid(id) ? await PcOrder.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!o) throw new Fail(404, 'That order is not in your school.'); return o; }
async function cancelOrder(ctx, id, { reason = '' }) {
  const o = await mustOrder(ctx, id); if (o.status !== 'issued') throw new Fail(409, o.status === 'cancelled' ? 'That order is already cancelled.' : 'Goods have arrived on that order. Close it instead.'); if (clean(reason, 300).length < 5) throw new Fail(422, 'Write why the order is being cancelled.');
  if (await PcInvoice.countDocuments({ schoolId: ctx.schoolId, orderId: o._id, status: { $in: ['entered', 'approved', 'paid'] } })) throw new Fail(409, 'There are bills on that order. Void them first.');
  const done = await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId, status: 'issued', committedLeft: o.committedLeft }, { $set: { status: 'cancelled', committedLeft: 0, cancelReason: clean(reason, 300), closedAt: new Date() }, $push: { trail: trail(ctx.actor, 'cancelled', reason) } }); if (!done.matchedCount) throw new Fail(409, 'That order has just changed.');
  await F.release(ctx, targetsOf(o), o.committedLeft, refOf('order', o, o.poNo)); await PcRequisition.updateOne({ _id: o.requisitionId, schoolId: ctx.schoolId }, { $set: { status: 'cancelled', decisionNote: `Order ${o.poNo} cancelled: ${clean(reason, 200)}` } }); return { ok: true };
}
async function closeOrder(ctx, id, { reason = '' }) {
  const o = await mustOrder(ctx, id); if (!['issued', 'part_received', 'received'].includes(o.status)) throw new Fail(409, `That order is ${o.status}.`);
  const open = await PcInvoice.countDocuments({ schoolId: ctx.schoolId, orderId: o._id, status: { $in: ['entered', 'approved'] } }); if (open) throw new Fail(409, `${open} bill(s) on that order are not paid yet.`);
  const lines = await PcOrderLine.find({ schoolId: ctx.schoolId, orderId: o._id }); const complete = lines.every((l) => l.receivedQty >= l.qty);
  if ((!complete || o.paidTotal < o.total - E.tolerance(o.total, (await S.getCfg(ctx.schoolId)).settings)) && clean(reason, 300).length < 5) throw new Fail(422, 'Not everything has arrived and been paid for. Write why the order is being closed.');
  const done = await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId, status: o.status, committedLeft: o.committedLeft }, { $set: { status: 'closed', committedLeft: 0, closedAt: new Date() }, $push: { trail: trail(ctx.actor, 'closed', reason) } }); if (!done.matchedCount) throw new Fail(409, 'That order has just changed.');
  await F.release(ctx, targetsOf(o), o.committedLeft, refOf('order', o, o.poNo)); await PcRequisition.updateOne({ _id: o.requisitionId, schoolId: ctx.schoolId }, { $set: { status: 'closed' } }); return { ok: true, released: o.committedLeft };
}
async function receiveGoods(ctx, id, b) {
  const o = await mustOrder(ctx, id); if (!['issued', 'part_received'].includes(o.status)) throw new Fail(409, `That order is ${o.status}.`);
  const ck = clean(b.clientKey, 60); if (ck) { const again = await PcReceipt.findOne({ schoolId: ctx.schoolId, clientKey: ck }); if (again) return { ...plain(again), repeat: true }; }
  const asked = (Array.isArray(b.lines) ? b.lines : []).map((l) => ({ lineId: l.lineId, qty: num(l.qty ?? 0, 'The quantity', { min: 0, max: 100000 }), rejected: num(l.rejected ?? 0, 'The rejected quantity', { min: 0, max: 100000 }), note: clean(l.note, 200) })).filter((l) => l.qty > 0 || l.rejected > 0);
  if (!asked.length) throw new Fail(422, 'Enter how many of at least one line arrived.');
  const lines = await PcOrderLine.find({ schoolId: ctx.schoolId, orderId: o._id }); const done = []; let value = 0; const out = [];
  try {
    for (const a of asked) {
      const l = lines.find((x) => String(x._id) === String(a.lineId)); if (!l) throw new Fail(422, 'One of those lines is not on the order.');
      if (a.qty > 0) { const ok = await PcOrderLine.updateOne({ _id: l._id, schoolId: ctx.schoolId, receivable: { $gte: a.qty } }, { $inc: { receivedQty: a.qty, receivable: -a.qty, rejectedQty: a.rejected } }); if (!ok.matchedCount) throw new Fail(409, `Only ${(await PcOrderLine.findOne({ _id: l._id })).receivable} more of “${l.description}” can still arrive.`, { reason: 'over_receipt' }); }
      else await PcOrderLine.updateOne({ _id: l._id, schoolId: ctx.schoolId }, { $inc: { rejectedQty: a.rejected } });
      done.push(a); value += a.qty * l.unitPrice; out.push({ lineId: l._id, n: l.n, description: l.description, qty: a.qty, rejected: a.rejected, note: a.note });
    }
  } catch (e) { for (const d of done) await PcOrderLine.updateOne({ _id: d.lineId, schoolId: ctx.schoolId }, { $inc: { receivedQty: -d.qty, receivable: d.qty, rejectedQty: -d.rejected } }); throw e; }
  let grn; try { grn = await S.numbered(PcReceipt, ctx.schoolId, 'grnNo', 'GRN', { orderId: o._id, poNo: o.poNo, lines: out, value, note: clean(b.note, 300), receivedOn: optDay(b.receivedOn, 'the date it arrived') || await S.today(ctx.schoolId), ...(ck ? { clientKey: ck } : {}), byId: ctx.actor.id, byName: ctx.actor.name || '' }); }
  catch (e) { for (const d of done) await PcOrderLine.updateOne({ _id: d.lineId, schoolId: ctx.schoolId }, { $inc: { receivedQty: -d.qty, receivable: d.qty, rejectedQty: -d.rejected } }); if (S.isDup(e) && ck) { const again = await PcReceipt.findOne({ schoolId: ctx.schoolId, clientKey: ck }); if (again) return { ...plain(again), repeat: true }; } throw e; }
  const after = await PcOrderLine.find({ schoolId: ctx.schoolId, orderId: o._id }); const all = after.every((l) => l.receivedQty >= l.qty);
  await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId, status: { $in: ['issued', 'part_received'] } }, { $set: { status: all ? 'received' : 'part_received' }, $push: { trail: trail(ctx.actor, 'received', grn.grnNo) } }); return grn;
}
const receivedValueOf = (o, lines) => { const goods = lines.reduce((s, l) => s + l.receivedQty * l.unitPrice, 0); return o.subtotal > 0 ? Math.round(goods * o.total / o.subtotal) : 0; };

/* ───────── supplier bills ───────── */
async function enterInvoice(ctx, id, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const o = await mustOrder(ctx, id); if (o.status === 'cancelled') throw new Fail(409, 'That order was cancelled.');
  const invoiceNo = clean(b.invoiceNo, 60); if (!invoiceNo) throw new Fail(422, 'Give the supplier’s invoice number.'); const amount = num(b.amount, 'The bill amount', { min: 1 });
  const invoiceDate = day(b.invoiceDate, 'the invoice date'); const dueOn = optDay(b.dueOn, 'the due date'); if (dueOn && dueOn < invoiceDate) throw new Fail(422, 'The bill cannot fall due before its date.');
  const invoiceKey = key(invoiceNo); const twin = await PcInvoice.findOne({ schoolId: ctx.schoolId, vendorId: o.vendorId, invoiceKey }); if (twin) throw new Fail(409, `${o.vendorName} invoice ${invoiceNo} was already entered as ${twin.billNo}.`, { reason: 'duplicate' });
  const lines = await PcOrderLine.find({ schoolId: ctx.schoolId, orderId: o._id }); const rv = receivedValueOf(o, lines); const m = E.matchInvoice({ amount, orderTotal: o.total, invoicedBefore: o.invoicedTotal, receivedValue: rv }, cfg);
  if (m.match === 'over') throw new Fail(422, m.note, { reason: 'over_order' });
  const cas = await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId, invoicedTotal: o.invoicedTotal }, { $inc: { invoicedTotal: amount } }); if (!cas.matchedCount) throw new Fail(409, 'Another bill was entered on that order a moment ago. Try again.');
  try { return await S.numbered(PcInvoice, ctx.schoolId, 'billNo', 'BILL', { vendorId: o.vendorId, vendorName: o.vendorName, orderId: o._id, poNo: o.poNo, invoiceNo, invoiceKey, invoiceDate, dueOn, amount, tax: b.tax ? num(b.tax, 'The tax', { min: 0 }) : 0, documentRef: clean(b.documentRef, 200), note: clean(b.note, 300), match: m.match, matchNote: m.note, receivedValue: rv, orderBalance: m.orderBalance, enteredById: ctx.actor.id, enteredByName: ctx.actor.name || '', trail: [trail(ctx.actor, 'entered', m.match)] }); }
  catch (e) { await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId }, { $inc: { invoicedTotal: -amount } }); if (S.isDup(e)) throw new Fail(409, `${o.vendorName} invoice ${invoiceNo} was already entered.`, { reason: 'duplicate' }); throw e; }
}
async function mustBill(ctx, id) { const i = oid(id) ? await PcInvoice.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!i) throw new Fail(404, 'That bill is not in your school.'); return i; }
async function decideInvoice(ctx, id, { approve, note = '', exceptionReason = '' }) {
  const i = await mustBill(ctx, id); if (i.status !== 'entered') throw new Fail(409, `That bill is ${i.status}.`); const alone = await S.separate(ctx, i.enteredById, 'A supplier bill');
  if (!approve) {
    if (clean(note, 300).length < 5) throw new Fail(422, 'Write why the bill is turned down.');
    const done = await PcInvoice.updateOne({ _id: i._id, schoolId: ctx.schoolId, status: 'entered' }, { $set: { status: 'rejected' }, $unset: { invoiceKey: '' }, $push: { trail: trail(ctx.actor, 'rejected', note) } }); if (!done.matchedCount) throw new Fail(409, 'That bill has just been decided.');
    await PcOrder.updateOne({ _id: i.orderId, schoolId: ctx.schoolId }, { $inc: { invoicedTotal: -i.amount } }); return { ok: true, status: 'rejected' };
  }
  if (i.match === 'exception' && clean(exceptionReason, 400).length < 10) throw new Fail(422, `${i.matchNote} Write why it is being approved anyway.`, { reason: 'exception' });
  const done = await PcInvoice.updateOne({ _id: i._id, schoolId: ctx.schoolId, status: 'entered' }, { $set: { status: 'approved', approvedById: ctx.actor.id, approvedByName: ctx.actor.name || '', approvedAt: new Date(), exceptionReason: clean(exceptionReason, 400), sole: !!alone }, $push: { trail: trail(ctx.actor, 'approved', exceptionReason || note) } }); if (!done.matchedCount) throw new Fail(409, 'That bill has just been decided.'); return { ok: true, status: 'approved' };
}
const METHODS = ['bank_transfer', 'cheque', 'cash'];
async function payInvoice(ctx, id, b) {
  const i = await mustBill(ctx, id); if (i.status !== 'approved') throw new Fail(409, i.status === 'paid' ? 'That bill is already paid.' : `A ${i.status} bill cannot be paid.`);
  const method = b.method || 'bank_transfer'; if (!METHODS.includes(method)) throw new Fail(422, 'Choose bank transfer, cheque or cash.'); const reference = clean(b.reference, 80); if (method !== 'cash' && !reference) throw new Fail(422, 'Write the transfer or cheque reference.');
  const v = await PcVendor.findOne({ _id: i.vendorId, schoolId: ctx.schoolId }); if (!v) throw new Fail(404, 'The supplier is no longer in your school.'); if (v.status !== 'active') throw new Fail(409, `${v.name} is blocked.`, { reason: 'vendor' });
  if (method === 'bank_transfer') { if (v.pendingBank?.requestedAt) throw new Fail(409, 'The supplier’s bank details are waiting to be approved. Payment is held until then.', { reason: 'bank_hold' }); if (!v.bank?.accountNo) throw new Fail(409, 'The supplier has no approved bank account. Add one first.', { reason: 'bank_missing' }); }
  const paidOn = optDay(b.paidOn, 'the payment date') || await S.today(ctx.schoolId); const o = await mustOrder(ctx, i.orderId); const fromCommitted = Math.min(i.amount, o.committedLeft);
  const snap = method === 'bank_transfer' ? `${v.bank.bankName || 'Bank'} …${String(v.bank.accountNo).slice(-4)}` : method;
  const claimed = await PcInvoice.updateOne({ _id: i._id, schoolId: ctx.schoolId, status: 'approved' }, { $set: { status: 'paid', pay: { method, reference, paidOn, paidById: ctx.actor.id, paidByName: ctx.actor.name || '', bankSnapshot: snap } }, $push: { trail: trail(ctx.actor, 'paid', `${method} ${reference}`) } }); if (!claimed.matchedCount) throw new Fail(409, 'That bill has just been paid or changed.');
  try { await F.spend(ctx, targetsOf(o), i.amount, fromCommitted, refOf('bill', i, i.billNo)); } catch (e) { await PcInvoice.updateOne({ _id: i._id }, { $set: { status: 'approved' }, $unset: { pay: '' } }); throw e; }
  await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId }, { $inc: { committedLeft: -fromCommitted, paidTotal: i.amount } });
  const lines = await PcOrderLine.find({ schoolId: ctx.schoolId, orderId: o._id }); const left = await PcInvoice.countDocuments({ schoolId: ctx.schoolId, orderId: o._id, status: { $in: ['entered', 'approved'] } });
  if (!left && lines.every((l) => l.receivedQty >= l.qty)) { const fresh = await PcOrder.findOne({ _id: o._id, schoolId: ctx.schoolId }); const cfg = (await S.getCfg(ctx.schoolId)).settings; if (fresh.paidTotal >= fresh.total - E.tolerance(fresh.total, cfg)) { const c = await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId, committedLeft: fresh.committedLeft, status: { $in: ['received', 'part_received', 'issued'] } }, { $set: { status: 'closed', committedLeft: 0, closedAt: new Date() }, $push: { trail: trail(ctx.actor, 'closed', 'Received and paid') } }); if (c.matchedCount) { await F.release(ctx, targetsOf(o), fresh.committedLeft, refOf('order', o, o.poNo)); await PcRequisition.updateOne({ _id: o.requisitionId, schoolId: ctx.schoolId }, { $set: { status: 'closed' } }); } } }
  return { ok: true, paidOn };
}
async function voidInvoice(ctx, id, { reason = '' }) {
  const i = await mustBill(ctx, id); if (!['entered', 'approved'].includes(i.status)) throw new Fail(409, i.status === 'paid' ? 'A paid bill is corrected with a credit note.' : `That bill is ${i.status}.`); if (clean(reason, 300).length < 5) throw new Fail(422, 'Write why the bill is being voided.');
  const done = await PcInvoice.updateOne({ _id: i._id, schoolId: ctx.schoolId, status: i.status }, { $set: { status: 'void' }, $unset: { invoiceKey: '' }, $push: { trail: trail(ctx.actor, 'void', reason) } }); if (!done.matchedCount) throw new Fail(409, 'That bill has just changed.');
  await PcOrder.updateOne({ _id: i.orderId, schoolId: ctx.schoolId }, { $inc: { invoicedTotal: -i.amount } }); return { ok: true };
}
async function creditNote(ctx, id, { amount, reason = '' }) {
  const i = await mustBill(ctx, id); if (i.status !== 'paid') throw new Fail(409, 'A credit note is for a bill that has been paid.'); const a = num(amount, 'The credit', { min: 1 }); if (a > i.amount - i.creditTotal) throw new Fail(422, `Only ${money(i.amount - i.creditTotal)} of that bill can still be credited.`); if (clean(reason, 300).length < 5) throw new Fail(422, 'Write why the supplier is crediting this.');
  const o = await mustOrder(ctx, i.orderId); const done = await PcInvoice.updateOne({ _id: i._id, schoolId: ctx.schoolId, status: 'paid', creditTotal: i.creditTotal }, { $inc: { creditTotal: a }, $push: { credits: { amount: a, reason: clean(reason, 300), at: new Date(), byName: ctx.actor.name || '' }, trail: trail(ctx.actor, 'credit', `${money(a)}: ${reason}`) } }); if (!done.matchedCount) throw new Fail(409, 'That bill has just changed.');
  try { await F.move(ctx, targetsOf(o), { ds: -a }, refOf('bill', i, i.billNo)); } catch (e) { await PcInvoice.updateOne({ _id: i._id }, { $inc: { creditTotal: -a } }); throw e; }
  await PcOrder.updateOne({ _id: o._id, schoolId: ctx.schoolId }, { $inc: { paidTotal: -a } }); return { ok: true, credited: a };
}

async function listOrders(schoolId, q) {
  const { limit, skip, page } = S.pg(q); const f = { schoolId }; if (q.status) f.status = q.status; if (q.vendorId && oid(q.vendorId)) f.vendorId = q.vendorId; if (q.projectId && oid(q.projectId)) f.projectId = q.projectId;
  if (q.q) { const re = new RegExp(esc(q.q), 'i'); f.$or = [{ poNo: re }, { title: re }, { vendorName: re }]; }
  const [rows, total] = await Promise.all([PcOrder.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), PcOrder.countDocuments(f)]); return { rows: rows.map(plain), total, page, limit };
}
async function orderDetail(schoolId, id) {
  const o = oid(id) ? await PcOrder.findOne({ _id: id, schoolId }) : null; if (!o) throw new Fail(404, 'That order is not in your school.');
  const [lines, receipts, bills, req] = await Promise.all([PcOrderLine.find({ schoolId, orderId: o._id }).sort({ n: 1 }), PcReceipt.find({ schoolId, orderId: o._id }).sort({ createdAt: -1 }), PcInvoice.find({ schoolId, orderId: o._id }).sort({ createdAt: -1 }), PcRequisition.findOne({ _id: o.requisitionId, schoolId })]);
  return { order: plain(o), lines: lines.map(plain), receipts: receipts.map(plain), bills: bills.map(plain), requisition: req ? { _id: req._id, reqNo: req.reqNo, requesterName: req.requesterName } : null, receivedValue: receivedValueOf(o, lines) };
}
async function listInvoices(schoolId, q) {
  const { limit, skip, page } = S.pg(q); const f = { schoolId }; if (q.status) f.status = q.status; if (q.vendorId && oid(q.vendorId)) f.vendorId = q.vendorId; if (q.orderId && oid(q.orderId)) f.orderId = q.orderId; if (q.match) f.match = q.match;
  if (q.overdue === '1') { f.status = { $in: ['entered', 'approved'] }; f.dueOn = { $lt: await S.today(schoolId), $ne: '' }; }
  const [rows, total] = await Promise.all([PcInvoice.find(f).sort({ dueOn: 1, createdAt: -1 }).skip(skip).limit(limit), PcInvoice.countDocuments(f)]); return { rows: rows.map(plain), total, page, limit };
}
module.exports = { createReq, updateReq, addQuote, removeQuote, chooseQuote, submitReq, decideReq, cancelReq, listReqs, reqDetail, issueOrder, cancelOrder, closeOrder, receiveGoods, listOrders, orderDetail, enterInvoice, decideInvoice, payInvoice, voidInvoice, creditNote, listInvoices, targetsOf, receivedValueOf };
