// The school store (PRD E18): items and stock, sales and pickups, refunds, tills and shifts, stock counts, reports, and what families see.
const S = require('../utils/library/service');
const T = require('../utils/library/store');
const { E, Fail, oid, sid, who, wrap, ctxOf, clean } = S;
const { audit } = require('../utils/audit');
const G = require('../utils/guardianRights');
const StSku = require('../models/StSku'); const StMovement = require('../models/StMovement'); const StSale = require('../models/StSale'); const StRefund = require('../models/StRefund');
const StTill = require('../models/StTill'); const StShift = require('../models/StShift'); const StCount = require('../models/StCount'); const Student = require('../models/Student');

const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'store', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
const pg = (q) => { const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)); const p = Math.max(1, parseInt(q.page, 10) || 1); return { limit, skip: (p - 1) * limit, page: p }; };

/* ───────── items and stock ───────── */
exports.skus = wrap('st.skus', async (req, res) => {
  const { limit, skip, page } = pg(req.query); const f = { schoolId: sid(req), active: req.query.archived === '1' ? false : true }; if (req.query.category) f.category = req.query.category;
  if (req.query.q) { const re = new RegExp(esc(req.query.q), 'i'); f.$or = [{ name: re }, { sku: re }, { group: re }]; } if (req.query.low === '1') f.reorderLevel = { $gt: 0 };
  let rows = await StSku.find(f).sort({ group: 1, name: 1, variant: 1 }).skip(skip).limit(limit); const total = await StSku.countDocuments(f); if (req.query.low === '1') rows = rows.filter((s) => s.available <= s.reorderLevel);
  res.json({ rows: rows.map(plain), total, page, limit });
});
exports.createSku = wrap('st.createSku', async (req, res) => { const s = await T.createSku(ctxOf(req), req.body || {}); await A(req, 'store.sku.create', String(s._id), s.sku); res.status(201).json(s); });
exports.updateSku = wrap('st.updateSku', async (req, res) => {
  const s = oid(req.params.id) ? await StSku.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!s) throw new Fail(404, 'That item is not in the store.'); const b = req.body || {}; const $set = {};
  if (b.name !== undefined) { if (!String(b.name).trim()) throw new Fail(422, 'Give the item a name.'); $set.name = String(b.name).trim().slice(0, 160); } if (b.group !== undefined) $set.group = String(b.group).slice(0, 80); if (b.variant !== undefined) $set.variant = String(b.variant).slice(0, 40);
  if (b.price !== undefined) { const p = Math.round(Number(b.price)); if (!(p >= 0) || p > 10000000) throw new Fail(422, 'Give the price in rupees.'); $set.price = p; } if (b.cost !== undefined) $set.cost = Math.max(0, Math.round(Number(b.cost) || 0));
  if (b.reorderLevel !== undefined) $set.reorderLevel = Math.max(0, parseInt(b.reorderLevel, 10) || 0); if (b.category && ['uniform', 'book', 'stationery', 'other'].includes(b.category)) $set.category = b.category;
  if (b.active !== undefined) { if (!b.active && (s.onHand || s.reserved)) throw new Fail(409, 'This item still has stock or held orders. Count it out first.'); $set.active = !!b.active; }
  if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.'); await StSku.updateOne({ _id: s._id, schoolId: sid(req) }, { $set }); await A(req, 'store.sku.update', req.params.id, Object.keys($set).join(',')); res.json({ ok: true });
});
exports.receive = wrap('st.receive', async (req, res) => { const r = await T.receive(ctxOf(req), req.body || {}); await A(req, 'store.stock.receive', '', `${r.sku} +${req.body.qty}`); res.status(201).json(r); });
exports.movements = wrap('st.movements', async (req, res) => {
  const { limit, skip, page } = pg(req.query); const f = { schoolId: sid(req) }; if (oid(req.query.skuId)) f.skuId = oid(req.query.skuId); if (req.query.kind) f.kind = req.query.kind;
  const [rows, total] = await Promise.all([StMovement.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), StMovement.countDocuments(f)]); res.json({ rows: rows.map(plain), total, page, limit });
});
exports.lowStock = wrap('st.low', async (req, res) => { res.json({ rows: await T.lowStock(sid(req)) }); });
exports.reconcile = wrap('st.reconcile', async (req, res) => { res.json(await T.reconcile(sid(req))); });
exports.settings = wrap('st.settings', async (req, res) => { res.json(await S.getStore(sid(req))); });
exports.saveSettings = wrap('st.saveSettings', async (req, res) => {
  const b = req.body || {}; const cur = await S.getStore(sid(req)); const n = (v, lo, hi, d) => { if (v === undefined) return d; const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new Fail(422, 'A store setting is outside its allowed range.'); return Math.round(x); };
  const next = { holdDays: n(b.holdDays, 1, 30, cur.holdDays), refundDays: n(b.refundDays, 0, 90, cur.refundDays), maxCashierDiscount: n(b.maxCashierDiscount, 0, 100, cur.maxCashierDiscount), cashTolerance: n(b.cashTolerance, 0, 100000, cur.cashTolerance), countFlagValue: n(b.countFlagValue, 0, 100000000, cur.countFlagValue), receiptFooter: b.receiptFooter === undefined ? cur.receiptFooter : clean(b.receiptFooter, 200) };
  await S.putStore(sid(req), next); await A(req, 'store.settings', '', ''); res.json(next);
});

/* ───────── sales and pickups ───────── */
exports.sell = wrap('st.sell', async (req, res) => { const s = await T.sell(ctxOf(req), req.body || {}); res.status(s.repeat ? 200 : 201).json({ ...s, footer: (await S.getStore(sid(req))).receiptFooter }); });
exports.sales = wrap('st.sales', async (req, res) => {
  const { limit, skip, page } = pg(req.query); const f = { schoolId: sid(req), receiptNo: { $ne: null } }; if (req.query.status) f.status = req.query.status; if (req.query.q) f.$or = [{ receiptNo: new RegExp(esc(req.query.q), 'i') }, { buyerName: new RegExp(esc(req.query.q), 'i') }];
  const [rows, total] = await Promise.all([StSale.find(f).sort({ paidAt: -1 }).skip(skip).limit(limit), StSale.countDocuments(f)]); res.json({ rows: rows.map(plain), total, page, limit });
});
exports.sale = wrap('st.sale', async (req, res) => { const s = oid(req.params.id) ? await StSale.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!s) throw new Fail(404, 'That sale is not in your school.'); res.json({ ...plain(s), footer: (await S.getStore(sid(req))).receiptFooter, refunds: (await StRefund.find({ schoolId: sid(req), saleId: s._id })).map(plain) }); });
exports.orders = wrap('st.orders', async (req, res) => { const rows = await StSale.find({ schoolId: sid(req), orderNo: { $ne: null }, status: req.query.status || 'reserved' }).sort({ createdAt: -1 }).limit(200); res.json({ rows: rows.map(plain) }); });
exports.order = wrap('st.order', async (req, res) => { res.status(201).json(await T.reserveItems(ctxOf(req), req.body || {})); });
exports.payOrder = wrap('st.payOrder', async (req, res) => { res.json(await T.payOrder(ctxOf(req), { saleId: req.params.id, ...(req.body || {}) })); });
exports.cancelOrder = wrap('st.cancelOrder', async (req, res) => { res.json(await T.cancelOrder(ctxOf(req), { saleId: req.params.id })); });

/* ───────── refunds ───────── */
exports.requestRefund = wrap('st.requestRefund', async (req, res) => { const r = await T.requestRefund(ctxOf(req), req.body || {}); await A(req, 'store.refund.request', String(r._id), `${r.refundNo} Rs ${r.amount}`); res.status(201).json(r); });
exports.refunds = wrap('st.refunds', async (req, res) => { const rows = await StRefund.find({ schoolId: sid(req), ...(req.query.status ? { status: req.query.status } : {}) }).sort({ createdAt: -1 }).limit(200); res.json({ rows: rows.map(plain) }); });
exports.decideRefund = wrap('st.decideRefund', async (req, res) => { const r = await T.decideRefund(ctxOf(req), { refundId: req.params.id, approve: !!req.body?.approve, note: req.body?.note }); await A(req, 'store.refund.decide', req.params.id, `${r.status}`); res.json(r); });

/* ───────── tills and shifts ───────── */
exports.tills = wrap('st.tills', async (req, res) => { const rows = await StTill.find({ schoolId: sid(req) }).sort({ name: 1 }); const open = await StShift.find({ schoolId: sid(req), status: 'open' }); res.json({ rows: rows.map((t) => ({ ...plain(t), open: open.find((s) => String(s.tillId) === String(t._id)) ? { cashierName: open.find((s) => String(s.tillId) === String(t._id)).cashierName } : null })) }); });
exports.createTill = wrap('st.createTill', async (req, res) => { const t = await T.createTill(ctxOf(req), req.body || {}); await A(req, 'store.till.create', String(t._id), t.name); res.status(201).json(t); });
exports.updateTill = wrap('st.updateTill', async (req, res) => { const r = await T.updateTill(ctxOf(req), { tillId: req.params.id, ...(req.body || {}) }); await A(req, 'store.till.update', req.params.id, ''); res.json(r); });
exports.people = wrap('st.people', async (req, res) => {
  const Teacher = require('../models/Teacher'); const User = require('../models/User'); const [a, t] = await Promise.all([User.find({ schoolId: sid(req), role: 'admin' }).select('name').limit(50), Teacher.find({ schoolId: sid(req), isActive: { $ne: false } }).select('name').limit(200)]);
  res.json({ rows: [...a.map((x) => ({ id: x._id, name: x.name, role: 'admin' })), ...t.map((x) => ({ id: x._id, name: x.name, role: 'teacher' }))] });
});
exports.myShift = wrap('st.myShift', async (req, res) => {
  const sh = await T.myShift(ctxOf(req)); const tills = await StTill.find({ schoolId: sid(req), active: true }).sort({ name: 1 }); const mine = tills.filter((t) => req.user.role === 'admin' || (t.assigned || []).some((a) => String(a.id) === String(req.user.userId)));
  res.json({ shift: sh ? plain(sh) : null, tills: mine.map((t) => ({ _id: t._id, name: t.name, floatAmount: t.floatAmount })) });
});
exports.openShift = wrap('st.openShift', async (req, res) => { const r = await T.openShift(ctxOf(req), req.body || {}); await A(req, 'store.shift.open', String(r._id), r.tillName); res.status(201).json(r); });
exports.closeShift = wrap('st.closeShift', async (req, res) => { const r = await T.closeShift(ctxOf(req), { shiftId: req.params.id, ...(req.body || {}) }); await A(req, 'store.shift.close', req.params.id, `variance ${r.variance}`); res.json(r); });
exports.shifts = wrap('st.shifts', async (req, res) => { const rows = await StShift.find({ schoolId: sid(req) }).sort({ openedAt: -1 }).limit(100); res.json({ rows: rows.map(plain) }); });

/* ───────── stock counts ───────── */
exports.counts = wrap('st.counts', async (req, res) => { const rows = await StCount.find({ schoolId: sid(req) }).select('-lines').sort({ createdAt: -1 }).limit(100); res.json({ rows: rows.map(plain) }); });
exports.count = wrap('st.count', async (req, res) => { const c = oid(req.params.id) ? await StCount.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!c) throw new Fail(404, 'That count is not in your school.'); res.json(plain(c)); });
exports.startCount = wrap('st.startCount', async (req, res) => { const c = await T.startCount(ctxOf(req), req.body || {}); await A(req, 'store.count.start', String(c._id), c.countNo); res.status(201).json(c); });
exports.saveCount = wrap('st.saveCount', async (req, res) => { res.json(await T.saveCount(ctxOf(req), { countId: req.params.id, entries: req.body?.entries })); });
exports.submitCount = wrap('st.submitCount', async (req, res) => { const r = await T.submitCount(ctxOf(req), { countId: req.params.id }); await A(req, 'store.count.submit', req.params.id, `net Rs ${r.netValue}`); res.json(r); });
exports.decideCount = wrap('st.decideCount', async (req, res) => { const r = await T.decideCount(ctxOf(req), { countId: req.params.id, approve: !!req.body?.approve, note: req.body?.note }); await A(req, 'store.count.decide', req.params.id, r.status); res.json(r); });

/* ───────── reports ───────── */
exports.overview = wrap('st.overview', async (req, res) => {
  const schoolId = sid(req); const day = new Date(); day.setUTCHours(0, 0, 0, 0); const [skus, today, pending, refunds, openShifts, counts] = await Promise.all([StSku.find({ schoolId, active: true }).select('onHand reserved available reorderLevel cost'), StSale.find({ schoolId, receiptNo: { $ne: null }, paidAt: { $gte: day } }).select('total refundedTotal'), StSale.countDocuments({ schoolId, orderNo: { $ne: null }, status: 'reserved' }), StRefund.countDocuments({ schoolId, status: 'requested' }), StShift.countDocuments({ schoolId, status: 'open' }), StCount.countDocuments({ schoolId, status: 'submitted' })]);
  res.json({ items: skus.length, units: skus.reduce((s, x) => s + x.onHand, 0), stockValue: skus.reduce((s, x) => s + x.onHand * (x.cost || 0), 0), low: skus.filter((s) => s.reorderLevel > 0 && s.available <= s.reorderLevel).length, salesToday: today.length, takingsToday: today.reduce((s, x) => s + x.total - (x.refundedTotal || 0), 0), pendingOrders: pending, refundsWaiting: refunds, openShifts, countsWaiting: counts });
});
exports.dayReport = wrap('st.day', async (req, res) => {
  const schoolId = sid(req); const from = new Date(`${clean(req.query.from, 10) || new Date().toISOString().slice(0, 10)}T00:00:00Z`); if (Number.isNaN(from.getTime())) throw new Fail(422, 'Give the date as YYYY-MM-DD.'); const to = new Date(from.getTime() + 86400000);
  const sales = await StSale.find({ schoolId, receiptNo: { $ne: null }, paidAt: { $gte: from, $lt: to } }).limit(5000); const by = { cash: 0, bank: 0, wallet: 0, account: 0 }; const items = new Map();
  sales.forEach((s) => { by[s.method] = (by[s.method] || 0) + s.total; s.lines.forEach((l) => { const v = items.get(l.sku) || { sku: l.sku, name: l.name, qty: 0, amount: 0 }; v.qty += l.qty - (l.refundedQty || 0); v.amount += l.total - (l.refunded || 0); items.set(l.sku, v); }); });
  res.json({ date: from.toISOString().slice(0, 10), sales: sales.length, gross: sales.reduce((s, x) => s + x.total, 0), refunded: sales.reduce((s, x) => s + (x.refundedTotal || 0), 0), byMethod: by, items: [...items.values()].sort((a, b) => b.amount - a.amount) });
});

/* ───────── families ───────── */
async function ownerOf(req) {
  const u = req.user; const schoolId = sid(req);
  if (u.role === 'student') return { studentId: oid(u.userId), rights: { viewFees: true } };
  if (u.role === 'parent') { const childId = oid(req.query.childId || req.body?.childId); if (!childId) throw new Fail(422, 'Choose a child.'); const g = await G.resolve(schoolId, u.userId, childId); if (!g.linked || !g.rights.viewInfo) throw new Fail(403, 'You cannot see this child\'s store orders.'); return { studentId: childId, rights: g.rights }; }
  throw new Fail(403, 'Not available.');
}
exports.meItems = wrap('st.meItems', async (req, res) => { await ownerOf(req); const rows = await StSku.find({ schoolId: sid(req), active: true, available: { $gt: 0 } }).sort({ group: 1, name: 1 }).limit(300); res.json({ rows: rows.map((s) => ({ _id: s._id, name: s.name, group: s.group, variant: s.variant, category: s.category, price: s.price, available: Math.min(s.available, 20) })) }); });
exports.meOrders = wrap('st.meOrders', async (req, res) => { const o = await ownerOf(req); const rows = await StSale.find({ schoolId: sid(req), buyerId: o.studentId }).sort({ createdAt: -1 }).limit(30); res.json({ rows: rows.map((s) => ({ _id: s._id, orderNo: s.orderNo, receiptNo: s.receiptNo, status: s.status, total: s.total, lines: s.lines.map((l) => ({ name: l.name, qty: l.qty })), holdUntil: s.holdUntil, paidAt: s.paidAt, createdAt: s.createdAt })) }); });
exports.meOrder = wrap('st.meOrder', async (req, res) => {
  const o = await ownerOf(req); if (req.user.role === 'parent' && !o.rights.payFees && !o.rights.viewFees) throw new Fail(403, 'You cannot place store orders for this child.');
  const mine = await StSale.countDocuments({ schoolId: sid(req), buyerId: o.studentId, status: 'reserved' }); if (mine >= 3) throw new Fail(409, 'Three orders are already waiting to be collected. Collect or cancel one first.');
  const lines = (req.body?.lines || []).map((l) => ({ skuId: l.skuId, qty: l.qty })); res.status(201).json(await T.reserveItems(ctxOf(req), { lines, studentId: o.studentId }, { requestedBy: req.actorName || 'Family' }));
});
exports.meCancel = wrap('st.meCancel', async (req, res) => { const o = await ownerOf(req); res.json(await T.cancelOrder(ctxOf(req), { saleId: req.params.id, studentId: o.studentId })); });
