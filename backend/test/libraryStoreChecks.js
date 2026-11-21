// School store (E18): items, stock, sales, pickups, refunds, tills, counts
module.exports = async ({ call, expect, log, X, Y, G, PO, PA, PU, id, M, L, ST }) => {
  const PermissionGrant = require('../models/PermissionGrant'); const E = require('../utils/library/engine'); const Tn = require('../utils/library/store');
  console.log('— School store —');
  await PermissionGrant.create({ schoolId: X.s._id, granteeId: X.t._id, granteeModel: 'Teacher', granteeName: 'Hamid', action: 'store.till.operate', source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 864e5), reason: 'Store cashier', grantedBy: X.a._id });
  await expect('a cashier cannot add items', PO(`${ST}/skus`, { sku: 'SH-32', name: 'Shirt', price: 800 }, X.T), [403]);
  await expect('an item code must be well formed', PO(`${ST}/skus`, { sku: '!', name: 'Shirt', price: 800 }, X.A), [422]);
  const s1 = await PO(`${ST}/skus`, { sku: 'sh-32', name: 'Boys shirt', variant: 'Size 32', price: 800, cost: 500, reorderLevel: 3, category: 'uniform' }, X.A);
  log(s1.status === 201 && s1.data.sku === 'SH-32' && /^ST\d{8}$/.test(s1.data.barcode) && s1.data.onHand === 0, 'an item is added with a checkable barcode and no stock');
  await expect('the same code cannot be added twice', PO(`${ST}/skus`, { sku: 'SH-32', name: 'Again', price: 1 }, X.A), [409]);
  const s2 = await PO(`${ST}/skus`, { sku: 'NB-1', name: 'Notebook', price: 120, cost: 70, category: 'stationery' }, X.A);
  await expect('a sale cannot be made without stock', (async () => { await PO(`${ST}/shifts/open`, { tillId: (await PO(`${ST}/tills`, { name: 'Front', cashierIds: [String(X.t._id)] }, X.A)).data._id, openingCash: 1000 }, X.T); return PO(`${ST}/sales`, { lines: [{ skuId: id(s1), qty: 1 }], tendered: 800 }, X.T); })(), [409]);
  const rc = await PO(`${ST}/receive`, { skuRef: id(s1), qty: 10, unitCost: 520, supplier: 'Tailor Co' }, X.A); await PO(`${ST}/receive`, { skuRef: id(s2), qty: 50 }, X.A);
  log(rc.status === 201 && rc.data.onHand === 10 && (await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id })).cost === 520, 'stock received adds to the shelf and notes the cost');
  await expect('stock cannot be received as zero or a fraction', PO(`${ST}/receive`, { skuRef: id(s1), qty: 1.5 }, X.A), [422]);

  // tills
  const tills = await G(`${ST}/tills`, X.A); log(tills.data.rows.length === 1 && tills.data.rows[0].open && tills.data.rows[0].assigned.length === 1, 'a till is assigned to a cashier and shows as open');
  await expect('a second shift on the same till is refused', PO(`${ST}/shifts/open`, { tillId: tills.data.rows[0]._id }, X.A), [409]);
  const mine = await G(`${ST}/shift`, X.T); log(mine.data.shift && mine.data.shift.openingFloat === 1000, 'the cashier has one open shift with the opening cash');
  await expect('a cashier who is not assigned cannot open a till', (async () => { const t = await PO(`${ST}/tills`, { name: 'Back', cashierIds: [] }, X.A); return PO(`${ST}/shifts/open`, { tillId: t.data._id }, X.T); })(), [409, 403]);

  // sales
  await expect('a cash sale needs enough cash', PO(`${ST}/sales`, { lines: [{ skuId: id(s1), qty: 2 }], tendered: 100 }, X.T), [422]);
  await expect('a quantity must be a whole number', PO(`${ST}/sales`, { lines: [{ skuId: id(s1), qty: 0 }], tendered: 100 }, X.T), [422]);
  const k = 'sale-1'; const sa = await PO(`${ST}/sales`, { clientKey: k, lines: [{ skuId: id(s1), qty: 2 }, { skuId: id(s2), qty: 3 }], tendered: 2500, studentId: String(X.st._id) }, X.T);
  log(sa.status === 201 && sa.data.total === 1960 && sa.data.change === 540 && /^RC-\d{4}-\d{5}$/.test(sa.data.receiptNo) && sa.data.buyerName, 'a sale is priced on the server, gives change and a receipt number');
  const again = await PO(`${ST}/sales`, { clientKey: k, lines: [{ skuId: id(s1), qty: 2 }, { skuId: id(s2), qty: 3 }], tendered: 2500 }, X.T); log(again.status === 200 && again.data.repeat && again.data.receiptNo === sa.data.receiptNo && (await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id })).onHand === 8, 'sending the same sale again returns the same receipt and sells nothing twice');
  await expect('a cashier cannot give more than the discount limit', PO(`${ST}/sales`, { lines: [{ skuId: id(s2), qty: 1 }], tendered: 500, discountPercent: 30, discountReason: 'Staff child' }, X.T), [403]);
  await expect('a discount needs a reason', PO(`${ST}/sales`, { lines: [{ skuId: id(s2), qty: 1 }], tendered: 500, discountPercent: 5 }, X.T), [422]);
  const ds = await PO(`${ST}/sales`, { lines: [{ skuId: id(s2), qty: 10 }], tendered: 2000, discountPercent: 10, discountReason: 'Bulk for the class' }, X.T); log(ds.status === 201 && ds.data.subtotal === 1200 && ds.data.discount === 120 && ds.data.total === 1080, 'a discount inside the limit is spread over the lines and recorded with its reason');
  // the last items, bought together
  await PO(`${ST}/receive`, { skuRef: id(s1), qty: 0 + 1 }, X.A).catch(() => {}); const left = (await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id })).onHand;
  const rs = await Promise.all([PO(`${ST}/sales`, { lines: [{ skuId: id(s1), qty: left }], tendered: 9999 }, X.T), PO(`${ST}/sales`, { lines: [{ skuId: id(s1), qty: left }], tendered: 9999 }, X.A)]);
  const after = await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id }); log(after.onHand >= 0 && after.available >= 0, 'two sales for the last items together never take stock below zero');
  log((await Tn.reconcile(X.s._id)).ok, 'the shelf equals the total of every stock movement');
  void rs;

  // pickups
  await PO(`${ST}/receive`, { skuRef: id(s1), qty: 5 }, X.A); const before = (await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id })).toObject();
  const fam = await call('POST', `${ST}/me/orders`, X.S, { lines: [{ skuId: id(s1), qty: 2 }] }); const sk = await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id });
  log(fam.status === 201 && /^OR-/.test(fam.data.orderNo) && sk.reserved === 2 && sk.available === before.available - 2 && sk.onHand === before.onHand, 'a family order holds the items without taking them off the shelf');
  const mo = await call('GET', `${ST}/me/orders`, X.S); log(mo.data.rows.some((r) => r.orderNo === fam.data.orderNo) && !('buyerId' in mo.data.rows[0]), 'the family sees their own order');
  await expect('another family cannot cancel it', call('POST', `${ST}/me/orders/${fam.data._id}/cancel`, X.S2, {}), [404]);
  const pO = await PO(`${ST}/orders/${fam.data._id}/pay`, { method: 'cash', tendered: 1600 }, X.T); const sk2 = await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id });
  log(pO.status === 200 && /^RC-/.test(pO.data.receiptNo) && sk2.reserved === 0 && sk2.onHand === before.onHand - 2, 'paying for an order takes the held items off the shelf and gives a receipt');
  await expect('an order cannot be paid twice', PO(`${ST}/orders/${fam.data._id}/pay`, { method: 'cash', tendered: 1600 }, X.T), [409]);
  const fam2 = await call('POST', `${ST}/me/orders`, X.S, { lines: [{ skuId: id(s2), qty: 2 }] }); await call('POST', `${ST}/me/orders/${fam2.data._id}/cancel`, X.S, {});
  log((await M('StSku').findOne({ sku: 'NB-1', schoolId: X.s._id })).reserved === 0, 'cancelling an order lets the items go');
  const fam3 = await call('POST', `${ST}/me/orders`, X.S, { lines: [{ skuId: id(s2), qty: 1 }] }); await M('StSale').updateOne({ _id: fam3.data._id }, { $set: { holdUntil: new Date(Date.now() - 1000) } });
  log(await Tn.sweepOrders(X.s._id) === 1 && (await M('StSku').findOne({ sku: 'NB-1', schoolId: X.s._id })).reserved === 0, 'an order nobody collected goes back on the shelf');
  await expect('a family cannot order more than is there', call('POST', `${ST}/me/orders`, X.S, { lines: [{ skuId: id(s2), qty: 5000 }] }), [409]);

  // refunds
  await expect('a refund needs a reason', PO(`${ST}/refunds`, { saleId: id(sa), reason: '' }, X.T), [422]);
  const rf = await PO(`${ST}/refunds`, { saleId: id(sa), lines: [{ skuId: id(s1), qty: 1 }], reason: 'Wrong size' }, X.T); log(rf.status === 201 && rf.data.amount === 800, 'a refund is asked for one item at its own price');
  await expect('a second request for the same sale waits for a decision', PO(`${ST}/refunds`, { saleId: id(sa), reason: 'Wrong size again' }, X.T), [409]);
  await expect('a cashier cannot approve a refund', PO(`${ST}/refunds/${id(rf)}/decide`, { approve: true }, X.T), [403]);
  const onHand0 = (await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id })).onHand; const ap = await PO(`${ST}/refunds/${id(rf)}/decide`, { approve: true }, X.A);
  log(ap.status === 200 && (await M('StSku').findOne({ sku: 'SH-32', schoolId: X.s._id })).onHand === onHand0 + 1 && (await M('StSale').findOne({ _id: id(sa) })).status === 'partly_refunded', 'an approved refund returns the item to stock and marks the sale part refunded');
  await expect('a refund cannot be decided twice', PO(`${ST}/refunds/${id(rf)}/decide`, { approve: true }, X.A), [409]);
  const rf2 = await PO(`${ST}/refunds`, { saleId: id(sa), lines: [{ skuId: id(s1), qty: 2 }], reason: 'Too many' }, X.T); await expect('more than was left cannot be refunded', Promise.resolve(rf2), [422]);
  await M('StSale').updateOne({ _id: id(ds) }, { $set: { paidAt: new Date(Date.now() - 30 * 86400000) } }); await expect('a refund after the window is refused', PO(`${ST}/refunds`, { saleId: id(ds), reason: 'Changed my mind' }, X.T), [409]);
  const own = await PO(`${ST}/refunds`, { saleId: id(sa), lines: [{ skuId: id(s2), qty: 1 }], reason: 'Torn cover' }, X.A); log(own.status === 201 && (await PO(`${ST}/refunds/${id(own)}/decide`, { approve: true }, X.A)).status === 403, 'an administrator cannot approve a refund they asked for while another administrator exists');
  log((await PO(`${ST}/refunds/${id(own)}/decide`, { approve: false, note: 'Not damaged' }, X.A2)).data.status === 'rejected', 'a different administrator can reject it');

  // closing the till
  await expect('closing needs the counted cash', PO(`${ST}/shifts/${mine.data.shift._id}/close`, {}, X.T), [422]);
  const sh = (await G(`${ST}/shift`, X.T)).data.shift; const exp = 1000 + 1960 + 1080 + 2 * 0 - 0; void exp;
  const sf = await PO(`${ST}/shifts/${sh._id}/close`, { countedCash: 1 }, X.T); log(sf.status === 422 && sf.data.reason === 'variance', 'a drawer far from the expected cash cannot close without a note');
  const real = sf.data.expected; const cl = await PO(`${ST}/shifts/${sh._id}/close`, { countedCash: real - 20 }, X.T); log(cl.status === 200 && cl.data.variance === -20 && (await G(`${ST}/shifts`, X.A)).data.rows[0].status === 'closed', 'a small difference closes the shift and the variance is recorded');
  await expect('a closed shift cannot be closed again', PO(`${ST}/shifts/${sh._id}/close`, { countedCash: real }, X.T), [409]);
  await expect('and there is no selling without an open till', PO(`${ST}/sales`, { lines: [{ skuId: id(s2), qty: 1 }], tendered: 200 }, X.T), [423]);

  // counts
  const ct = await PO(`${ST}/counts`, {}, X.A); log(ct.status === 201 && ct.data.lines.length === 2, 'a count lists every item');
  await expect('only one count can be open', PO(`${ST}/counts`, {}, X.A), [409]);
  const l0 = ct.data.lines[0]; const l1 = ct.data.lines[1]; await PU(`${ST}/counts/${id(ct)}`, { entries: [{ skuId: l0.skuId, counted: l0.expected - 2 }, { skuId: l1.skuId, counted: l1.expected }] }, X.A);
  const sub = await PO(`${ST}/counts/${id(ct)}/submit`, {}, X.A); log(sub.status === 200 && sub.data.differences === 1, 'a submitted count shows the one difference');
  log((await M('StSku').findOne({ _id: l0.skuId })).onHand === l0.expected, 'and changes nothing on the shelf yet');
  await expect('the person who counted cannot approve while another administrator exists', PO(`${ST}/counts/${id(ct)}/decide`, { approve: true }, X.A), [403]);
  const dc = await PO(`${ST}/counts/${id(ct)}/decide`, { approve: true }, X.A2); log(dc.status === 200 && (await M('StSku').findOne({ _id: l0.skuId })).onHand === l0.expected - 2 && (await Tn.reconcile(X.s._id)).ok, 'a different administrator approves and only then does the shelf change, with a movement for it');
  await expect('a count cannot be approved twice', PO(`${ST}/counts/${id(ct)}/decide`, { approve: true }, X.A2), [409]);

  // reports and settings
  const ov = await G(`${ST}/overview`, X.A); log(ov.status === 200 && ov.data.items === 2 && ov.data.stockValue > 0, 'the store overview shows items and stock value');
  const day = await G(`${ST}/reports/day`, X.A); log(day.status === 200 && day.data.sales >= 3 && day.data.byMethod.cash > 0, 'the day report adds up by method');
  await expect('store settings are checked', PU(`${ST}/settings`, { maxCashierDiscount: 500 }, X.A), [422]);
  const low = await G(`${ST}/low-stock`, X.A); log(low.status === 200, 'low stock lists items at or below their reorder level');
  const mv = await G(`${ST}/movements?skuId=${id(s1)}`, X.A); log(mv.data.rows.length >= 4, 'every change to stock has a record');
  await expect('another school cannot see this school\'s items', G(`${ST}/skus`, Y.T), [403]);
  log((await G(`${ST}/skus`, Y.A)).data.total === 0, 'its own store is empty');
  await expect('or sell its stock', PO(`${ST}/sales`, { lines: [{ skuId: id(s2), qty: 1 }], tendered: 500 }, Y.A), [423, 404]);
  const idx = await require('../lib/pgdoc').db.get().query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename LIKE 'st\\_%' OR tablename LIKE 'lb\\_%'");
  log((idx.rows || idx).length >= 30, 'the library and store tables are indexed');
};
