// The school store (PRD E18): stock that only moves through append-only records, sales with receipts, pickups paid later, refunds decided by a different person,
// cash tills with counted close, and stock counts that change nothing until approved.
const mongoose = require('../../lib/pgdoc');
const S = require('./service');
const { E, Fail, oid, isDup } = S;
const StSku = require('../../models/StSku');
const StMovement = require('../../models/StMovement');
const StTill = require('../../models/StTill');
const StShift = require('../../models/StShift');
const StSale = require('../../models/StSale');
const StRefund = require('../../models/StRefund');
const StCount = require('../../models/StCount');
const Student = require('../../models/Student');

const plain = (d) => (d && d.toObject ? d.toObject() : d);
const money = (n) => Math.round(Number(n) || 0);
const posInt = (v, hi = 9999) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= hi ? n : null; };

/* ───────── stock: one write path ───────── */
// dOn changes the shelf, dRes changes what is held for pickups; available follows. The filter refuses a change that would take any figure below zero,
// so two sales racing for the last item cannot both succeed.
async function applyStock(ctx, sku, { dOn = 0, dRes = 0, kind, refType = '', refId = null, refNo = '', reason = '', unitCost = 0, supplier = '' }) {
  const dAv = dOn - dRes; const filter = { _id: sku._id, schoolId: ctx.schoolId };
  if (dAv < 0) filter.available = { $gte: -dAv }; if (dRes < 0) filter.reserved = { $gte: -dRes }; if (dOn < 0) filter.onHand = { $gte: -dOn };
  const done = await StSku.updateOne(filter, { $inc: { onHand: dOn, reserved: dRes, available: dAv } });
  if (!done.matchedCount) throw new Fail(409, `Not enough ${sku.name}${sku.variant ? ` (${sku.variant})` : ''} in stock.`, { reason: 'stock', skuId: String(sku._id) });
  const after = await StSku.findOne({ _id: sku._id, schoolId: ctx.schoolId }).select('onHand available reorderLevel lowNotedAt');
  await StMovement.create({ schoolId: ctx.schoolId, skuId: sku._id, sku: sku.sku, qty: dOn, reserveChange: dRes, kind, refType, refId: refId || null, refNo, unitCost, supplier, reason, balanceAfter: after?.onHand ?? 0, byId: ctx.actor.id || null, byName: ctx.actor.name || '' });
  if (after && after.lowNotedAt && after.available > after.reorderLevel) await StSku.updateOne({ _id: sku._id }, { $set: { lowNotedAt: null } });
  return after;
}
const undo = async (ctx, done) => { for (const d of done.reverse()) { try { await applyStock(ctx, d.sku, { dOn: -d.dOn, dRes: -d.dRes, kind: 'adjust', refType: d.refType, refId: d.refId, reason: 'Undone: the sale could not be completed' }); } catch (e) { /* the record already shows what happened */ } } };

/* ───────── items ───────── */
async function createSku(ctx, b) {
  const sku = String(b.sku || '').trim().toUpperCase().slice(0, 40); const name = String(b.name || '').trim().slice(0, 160); const price = money(b.price);
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(sku)) throw new Fail(422, 'The item code needs 2 to 40 letters, numbers, dots or dashes.');
  if (!name) throw new Fail(422, 'Give the item a name.'); if (!(Number(b.price) >= 0) || price > 10000000) throw new Fail(422, 'Give the price in rupees.');
  const category = ['uniform', 'book', 'stationery', 'other'].includes(b.category) ? b.category : 'other';
  if (await StSku.findOne({ schoolId: ctx.schoolId, sku })) throw new Fail(409, 'An item with that code already exists.');
  const seq = await S.nextBarcode(StSku, ctx.schoolId, 'sku');
  try { return plain(await seq.take((barcode) => StSku.create({ schoolId: ctx.schoolId, sku, name, group: String(b.group || '').trim().slice(0, 80), variant: String(b.variant || '').trim().slice(0, 40), category, price, cost: money(b.cost), reorderLevel: Math.max(0, parseInt(b.reorderLevel, 10) || 0), titleId: oid(b.titleId) || null, barcode }))); }
  catch (e) { if (isDup(e)) throw new Fail(409, 'An item with that code already exists.'); throw e; }
}
async function skuBy(schoolId, ref) {
  const s = String(ref || '').trim();
  if (oid(s)) { const x = await StSku.findOne({ _id: s, schoolId }); if (x) return x; }
  const r = E.readBarcode(s); if (r.ok && r.kind === 'sku') return StSku.findOne({ schoolId, barcode: r.code });
  return StSku.findOne({ schoolId, sku: s.toUpperCase() });
}

/* ───────── stock in ───────── */
async function receive(ctx, { skuRef, qty, unitCost = null, supplier = '', ref = '' }) {
  const sku = await skuBy(ctx.schoolId, skuRef); if (!sku) throw new Fail(404, 'That item is not in the store.'); const q = posInt(qty, 100000); if (!q) throw new Fail(422, 'Give a whole number of items received.');
  const cost = unitCost == null || unitCost === '' ? sku.cost : money(unitCost);
  const after = await applyStock(ctx, sku, { dOn: q, kind: 'receive', refType: 'receipt', refNo: String(ref).slice(0, 60), unitCost: cost, supplier: String(supplier).slice(0, 120), reason: 'Stock received' });
  if (cost && cost !== sku.cost) await StSku.updateOne({ _id: sku._id }, { $set: { cost } });
  return { sku: sku.sku, onHand: after.onHand, available: after.available };
}

/* ───────── sales ───────── */
async function myShift(ctx) { return StShift.findOne({ cashierKey: String(ctx.actor.id), schoolId: ctx.schoolId, status: 'open' }); }
async function buildLines(ctx, lines, { priceFrom = null } = {}) {
  if (!Array.isArray(lines) || !lines.length) throw new Fail(422, 'Add at least one item.'); if (lines.length > 60) throw new Fail(422, 'A sale can have up to 60 lines.');
  const merged = new Map(); for (const l of lines) { const q = posInt(l.qty); if (!q) throw new Fail(422, 'Each quantity must be a whole number from 1 to 9999.'); const k = String(l.skuId || l.sku || ''); merged.set(k, (merged.get(k) || 0) + q); }
  const out = [];
  for (const [ref, qty] of merged) { const sku = await skuBy(ctx.schoolId, ref); if (!sku || !sku.active) throw new Fail(404, `${ref || 'That item'} is not on sale.`); out.push({ sku, qty }); }
  return out;
}
const lineDoc = (sku, qty, gross, net) => ({ skuId: sku._id, sku: sku.sku, name: `${sku.name}${sku.variant ? ` (${sku.variant})` : ''}`, qty, price: sku.price, gross, total: net, refunded: 0, refundedQty: 0 });
// Spreads a discount over the lines so a refund of one line gives back its own share.
function priced(items, pct) {
  const lines = items.map(({ sku, qty }) => { const gross = money(sku.price * qty); return { sku, qty, gross }; });
  const sub = lines.reduce((s, l) => s + l.gross, 0); const discount = Math.round(sub * pct / 100); let left = discount;
  return { subtotal: sub, discount, total: sub - discount, lines: lines.map((l, i) => { const share = i === lines.length - 1 ? left : Math.round(discount * l.gross / (sub || 1)); left -= share; return lineDoc(l.sku, l.qty, l.gross, l.gross - share); }) };
}

async function sell(ctx, b) {
  const ck = b.clientKey ? `${ctx.schoolId}:${String(b.clientKey).slice(0, 80)}` : null;
  if (ck) { const again = await StSale.findOne({ ckey: ck }); if (again) return { ...plain(again), repeat: true }; }
  const shift = await myShift(ctx); if (!shift) throw new Fail(423, 'Open your till before selling.', { reason: 'no_shift' });
  const st = await S.getStore(ctx.schoolId); const pct = Number(b.discountPercent) || 0; if (pct < 0 || pct > 100) throw new Fail(422, 'A discount is between 0 and 100 percent.');
  if (pct > 0) { if (String(b.discountReason || '').trim().length < 5) throw new Fail(422, 'Write why the discount is given.'); if (pct > st.maxCashierDiscount && ctx.actor.role !== 'admin') throw new Fail(403, `A cashier can give up to ${st.maxCashierDiscount}% off. Ask an administrator for more.`); }
  const method = ['cash', 'bank', 'wallet', 'account'].includes(b.method) ? b.method : 'cash';
  const items = await buildLines(ctx, b.lines); const pr = priced(items, pct);
  let tendered = 0; let change = 0; if (method === 'cash') { tendered = money(b.tendered); if (tendered < pr.total) throw new Fail(422, `The cash received (Rs ${tendered}) is less than the total (Rs ${pr.total}).`); change = tendered - pr.total; }
  let buyer = { buyerType: '', buyerId: null, buyerName: '' };
  if (b.studentId) { const s = oid(b.studentId) ? await Student.findOne({ _id: b.studentId, schoolId: ctx.schoolId }).select('name fullName') : null; if (!s) throw new Fail(404, 'That student is not in your school.'); buyer = { buyerType: 'student', buyerId: s._id, buyerName: s.fullName || s.name || '' }; }
  const id = new mongoose.Types.ObjectId(); const done = [];
  try { for (const { sku, qty } of items) { await applyStock(ctx, sku, { dOn: -qty, kind: 'sale', refType: 'sale', refId: id, reason: 'Sold' }); done.push({ sku, dOn: -qty, dRes: 0, refType: 'sale', refId: id }); } }
  catch (e) { await undo(ctx, done); throw e; }
  try {
    const sale = await S.numbered(StSale, ctx.schoolId, 'receiptNo', 'RC', { _id: id, status: 'paid', lines: pr.lines, subtotal: pr.subtotal, discount: pr.discount, discountReason: String(b.discountReason || '').slice(0, 200), total: pr.total, method, reference: String(b.reference || '').slice(0, 80), tendered, change, ...buyer, shiftId: shift._id, tillId: shift.tillId, cashierId: ctx.actor.id, cashierName: ctx.actor.name || '', paidAt: new Date(), ckey: ck || undefined, note: String(b.note || '').slice(0, 200) });
    await StShift.updateOne({ _id: shift._id }, { $inc: { 'totals.sales': pr.total, 'totals.count': 1, [method === 'cash' ? 'totals.cash' : 'totals.other']: pr.total } });
    return plain(sale);
  } catch (e) { await undo(ctx, done); if (isDup(e) && ck) { const again = await StSale.findOne({ ckey: ck }); if (again) return { ...plain(again), repeat: true }; } throw e; }
}

/* ───────── pickups paid later ───────── */
async function reserveItems(ctx, b, { requestedBy = '' } = {}) {
  const st = await S.getStore(ctx.schoolId); const items = await buildLines(ctx, b.lines); const pr = priced(items, 0);
  const student = oid(b.studentId) ? await Student.findOne({ _id: b.studentId, schoolId: ctx.schoolId }).select('name fullName') : null; if (b.studentId && !student) throw new Fail(404, 'That student is not in your school.');
  const id = new mongoose.Types.ObjectId(); const done = [];
  try { for (const { sku, qty } of items) { await applyStock(ctx, sku, { dRes: qty, kind: 'adjust', refType: 'order', refId: id, reason: 'Held for pickup' }); done.push({ sku, dOn: 0, dRes: qty, refType: 'order', refId: id }); } } catch (e) { await undo(ctx, done); throw e; }
  try {
    const sale = await S.numbered(StSale, ctx.schoolId, 'orderNo', 'OR', { _id: id, status: 'reserved', lines: pr.lines, subtotal: pr.subtotal, total: pr.total, buyerType: student ? 'student' : '', buyerId: student?._id || null, buyerName: student ? (student.fullName || student.name) : '', holdUntil: new Date(Date.now() + st.holdDays * 86400000), requestedBy: requestedBy || ctx.actor.name || '' });
    if (student) await S.tell(ctx.schoolId, { holderType: 'student', holderId: student._id }, 'Your store order is ready to collect', `${sale.orderNo}: ${pr.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}. Pay Rs ${pr.total} at the store by ${E.keyOf(sale.holdUntil)}.`, '/student#/library', 'viewFees');
    return plain(sale);
  } catch (e) { await undo(ctx, done); throw e; }
}
async function releaseOrder(ctx, sale, status, why) {
  const was = await StSale.updateOne({ _id: sale._id, schoolId: ctx.schoolId, status: 'reserved' }, { $set: { status, note: why } }); if (!was.matchedCount) throw new Fail(409, 'That order has just changed.');
  for (const l of sale.lines) { const sku = await StSku.findOne({ _id: l.skuId, schoolId: ctx.schoolId }); if (sku) await applyStock(ctx, sku, { dRes: -l.qty, kind: 'adjust', refType: 'order', refId: sale._id, refNo: sale.orderNo, reason: why }); }
}
async function cancelOrder(ctx, { saleId, studentId = null }) {
  const sale = oid(saleId) ? await StSale.findOne({ _id: saleId, schoolId: ctx.schoolId }) : null; if (!sale || sale.orderNo == null) throw new Fail(404, 'That order is not in your school.');
  if (studentId && String(sale.buyerId) !== String(studentId)) throw new Fail(404, 'That order is not yours.'); if (sale.status !== 'reserved') throw new Fail(409, 'That order is already finished.');
  await releaseOrder(ctx, sale, 'cancelled', 'Order cancelled'); return { ok: true };
}
async function payOrder(ctx, { saleId, method = 'cash', tendered = 0, reference = '' }) {
  const sale = oid(saleId) ? await StSale.findOne({ _id: saleId, schoolId: ctx.schoolId }) : null; if (!sale || sale.orderNo == null) throw new Fail(404, 'That order is not in your school.'); if (sale.status !== 'reserved') throw new Fail(409, 'That order is already finished.');
  const shift = await myShift(ctx); if (!shift) throw new Fail(423, 'Open your till before taking payment.', { reason: 'no_shift' });
  const m = ['cash', 'bank', 'wallet', 'account'].includes(method) ? method : 'cash'; let t = 0; let ch = 0; if (m === 'cash') { t = money(tendered); if (t < sale.total) throw new Fail(422, `The cash received (Rs ${t}) is less than the total (Rs ${sale.total}).`); ch = t - sale.total; }
  const claimed = await StSale.updateOne({ _id: sale._id, schoolId: ctx.schoolId, status: 'reserved' }, { $set: { status: 'paid', paidAt: new Date(), method: m, tendered: t, change: ch, reference: String(reference).slice(0, 80), shiftId: shift._id, tillId: shift.tillId, cashierId: ctx.actor.id, cashierName: ctx.actor.name || '' } });
  if (!claimed.matchedCount) throw new Fail(409, 'That order has just been paid or cancelled.');
  const done = [];
  try { for (const l of sale.lines) { const sku = await StSku.findOne({ _id: l.skuId, schoolId: ctx.schoolId }); await applyStock(ctx, sku, { dOn: -l.qty, dRes: -l.qty, kind: 'pickup', refType: 'sale', refId: sale._id, refNo: sale.orderNo, reason: 'Collected and paid' }); done.push({ sku, dOn: -l.qty, dRes: -l.qty, refType: 'sale', refId: sale._id }); } }
  catch (e) { await undo(ctx, done); await StSale.updateOne({ _id: sale._id }, { $set: { status: 'reserved' } }); throw e; }
  const receiptNo = await assignReceipt(ctx.schoolId, sale._id);
  await StShift.updateOne({ _id: shift._id }, { $inc: { 'totals.sales': sale.total, 'totals.count': 1, [m === 'cash' ? 'totals.cash' : 'totals.other']: sale.total } });
  return plain(await StSale.findOne({ _id: sale._id, schoolId: ctx.schoolId })) || { receiptNo };
}
async function assignReceipt(schoolId, saleId) {
  const start = (await StSale.countDocuments({ schoolId, receiptNo: { $ne: null } })) + 1;
  for (let i = 0; i < 12; i += 1) {
    const no = `RC-${new Date().getUTCFullYear()}-${String(start + i).padStart(5, '0')}`;
    try { await StSale.updateOne({ _id: saleId, schoolId }, { $set: { receiptNo: no } }); return no; } catch (e) { if (!isDup(e)) throw e; }
  }
  throw new Error('could not number the receipt');
}
// Pickups nobody paid for in time go back on the shelf.
async function sweepOrders(schoolId, actor = { id: null, name: 'System' }) {
  const ctx = { schoolId, actor }; let n = 0;
  for (const o of await StSale.find({ schoolId, status: 'reserved', holdUntil: { $lt: new Date() } }).limit(200)) { try { await releaseOrder(ctx, o, 'expired', 'Not collected in time'); n += 1; } catch (e) { /* changed by someone else */ } }
  return n;
}

/* ───────── refunds: asked for by one person, decided by another ───────── */
async function requestRefund(ctx, { saleId, lines, reason, restock = true }) {
  const sale = oid(saleId) ? await StSale.findOne({ _id: saleId, schoolId: ctx.schoolId }) : null; if (!sale || !sale.receiptNo) throw new Fail(404, 'That receipt is not in your school.');
  if (!['paid', 'partly_refunded'].includes(sale.status)) throw new Fail(409, `That sale is ${sale.status.replace('_', ' ')}.`);
  const why = String(reason || '').trim(); if (why.length < 5) throw new Fail(422, 'Write the reason for the refund.');
  const st = await S.getStore(ctx.schoolId); if (Date.now() - new Date(sale.paidAt).getTime() > st.refundDays * 86400000) throw new Fail(409, `Refunds are accepted within ${st.refundDays} days of the sale.`, { reason: 'window' });
  if (await StRefund.findOne({ schoolId: ctx.schoolId, saleId: sale._id, status: 'requested' })) throw new Fail(409, 'A refund for this sale is already waiting for a decision.');
  const asked = Array.isArray(lines) && lines.length ? lines : sale.lines.map((l) => ({ skuId: String(l.skuId), qty: l.qty - (l.refundedQty || 0) })); const picked = []; let amount = 0;
  for (const a of asked) {
    const l = sale.lines.find((x) => String(x.skuId) === String(a.skuId)); const q = posInt(a.qty); if (!l || !q) throw new Fail(422, 'Choose items from this receipt and a whole quantity for each.');
    const left = l.qty - (l.refundedQty || 0); if (q > left) throw new Fail(422, `Only ${left} of ${l.name} can still be refunded.`);
    const value = q === left ? l.total - (l.refunded || 0) : Math.round(l.total * q / l.qty); picked.push({ skuId: l.skuId, sku: l.sku, name: l.name, qty: q, value }); amount += value;
  }
  if (!picked.length || amount <= 0) throw new Fail(422, 'There is nothing to refund.');
  const r = await S.numbered(StRefund, ctx.schoolId, 'refundNo', 'RF', { saleId: sale._id, receiptNo: sale.receiptNo, lines: picked, amount, reason: why.slice(0, 300), restock: restock !== false, method: sale.method, requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '' });
  await S.tellAdmins(ctx.schoolId, 'A store refund needs a decision', `${r.refundNo}: Rs ${amount} on ${sale.receiptNo}, asked by ${ctx.actor.name || 'a cashier'}.`, '/admin#/library', ctx.actor.id);
  return plain(r);
}
async function decideRefund(ctx, { refundId, approve, note = '' }) {
  const r = oid(refundId) ? await StRefund.findOne({ _id: refundId, schoolId: ctx.schoolId }) : null; if (!r) throw new Fail(404, 'That refund is not in your school.'); if (r.status !== 'requested') throw new Fail(409, `That refund is already ${r.status}.`);
  const alone = String(r.requestedById) === String(ctx.actor.id); const sole = alone ? await S.sole(ctx.schoolId) : false;
  if (alone && !sole) throw new Fail(403, 'A refund must be decided by someone other than the person who asked for it.', { reason: 'maker_checker' });
  if (!approve) { const done = await StRefund.updateOne({ _id: r._id, status: 'requested' }, { $set: { status: 'rejected', decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), decisionNote: String(note).slice(0, 300) } }); if (!done.matchedCount) throw new Fail(409, 'That refund has just changed.'); return { ok: true, status: 'rejected' }; }
  const claimed = await StRefund.updateOne({ _id: r._id, status: 'requested' }, { $set: { status: 'approved', sole: !!alone, decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), decisionNote: String(note).slice(0, 300) } }); if (!claimed.matchedCount) throw new Fail(409, 'That refund has just changed.');
  const sale = await StSale.findOne({ _id: r.saleId, schoolId: ctx.schoolId });
  const lines = sale.lines.map((x) => { const m = r.lines.find((y) => String(y.skuId) === String(x.skuId)); return m ? { ...plain(x), refunded: (x.refunded || 0) + m.value, refundedQty: (x.refundedQty || 0) + m.qty } : plain(x); });
  const full = lines.every((x) => x.refundedQty >= x.qty);
  const upd = await StSale.updateOne({ _id: sale._id, schoolId: ctx.schoolId, refundedTotal: sale.refundedTotal || 0 }, { $set: { lines, refundedTotal: (sale.refundedTotal || 0) + r.amount, status: full ? 'refunded' : 'partly_refunded' } });
  if (!upd.matchedCount) { await StRefund.updateOne({ _id: r._id }, { $set: { status: 'requested' } }); throw new Fail(409, 'The sale has just changed. Try again.'); }
  for (const l of r.lines) { const sku = await StSku.findOne({ _id: l.skuId, schoolId: ctx.schoolId }); if (!sku) continue; await applyStock(ctx, sku, r.restock ? { dOn: l.qty, kind: 'return', refType: 'refund', refId: r._id, refNo: r.refundNo, reason: 'Returned by the buyer' } : { dOn: 0, kind: 'writeoff', refType: 'refund', refId: r._id, refNo: r.refundNo, reason: 'Refunded, item not restocked' }); }
  const shift = sale.shiftId ? await StShift.findOne({ _id: sale.shiftId, schoolId: ctx.schoolId }) : null; if (shift && shift.status === 'open') await StShift.updateOne({ _id: shift._id }, { $inc: { 'totals.refundsCash': r.amount } });
  else { const mine = await myShift({ schoolId: ctx.schoolId, actor: { id: r.requestedById } }); if (mine) await StShift.updateOne({ _id: mine._id }, { $inc: { 'totals.refundsCash': r.amount } }); }
  return { ok: true, status: 'approved', amount: r.amount };
}

/* ───────── tills and shifts ───────── */
const Teacher = require('../../models/Teacher'); const User = require('../../models/User');
// People who may be given a till are the school's own administrators and teachers (by user id).
async function assignable(schoolId, ids) {
  const out = []; for (const id of (ids || []).filter(oid).slice(0, 20)) { const u = (await User.findOne({ _id: id, schoolId, role: 'admin' }).select('name')) || (await Teacher.findOne({ _id: id, schoolId }).select('name')); if (u) out.push({ id: u._id, name: u.name || '' }); } return out;
}
async function updateTill(ctx, { tillId, name, cashierIds, active, floatAmount }) {
  const t = oid(tillId) ? await StTill.findOne({ _id: tillId, schoolId: ctx.schoolId }) : null; if (!t) throw new Fail(404, 'That till is not in your school.'); const $set = {};
  if (name !== undefined) { if (!String(name).trim()) throw new Fail(422, 'Give the till a name.'); $set.name = String(name).trim().slice(0, 60); } if (cashierIds !== undefined) $set.assigned = await assignable(ctx.schoolId, cashierIds); if (floatAmount !== undefined) $set.floatAmount = Math.max(0, money(floatAmount));
  if (active !== undefined) { if (!active && await StShift.findOne({ schoolId: ctx.schoolId, tillId: t._id, status: 'open' })) throw new Fail(409, 'This till is open. Close it first.'); $set.active = !!active; }
  try { await StTill.updateOne({ _id: t._id, schoolId: ctx.schoolId }, { $set }); } catch (e) { if (isDup(e)) throw new Fail(409, 'A till with that name exists.'); throw e; } return { ok: true };
}
async function createTill(ctx, { name, cashierIds = [], floatAmount = 0 }) {
  const n = String(name || '').trim().slice(0, 60); if (!n) throw new Fail(422, 'Give the till a name.');
  const people = await assignable(ctx.schoolId, cashierIds); try { return plain(await StTill.create({ schoolId: ctx.schoolId, name: n, assigned: people, floatAmount: Math.max(0, money(floatAmount)) })); } catch (e) { if (isDup(e)) throw new Fail(409, 'A till with that name exists.'); throw e; }
}
async function openShift(ctx, { tillId, openingCash = 0 }) {
  const till = oid(tillId) ? await StTill.findOne({ _id: tillId, schoolId: ctx.schoolId, active: true }) : null; if (!till) throw new Fail(404, 'That till is not in your school.');
  if (ctx.actor.role !== 'admin' && !(till.assigned || []).some((c) => String(c.id) === String(ctx.actor.id))) throw new Fail(403, 'You are not assigned to this till.');
  const cash = money(openingCash); if (cash < 0) throw new Fail(422, 'The opening cash cannot be negative.');
  try { return plain(await StShift.create({ schoolId: ctx.schoolId, tillId: till._id, tillName: till.name, cashierId: ctx.actor.id, cashierName: ctx.actor.name || '', openingFloat: cash, tillKey: String(till._id), cashierKey: String(ctx.actor.id) })); }
  catch (e) { if (isDup(e)) throw new Fail(409, 'This till is already open, or you already have a till open.', { reason: 'open' }); throw e; }
}
async function closeShift(ctx, { shiftId, countedCash, note = '' }) {
  const sh = oid(shiftId) ? await StShift.findOne({ _id: shiftId, schoolId: ctx.schoolId }) : null; if (!sh) throw new Fail(404, 'That shift is not in your school.');
  if (ctx.actor.role !== 'admin' && String(sh.cashierId) !== String(ctx.actor.id)) throw new Fail(403, 'Only the cashier or an administrator can close this shift.'); if (sh.status !== 'open') throw new Fail(409, 'That shift is already closed.');
  const counted = Number(countedCash); if (!Number.isFinite(counted) || counted < 0) throw new Fail(422, 'Count the cash in the drawer and enter it.'); const st = await S.getStore(ctx.schoolId);
  const expected = money((sh.openingFloat || 0) + (sh.totals?.cash || 0) - (sh.totals?.refundsCash || 0)); const variance = money(counted) - expected;
  if (Math.abs(variance) > st.cashTolerance && String(note).trim().length < 5) throw new Fail(422, `The drawer is Rs ${Math.abs(variance)} ${variance < 0 ? 'short' : 'over'}. Write a note to close it.`, { reason: 'variance', expected, variance });
  const done = await StShift.updateOne({ _id: sh._id, status: 'open' }, { $set: { status: 'closed', closedAt: new Date(), countedCash: money(counted), expectedCash: expected, variance, closeNote: String(note).slice(0, 300), flagged: Math.abs(variance) > st.cashTolerance }, $unset: { tillKey: 1, cashierKey: 1 } });
  if (!done.matchedCount) throw new Fail(409, 'That shift has just been closed.');
  if (Math.abs(variance) > st.cashTolerance) await S.tellAdmins(ctx.schoolId, 'A till closed with a difference', `${sh.tillName}: Rs ${Math.abs(variance)} ${variance < 0 ? 'short' : 'over'} (${sh.cashierName}).`);
  return { expected, counted: money(counted), variance, totals: sh.totals };
}

/* ───────── stock counts: counted by one, approved by another ───────── */
async function startCount(ctx, { name = '', skuIds = [] }) {
  const q = { schoolId: ctx.schoolId, active: true }; const ids = (skuIds || []).filter(oid); if (ids.length) q._id = { $in: ids }; const skus = await StSku.find(q).limit(2000); if (!skus.length) throw new Fail(422, 'There are no items to count.');
  if (await StCount.findOne({ schoolId: ctx.schoolId, status: 'counting' })) throw new Fail(409, 'A count is already open. Submit or cancel it first.');
  return plain(await S.numbered(StCount, ctx.schoolId, 'countNo', 'CT', { title: String(name).slice(0, 80) || 'Stock count', lines: skus.map((s) => ({ skuId: s._id, sku: s.sku, name: `${s.name}${s.variant ? ` (${s.variant})` : ''}`, expected: s.onHand, counted: null, cost: s.cost })), startedById: ctx.actor.id, startedByName: ctx.actor.name || '' }));
}
async function saveCount(ctx, { countId, entries }) {
  const c = oid(countId) ? await StCount.findOne({ _id: countId, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That count is not in your school.'); if (c.status !== 'counting') throw new Fail(409, 'That count was already submitted.');
  const map = new Map((entries || []).map((e) => [String(e.skuId), e.counted])); const lines = c.lines.map((l) => { const v = map.get(String(l.skuId)); if (v === undefined) return plain(l); if (v === null || v === '') return { ...plain(l), counted: null }; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 1000000) throw new Fail(422, `The count for ${l.name} must be a whole number.`); return { ...plain(l), counted: n }; });
  const done = await StCount.updateOne({ _id: c._id, status: 'counting' }, { $set: { lines } }); if (!done.matchedCount) throw new Fail(409, 'That count has just been submitted.'); return { saved: true, counted: lines.filter((l) => l.counted != null).length, of: lines.length };
}
async function submitCount(ctx, { countId }) {
  const c = oid(countId) ? await StCount.findOne({ _id: countId, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That count is not in your school.'); if (c.status !== 'counting') throw new Fail(409, 'That count was already submitted.');
  const lines = c.lines.filter((l) => l.counted != null); if (!lines.length) throw new Fail(422, 'Count at least one item first.');
  // what is on the shelf now may differ from when counting began (sales go on during a count), so the difference is measured against the figure at the time of submitting
  const out = []; let net = 0; for (const l of lines) { const sku = await StSku.findOne({ _id: l.skuId, schoolId: ctx.schoolId }); const expected = sku ? sku.onHand : l.expected; const diff = l.counted - expected; out.push({ ...plain(l), expected, diff, value: diff * (l.cost || 0) }); net += diff * (l.cost || 0); }
  const done = await StCount.updateOne({ _id: c._id, status: 'counting' }, { $set: { status: 'submitted', lines: out, netValue: net, submittedAt: new Date(), submittedById: ctx.actor.id, submittedByName: ctx.actor.name || '' } }); if (!done.matchedCount) throw new Fail(409, 'That count has just been submitted.');
  const st = await S.getStore(ctx.schoolId); if (out.some((l) => l.diff)) await S.tellAdmins(ctx.schoolId, 'A stock count needs approval', `${c.countNo}: ${out.filter((l) => l.diff).length} items differ (net Rs ${net}).${Math.abs(net) >= st.countFlagValue ? ' The difference is large.' : ''}`);
  return { netValue: net, differences: out.filter((l) => l.diff).length, flagged: Math.abs(net) >= st.countFlagValue };
}
async function decideCount(ctx, { countId, approve, note = '' }) {
  const c = oid(countId) ? await StCount.findOne({ _id: countId, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That count is not in your school.'); if (c.status !== 'submitted') throw new Fail(409, `That count is ${c.status}.`);
  const alone = String(c.submittedById) === String(ctx.actor.id); const sole = alone ? await S.sole(ctx.schoolId) : false; if (alone && !sole) throw new Fail(403, 'A count must be approved by someone other than the person who counted.', { reason: 'maker_checker' });
  if (approve && Math.abs(c.netValue || 0) >= (await S.getStore(ctx.schoolId)).countFlagValue && String(note).trim().length < 5) throw new Fail(422, 'This difference is large. Write a note to approve it.');
  const claimed = await StCount.updateOne({ _id: c._id, status: 'submitted' }, { $set: { status: approve ? 'approved' : 'rejected', sole: !!alone, decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), decisionNote: String(note).slice(0, 300) } }); if (!claimed.matchedCount) throw new Fail(409, 'That count has just changed.');
  if (!approve) return { ok: true, status: 'rejected' };
  let moved = 0; for (const l of c.lines) { if (!l.diff) continue; const sku = await StSku.findOne({ _id: l.skuId, schoolId: ctx.schoolId }); if (!sku) continue; await applyStock(ctx, sku, { dOn: l.diff, kind: 'count', refType: 'count', refId: c._id, refNo: c.countNo, reason: `Stock count ${c.countNo}` }); moved += 1; }
  return { ok: true, status: 'approved', moved };
}

/* ───────── low stock and the consistency check ───────── */
async function lowStock(schoolId, { notify = false } = {}) {
  const low = (await StSku.find({ schoolId, active: true, reorderLevel: { $gt: 0 } }).limit(2000)).filter((s) => s.available <= s.reorderLevel);
  if (notify) { const fresh = low.filter((s) => !s.lowNotedAt); if (fresh.length) { await S.tellAdmins(schoolId, 'Store items are running low', fresh.slice(0, 8).map((s) => `${s.name}${s.variant ? ` (${s.variant})` : ''}: ${s.available}`).join('; ') + (fresh.length > 8 ? ` and ${fresh.length - 8} more` : '')); for (const s of fresh) await StSku.updateOne({ _id: s._id }, { $set: { lowNotedAt: new Date() } }); } }
  return low.map((s) => ({ _id: s._id, sku: s.sku, name: s.name, variant: s.variant, available: s.available, onHand: s.onHand, reorderLevel: s.reorderLevel }));
}
// Stock on the shelf must equal the sum of its movements. A difference means a write was lost and is reported, never hidden.
async function reconcile(schoolId, skuId = null) {
  const q = { schoolId }; if (skuId) q._id = skuId; const bad = [];
  for (const s of await StSku.find(q).limit(5000)) { const ms = await StMovement.find({ schoolId, skuId: s._id }).select('qty reserveChange'); const on = ms.reduce((a, m) => a + (m.qty || 0), 0); const res = ms.reduce((a, m) => a + (m.reserveChange || 0), 0); if (on !== s.onHand || res !== s.reserved || s.available !== s.onHand - s.reserved) bad.push({ sku: s.sku, onHand: s.onHand, fromMovements: on, reserved: s.reserved, reservedFromMovements: res }); }
  return { ok: !bad.length, mismatches: bad };
}

module.exports = { assignable, updateTill, applyStock, createSku, skuBy, receive, myShift, sell, reserveItems, cancelOrder, payOrder, releaseOrder, sweepOrders, requestRefund, decideRefund, createTill, openShift, closeShift, startCount, saveCount, submitCount, decideCount, lowStock, reconcile, priced };
