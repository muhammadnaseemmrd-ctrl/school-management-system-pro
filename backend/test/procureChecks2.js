// Purchasing (E19), part two: bills and payment, credit notes, assets, maintenance, projects, variations, reports and isolation.
module.exports = async ({ call, expect, log }, st) => {
  const { X, Y, G, PO, PA, PU, DEL, P, id, M, year, v1, v2, f2, rf, o1, os, ot, mkReq } = st;
  const lineOf = st.lineOf; const mg = require('../lib/pgdoc');

  // ── 10. supplier bills ──
  const bill = (oidv, b, t) => PO(`${P}/orders/${oidv}/bills`, { invoiceDate: '2026-11-01', dueOn: '2026-11-10', ...b }, t);
  await expect('a bill needs the supplier’s invoice number', bill(id(o1), { amount: 5000 }, X.T3), [422]);
  await expect('a teacher without the grant cannot enter a bill', bill(id(o1), { invoiceNo: 'INV-1', amount: 5000 }, X.T), [403]);
  await expect('a bill cannot fall due before its date', bill(id(o1), { invoiceNo: 'INV-1', amount: 5000, dueOn: '2026-10-01' }, X.T3), [422]);
  const over = await bill(id(o1), { invoiceNo: 'INV-OVER', amount: 6000 }, X.T3); log(over.status === 422 && over.data.reason === 'over_order', 'a bill for more than the order allows is refused');
  const b1 = await bill(id(o1), { invoiceNo: 'INV-1001', amount: 5000 }, X.T3); log(b1.status === 201 && /^BILL-\d{4}-\d{5}$/.test(b1.data.billNo) && b1.data.match === 'matched' && b1.data.status === 'entered', 'a bill for what was ordered and received matches');
  const dupe = await bill(id(o1), { invoiceNo: 'inv 1001', amount: 100 }, X.T3); log(dupe.status === 409 && dupe.data.reason === 'duplicate', 'the same invoice number from the same supplier cannot be entered twice');
  await expect('no more can be billed than the order total', bill(id(o1), { invoiceNo: 'INV-1002', amount: 500 }, X.T3), [422]);
  await expect('a bill cannot be paid before it is approved', PO(`${P}/bills/${id(b1)}/pay`, { reference: 'TRF-1' }, X.A), [409]);
  await expect('the officer who entered a bill cannot approve it', PO(`${P}/bills/${id(b1)}/decide`, { approve: true }, X.T3), [403]);
  const b1d = await PO(`${P}/bills/${id(b1)}/decide`, { approve: true }, X.A2); log(b1d.status === 200 && b1d.data.status === 'approved', 'an administrator approves a bill someone else entered');
  await expect('a payment needs a reference', PO(`${P}/bills/${id(b1)}/pay`, { method: 'cheque' }, X.A), [422]);
  await expect('a teacher officer cannot pay', PO(`${P}/bills/${id(b1)}/pay`, { method: 'cash' }, X.T3), [403]);
  const bankless = await PO(`${P}/bills/${id(b1)}/pay`, { method: 'bank_transfer', reference: 'TRF-1' }, X.A); log(bankless.status === 200, 'a bill to a supplier with an approved account is paid by bank transfer');
  const spent = await lineOf('Academic', 'Stationery'); log(spent.spent === 5000, 'payment moves the money from set aside to spent');
  await expect('a paid bill cannot be paid again', PO(`${P}/bills/${id(b1)}/pay`, { method: 'cash' }, X.A), [409]);
  await expect('a paid bill cannot be voided', PO(`${P}/bills/${id(b1)}/void`, { reason: 'Entered by mistake' }, X.A), [409]);
  const od = (await G(`${P}/orders/${id(o1)}`, X.A)).data.order; log(od.status === 'closed' && od.paidTotal === 5000 && od.committedLeft === 0, 'an order that is received and paid in full closes');
  // paying at the same moment
  const rp = await mkReq(X.A, { title: 'Pay race', items: [{ description: 'Rulers', qty: 10, unitPrice: 100 }] }); await PO(`${P}/requisitions/${id(rp)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(rp)}/decide`, { approve: true }, X.A2);
  const op = await PO(`${P}/requisitions/${id(rp)}/order`, { vendorId: id(v1) }, X.A); const lp = (await G(`${P}/orders/${id(op)}`, X.A)).data.lines[0]; await PO(`${P}/orders/${id(op)}/receive`, { lines: [{ lineId: lp._id, qty: 10 }] }, X.A);
  const bp = await bill(id(op), { invoiceNo: 'INV-RACE', amount: 1000 }, X.A); await PO(`${P}/bills/${id(bp)}/decide`, { approve: true }, X.A2);
  const before = await lineOf('Academic', 'Stationery'); const pr = await Promise.all([PO(`${P}/bills/${id(bp)}/pay`, { method: 'cheque', reference: 'CHQ-1' }, X.A), PO(`${P}/bills/${id(bp)}/pay`, { method: 'cheque', reference: 'CHQ-2' }, X.A2)]);
  const after = await lineOf('Academic', 'Stationery'); log(pr.filter((r) => r.status === 200).length === 1 && pr.filter((r) => r.status === 409).length === 1 && after.spent - before.spent === 1000, 'two administrators paying the same bill: it is paid once');
  // an administrator who entered the bill cannot also approve it
  const own = await PO(`${P}/bills/${id(bp)}/decide`, { approve: true }, X.A); log(own.status === 409, 'a paid bill cannot be decided again');
  const rm = await mkReq(X.A, { title: 'Maker bill', items: [{ description: 'Tape', qty: 10, unitPrice: 100 }] }); await PO(`${P}/requisitions/${id(rm)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(rm)}/decide`, { approve: true }, X.A2);
  const om = await PO(`${P}/requisitions/${id(rm)}/order`, { vendorId: id(v1) }, X.A); const lm = (await G(`${P}/orders/${id(om)}`, X.A)).data.lines[0]; await PO(`${P}/orders/${id(om)}/receive`, { lines: [{ lineId: lm._id, qty: 10 }] }, X.A);
  const bm = await bill(id(om), { invoiceNo: 'INV-MAKER', amount: 1000 }, X.A); const mk = await PO(`${P}/bills/${id(bm)}/decide`, { approve: true }, X.A); log(mk.status === 403 && mk.data.reason === 'maker_checker', 'an administrator cannot approve a bill they entered');
  await expect('turning a bill down needs a reason', PO(`${P}/bills/${id(bm)}/decide`, { approve: false }, X.A2), [422]);
  const rj = await PO(`${P}/bills/${id(bm)}/decide`, { approve: false, note: 'Wrong supplier invoice' }, X.A2); const afterRj = (await G(`${P}/orders/${id(om)}`, X.A)).data.order; log(rj.status === 200 && afterRj.invoicedTotal === 0, 'a bill that is turned down frees the order to be billed again');
  const bm2 = await bill(id(om), { invoiceNo: 'INV-MAKER', amount: 1000 }, X.A); log(bm2.status === 201 && bm2.data.amount === 1000, 'once a bill is turned down the same invoice can be entered again, corrected');
  // exceptions
  const ex = await bill(id(ot), { invoiceNo: 'INV-EX-1', amount: 10100 }, X.T3); log(ex.status === 201 && ex.data.match === 'exception' && /received/i.test(ex.data.matchNote), 'a bill for goods that have not arrived is an exception');
  const exNo = await PO(`${P}/bills/${id(ex)}/decide`, { approve: true }, X.A2); log(exNo.status === 422 && exNo.data.reason === 'exception', 'an exception cannot be approved without a written reason');
  await expect('a short reason is not enough', PO(`${P}/bills/${id(ex)}/decide`, { approve: true, exceptionReason: 'ok' }, X.A2), [422]);
  const exOk = await PO(`${P}/bills/${id(ex)}/decide`, { approve: true, exceptionReason: 'Supplier invoiced early, goods due Friday' }, X.A2); log(exOk.status === 200, 'with a written reason a different administrator can approve an exception');
  await expect('an officer can void a bill that is not yet paid', PO(`${P}/bills/${id(ex)}/void`, { reason: 'Hold until goods arrive' }, X.T3), [200]);
  log((await G(`${P}/orders/${id(ot)}`, X.A)).data.order.invoicedTotal === 0, 'voiding a bill frees the order to be billed again');
  // the bank must be approved and unchanged before a transfer
  const lo2 = (await G(`${P}/orders/${id(os)}`, X.A)).data.lines[0]; await PO(`${P}/orders/${id(os)}/receive`, { lines: [{ lineId: lo2._id, qty: 100 }] }, X.A);
  const bs = await bill(id(os), { invoiceNo: 'INV-BETA-1', amount: 9000 }, X.A); await PO(`${P}/bills/${id(bs)}/decide`, { approve: true }, X.A2);
  const nb = await PO(`${P}/bills/${id(bs)}/pay`, { method: 'bank_transfer', reference: 'TRF-9' }, X.A); log(nb.status === 409 && nb.data.reason === 'bank_missing', 'a bank transfer to a supplier with no approved account is refused');
  await PO(`${P}/vendors/${id(v2)}/bank`, { bank: { bankName: 'UBL', accountTitle: 'Beta Furnishers', accountNo: 'PK99TESTBANK0000000042' }, reason: 'First payment to this supplier' }, X.T3);
  const hold = await PO(`${P}/bills/${id(bs)}/pay`, { method: 'cheque', reference: 'CHQ-9' }, X.A); log(hold.status === 200, 'a cheque does not depend on the bank details');
  const rb = await mkReq(X.A, { title: 'Bank hold', items: [{ description: 'Staplers', qty: 10, unitPrice: 100 }] }); await PO(`${P}/requisitions/${id(rb)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(rb)}/decide`, { approve: true }, X.A2);
  const ob = await PO(`${P}/requisitions/${id(rb)}/order`, { vendorId: id(v2) }, X.A); const lb = (await G(`${P}/orders/${id(ob)}`, X.A)).data.lines[0]; await PO(`${P}/orders/${id(ob)}/receive`, { lines: [{ lineId: lb._id, qty: 10 }] }, X.A);
  const bb = await bill(id(ob), { invoiceNo: 'INV-BETA-2', amount: 1000 }, X.A); await PO(`${P}/bills/${id(bb)}/decide`, { approve: true }, X.A2);
  const held = await PO(`${P}/bills/${id(bb)}/pay`, { method: 'bank_transfer', reference: 'TRF-10' }, X.A); log(held.status === 409 && held.data.reason === 'bank_hold', 'payment by bank transfer is held while a bank change waits for approval');
  await PO(`${P}/vendors/${id(v2)}/bank/decide`, { approve: true }, X.A2); const paid = await PO(`${P}/bills/${id(bb)}/pay`, { method: 'bank_transfer', reference: 'TRF-10' }, X.A); log(paid.status === 200 && (await G(`${P}/bills?status=paid`, X.A)).data.rows.find((b) => b._id === id(bb)).pay.bankSnapshot === 'UBL …0042', 'once the bank change is approved the transfer goes through and records which account was used');
  // credit notes
  await expect('a credit note needs a reason', PO(`${P}/bills/${id(b1)}/credit`, { amount: 500 }, X.A), [422]);
  await expect('a credit cannot be more than the bill', PO(`${P}/bills/${id(b1)}/credit`, { amount: 9999, reason: 'Goods returned to the supplier' }, X.A), [422]);
  await expect('a teacher officer cannot issue a credit', PO(`${P}/bills/${id(b1)}/credit`, { amount: 500, reason: 'Goods returned to the supplier' }, X.T3), [403]);
  const preC = await lineOf('Academic', 'Stationery'); const bc = await PO(`${P}/bills/${id(b1)}/credit`, { amount: 500, reason: 'Goods returned to the supplier' }, X.A); const lineC = await lineOf('Academic', 'Stationery'); log(bc.status === 200 && preC.spent - lineC.spent === 500 && lineC.available - preC.available === 500, 'a credit note gives money back to the budget line');
  const credits = await Promise.all([PO(`${P}/bills/${id(b1)}/credit`, { amount: 4500, reason: 'The rest of the order was returned' }, X.A), PO(`${P}/bills/${id(b1)}/credit`, { amount: 4500, reason: 'The rest of the order was returned' }, X.A2)]);
  log(credits.filter((r) => r.status === 200).length === 1, 'two credits for the same remainder: only one is taken');
  // paying from a restricted fund
  const orf = await PO(`${P}/requisitions/${id(rf)}/order`, { vendorId: id(v1) }, X.T3); const fundRf = id(orf);
  const fl = (await G(`${P}/orders/${fundRf}`, X.A)).data.lines[0]; await PO(`${P}/orders/${fundRf}/receive`, { lines: [{ lineId: fl._id, qty: 10 }] }, X.A);
  const bf = await bill(fundRf, { invoiceNo: 'INV-CHAIRS', amount: 40000 }, X.T3); await PO(`${P}/bills/${id(bf)}/decide`, { approve: true }, X.A2); const pf = await PO(`${P}/bills/${id(bf)}/pay`, { method: 'cheque', reference: 'CHQ-40' }, X.A);
  const fnd = (await G(`${P}/funds/${id(f2)}`, X.A)).data; log(pf.status === 200 && fnd.fund.spent === 40000 && fnd.fund.committed === 0 && fnd.fund.available === 110000, 'paying for goods bought from a donor fund moves the fund from set aside to spent');
  log((await G(`${P}/reconcile`, X.A)).data.ok, 'after every payment, credit and release the books still add up');

  // ── 11. assets ──
  await expect('an asset needs a name', PO(`${P}/assets`, { name: '', category: 'it', cost: 1000 }, X.T3), [422]);
  await expect('an asset must be a known kind', PO(`${P}/assets`, { name: 'Yacht', category: 'boat', cost: 1000 }, X.T3), [422]);
  await expect('the scrap value cannot be more than the cost', PO(`${P}/assets`, { name: 'PC', category: 'it', cost: 1000, salvage: 2000 }, X.T3), [422]);
  const a1 = await PO(`${P}/assets`, { name: 'Projector Epson', category: 'it', cost: 80000, salvage: 8000, location: 'Room 4', capitalizedOn: '2026-01-15', serial: 'EP-778' }, X.T3);
  log(a1.status === 201 && /^AS\d{8}$/.test(a1.data.tag) && a1.data.usefulLifeYears === 4 && a1.data.belowThreshold === false, 'an asset gets a tag, the useful life for its kind and is above the capitalisation threshold');
  const a2 = await PO(`${P}/assets`, { name: 'Stapler', category: 'other', cost: 500 }, X.T3); log(a2.data.belowThreshold === true, 'an item below the threshold says so');
  const det = await G(`${P}/assets/${id(a1)}`, X.A); log(det.data.asset.accumulated >= 0 && det.data.schedule.length >= 4 && det.data.events.length === 1, 'an asset shows its value today, its depreciation schedule and its history');
  const bt = await G(`${P}/assets/by-tag?tag=${a1.data.tag}`, X.T3); log(bt.status === 200 && bt.data.asset.name === 'Projector Epson', 'scanning a tag finds the asset');
  const badTag = a1.data.tag.slice(0, -1) + ((Number(a1.data.tag.slice(-1)) + 1) % 10); const bt2 = await G(`${P}/assets/by-tag?tag=${badTag}`, X.T3); log(bt2.status === 422 && bt2.data.reason === 'scan', 'a misread tag is refused and the person is told to scan again');
  await expect('a tag nobody holds is not found', G(`${P}/assets/by-tag?tag=${require('../utils/procure/engine').makeTag(99999)}`, X.T3), [404]);
  await expect('a teacher without the grant cannot see the register', G(`${P}/assets`, X.T), [403]);
  // tagging a delivery
  const rl1 = (await G(`${P}/orders/${id(o1)}`, X.A)).data.lines[0];
  await expect('only what has arrived can be tagged', PO(`${P}/assets/from-order`, { orderId: id(o1), lineId: rl1._id, count: 150, category: 'other' }, X.T3), [409]);
  const tg = await PO(`${P}/assets/from-order`, { orderId: id(o1), lineId: rl1._id, count: 3, category: 'other', location: 'Store' }, X.T3); log(tg.status === 201 && tg.data.added === 3 && new Set(tg.data.assets.map((a) => a.tag)).size === 3, 'three delivered items are tagged with three different tags');
  const tgr = await Promise.all([PO(`${P}/assets/from-order`, { orderId: id(o1), lineId: rl1._id, count: 97, category: 'other' }, X.T3), PO(`${P}/assets/from-order`, { orderId: id(o1), lineId: rl1._id, count: 97, category: 'other' }, X.A)]);
  log(tgr.filter((r) => r.status === 201).length === 1 && tgr.filter((r) => r.status === 409).length === 1, 'two people tagging the same delivery together: no item is tagged twice');
  const count = await M('PcAsset').countDocuments({ schoolId: X.s._id, orderLineId: rl1._id }); log(count === 100, 'the number of tagged assets equals what arrived');
  // moving and changing
  await expect('a move needs a place or a person', PO(`${P}/assets/${id(a1)}/transfer`, {}, X.T3), [422]);
  await expect('an asset can be moved', PO(`${P}/assets/${id(a1)}/transfer`, { location: 'Room 9', custodianId: String(X.t2._id), note: 'Moved to the new lab' }, X.T3), [200]);
  await expect('a custodian must be a teacher of this school', PO(`${P}/assets/${id(a1)}/transfer`, { custodianId: String(Y.t._id) }, X.T3), [422]);
  const mv = await G(`${P}/assets/${id(a1)}`, X.A); log(mv.data.asset.location === 'Room 9' && mv.data.asset.custodianName === X.t2.name && mv.data.events.some((e) => e.kind === 'transfer'), 'a move is kept in the asset’s history');
  await expect('an asset can be sent for repair', PA(`${P}/assets/${id(a1)}`, { status: 'in_repair', note: 'Lamp failed' }, X.T3), [200]);
  await expect('a status must be one that exists', PA(`${P}/assets/${id(a1)}`, { status: 'sold' }, X.T3), [422]);
  await PA(`${P}/assets/${id(a1)}`, { status: 'in_service' }, X.T3);
  // disposal
  await expect('a disposal must say how', PO(`${P}/assets/${id(a2)}/dispose`, { reason: 'Broken beyond repair' }, X.T3), [422]);
  await expect('a disposal needs a reason', PO(`${P}/assets/${id(a2)}/dispose`, { how: 'scrap', reason: '' }, X.T3), [422]);
  await expect('a teacher officer can ask for a disposal', PO(`${P}/assets/${id(a2)}/dispose`, { how: 'scrap', reason: 'Broken beyond repair' }, X.T3), [200]);
  await expect('a disposal cannot be asked for twice', PO(`${P}/assets/${id(a2)}/dispose`, { how: 'scrap', reason: 'Broken beyond repair' }, X.T3), [409]);
  await expect('an asset waiting for disposal cannot be moved', PO(`${P}/assets/${id(a2)}/transfer`, { location: 'Store' }, X.T3), [409]);
  await expect('a teacher officer cannot decide a disposal', PO(`${P}/assets/${id(a2)}/dispose/decide`, { approve: true }, X.T3), [403]);
  const dno = await PO(`${P}/assets/${id(a2)}/dispose/decide`, { approve: false }, X.A); log(dno.status === 422, 'turning a disposal down needs a reason');
  await PO(`${P}/assets/${id(a2)}/dispose/decide`, { approve: false, note: 'Can be repaired for 200 rupees' }, X.A); log((await G(`${P}/assets/${id(a2)}`, X.A)).data.asset.status === 'in_service', 'a disposal that is turned down puts the asset back in service');
  await PO(`${P}/assets/${id(a2)}/dispose`, { how: 'sale', reason: 'Sold to staff', proceeds: 100 }, X.A); const sd = await PO(`${P}/assets/${id(a2)}/dispose/decide`, { approve: true }, X.A); log(sd.status === 403 && sd.data.reason === 'maker_checker', 'the person who asked for a disposal cannot approve it');
  const sd2 = await PO(`${P}/assets/${id(a2)}/dispose/decide`, { approve: true }, X.A2); log(sd2.status === 200 && (await G(`${P}/assets/${id(a2)}`, X.A)).data.asset.status === 'disposed', 'a different administrator approves the disposal');
  await expect('a disposed asset cannot be changed', PA(`${P}/assets/${id(a2)}`, { name: 'Changed' }, X.A), [409]);
  const labels = await call('POST', `${P}/assets/labels`, X.T3, { ids: [id(a1)] }); log(labels.status === 200, 'tags can be printed as labels');
  await expect('labels need a choice of assets', PO(`${P}/assets/labels`, {}, X.T3), [422]);
  const al = await G(`${P}/assets?q=projector`, X.A); log(al.data.total === 1 && al.data.rows[0].book !== undefined, 'the register can be searched and shows each asset’s book value');

  // ── 12. maintenance ──
  await expect('a job needs a description', PO(`${P}/tickets`, { title: '' }, X.T), [422]);
  await expect('a job about an asset needs a real tag', PO(`${P}/tickets`, { title: 'Broken', assetTag: 'AS00000013' }, X.T), [422]);
  const tk = await PO(`${P}/tickets`, { title: 'Projector will not start', assetTag: a1.data.tag, priority: 'high' }, X.T2); log(tk.status === 201 && tk.data.assetTag === a1.data.tag && tk.data.location === 'Room 9' && /^MT-/.test(tk.data.ticketNo), 'a job reported against an asset takes the asset’s place');
  const mine = await G(`${P}/tickets`, X.T2); log(mine.data.rows.length === 1 && mine.data.rows[0]._id === id(tk), 'a teacher sees only the jobs they reported');
  const allT = await G(`${P}/tickets`, X.A); log(allT.data.rows.length >= 2, 'an administrator sees every job');
  await expect('a teacher without the grant cannot manage jobs', PA(`${P}/tickets/${id(tk)}`, { status: 'assigned' }, X.T2), [403]);
  await expect('a job cannot jump from open to closed', PA(`${P}/tickets/${id(tk)}`, { status: 'closed' }, X.T3), [409]);
  await expect('finishing a job says what was done', PA(`${P}/tickets/${id(tk)}`, { status: 'done' }, X.T3), [422]);
  await expect('a job is assigned', PA(`${P}/tickets/${id(tk)}`, { status: 'assigned', assignedName: 'Mr Electrician', dueOn: '2026-12-01' }, X.T3), [200]);
  await expect('a job is done with a note and a cost', PA(`${P}/tickets/${id(tk)}`, { status: 'done', doneNote: 'Replaced the lamp', cost: 4500 }, X.T3), [200]);
  await expect('a done job is closed', PA(`${P}/tickets/${id(tk)}`, { status: 'closed' }, X.A), [200]);
  await expect('a closed job cannot be reopened', PA(`${P}/tickets/${id(tk)}`, { status: 'open' }, X.A), [409]);
  const dtl = await G(`${P}/assets/${id(a1)}`, X.A); log(dtl.data.tickets.length === 1 && dtl.data.tickets[0].cost === 4500, 'an asset’s page lists its repair jobs with their cost');
  // routines
  await expect('a routine needs a frequency', PO(`${P}/plans`, { task: 'Service the generator', firstDueOn: '2026-11-01' }, X.T3), [422]);
  const pl = await PO(`${P}/plans`, { task: 'Service the generator', everyDays: 90, firstDueOn: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10), leadDays: 7, location: 'Generator room' }, X.T3); log(pl.status === 201 && pl.data.leadDays === 7, 'a routine is set up with how often and how early to open the job');
  const sw1 = await PO(`${P}/sweep`, {}, X.A); log(sw1.status === 200 && sw1.data.tickets === 1, 'the daily sweep opens the job when the routine is due');
  const sw2 = await PO(`${P}/sweep`, {}, X.A); log(sw2.data.tickets === 0 && (await M('PcTicket').find({ schoolId: X.s._id })).filter((t) => t.planKey).length === 1, 'running the sweep twice does not open the same job twice');
  const sweepRace = await Promise.all([PO(`${P}/sweep`, {}, X.A), PO(`${P}/sweep`, {}, X.A2)]); log(sweepRace.every((r) => r.status === 200) && (await M('PcTicket').find({ schoolId: X.s._id })).filter((t) => t.planKey).length === 1, 'two sweeps at the same moment still make one job');
  await expect('a routine can be switched off', PA(`${P}/plans/${id(pl)}`, { active: false }, X.T3), [200]);
  // contracts and forecast
  await expect('a contract needs a title and an amount', PO(`${P}/contracts`, { title: '', amount: 0 }, X.A), [422]);
  await expect('a contract cannot end before it starts', PO(`${P}/contracts`, { title: 'Bad', amount: 100, startOn: '2026-06-01', endOn: '2026-01-01' }, X.A), [422]);
  await expect('a teacher officer cannot save a contract', PO(`${P}/contracts`, { title: 'Internet', amount: 30000, startOn: '2026-01-01' }, X.T3), [403]);
  const ct = await PO(`${P}/contracts`, { title: 'Internet', kind: 'utility', amount: 30000, frequency: 'monthly', startOn: '2026-01-01', endOn: '2026-12-31', noticeDays: 30, vendorId: id(v1) }, X.A); const ct2 = await PO(`${P}/contracts`, { title: 'Guard service', amount: 90000, frequency: 'quarterly', startOn: '2026-01-15' }, X.A);
  log(ct.status === 201 && ct2.status === 201, 'running contracts are saved');
  const fc = await G(`${P}/forecast?from=2026-01-01&to=2026-12-31`, X.T3); log(fc.data.total === 12 * 30000 + 4 * 90000 && fc.data.months.length === 12 && fc.data.contracts === 2, 'the forecast adds every month and quarter in the year');
  const sw3 = await PO(`${P}/sweep`, {}, X.A); log(sw3.status === 200 && sw3.data.noticed >= 0, 'the sweep also watches contracts that are ending');
  await expect('a contract can be changed', PA(`${P}/contracts/${id(ct)}`, { amount: 33000 }, X.A), [200]);

  // ── 13. projects and variations ──
  await expect('a project needs a title and a cost', PO(`${P}/projects`, { title: '', proposed: 0 }, X.T3), [422]);
  const pj = await PO(`${P}/projects`, { title: 'Science block', proposed: 1500000, milestones: [{ title: 'Foundation', amount: 300000, dueOn: '2027-01-31' }, { title: 'Roof', amount: 500000 }] }, X.T3); log(pj.status === 201 && /^PRJ-/.test(pj.data.code) && pj.data.phase === 'proposed' && pj.data.milestones.length === 2, 'a teacher officer proposes a project with milestones');
  await expect('a project cannot be built before it is approved', PO(`${P}/projects/${id(pj)}/milestones/m1`, { done: true }, X.T3), [409]);
  await expect('a teacher officer cannot approve a project', PO(`${P}/projects/${id(pj)}/approve`, {}, X.T3), [403]);
  await expect('approval names the budget line the money comes from', PO(`${P}/projects/${id(pj)}/approve`, {}, X.A), [422]);
  const fl2 = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Facilities').lines; const conLine = fl2.find((l) => l.category === 'Construction');
  const pa = await PO(`${P}/projects/${id(pj)}/approve`, { budgetLineId: conLine._id, authorized: 1500000 }, X.A); log(pa.status === 200, 'an administrator approves the project against a construction budget line');
  await expect('the project cannot be approved twice', PO(`${P}/projects/${id(pj)}/approve`, { budgetLineId: conLine._id }, X.A2), [409]);
  await expect('a milestone is ticked off', PO(`${P}/projects/${id(pj)}/milestones/m1`, { done: true, note: 'Poured on Monday' }, X.T3), [200]);
  await expect('a milestone that is not on the project is not found', PO(`${P}/projects/${id(pj)}/milestones/m9`, { done: true }, X.T3), [404]);
  const rj1 = await mkReq(X.A, { title: 'Cement', category: 'Construction', costCentre: 'Facilities', projectId: id(pj), items: [{ description: 'Cement bags', qty: 40, unitPrice: 1200 }] }); const sj = await PO(`${P}/requisitions/${id(rj1)}/submit`, {}, X.A);
  await PO(`${P}/requisitions/${id(rj1)}/decide`, { approve: true }, X.A2); const pj1 = (await G(`${P}/projects/${id(pj)}`, X.A)).data.project; log(sj.status === 200 && pj1.committed === 48000 && pj1.available === 1452000, 'a request raised for a project sets money aside on the project too');
  await expect('a project with money set aside cannot be cancelled', PO(`${P}/projects/${id(pj)}/phase`, { phase: 'cancelled', note: 'Plans changed' }, X.A), [409]);
  await expect('a project cannot jump to completed', PO(`${P}/projects/${id(pj)}/phase`, { phase: 'completed' }, X.A), [409]);
  await expect('a project moves to building', PO(`${P}/projects/${id(pj)}/phase`, { phase: 'building' }, X.A), [200]);
  // change orders
  await expect('a change order needs a kind and a reason', PO(`${P}/projects/${id(pj)}/changes`, { kind: 'increase', amount: 1 }, X.T3), [422]);
  const ch = await PO(`${P}/projects/${id(pj)}/changes`, { kind: 'increase', amount: 200000, reason: 'Steel prices went up this month' }, X.T3); log(ch.status === 201 && /^CHG-/.test(ch.data.chgNo), 'a change order is asked for with an amount and a reason');
  await expect('a teacher officer cannot decide a change order', PO(`${P}/changes/${id(ch)}/decide`, { approve: true }, X.T3), [403]);
  await PO(`${P}/changes/${id(ch)}/decide`, { approve: true }, X.A2); const pj2 = (await G(`${P}/projects/${id(pj)}`, X.A)).data.project; log(pj2.authorized === 1700000 && pj2.available === 1652000, 'an approved increase raises what the project may spend');
  await expect('a change order cannot be decided twice', PO(`${P}/changes/${id(ch)}/decide`, { approve: true }, X.A2), [409]);
  // variations
  const bl = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines; const furn = bl.find((l) => l.category === 'Furniture'); const labL = bl.find((l) => l.category === 'Lab equipment');
  await expect('a variation needs a reason', PO(`${P}/variations`, { kind: 'move', fromLineId: furn._id, toLineId: labL._id, amount: 1000 }, X.A), [422]);
  await expect('a move needs two different lines', PO(`${P}/variations`, { kind: 'move', fromLineId: labL._id, toLineId: labL._id, amount: 1000, reason: 'Move between lines' }, X.A), [422]);
  await expect('a move cannot take more than the line has left', PO(`${P}/variations`, { kind: 'move', fromLineId: labL._id, toLineId: furn._id, amount: 99999999, reason: 'Too big a move' }, X.A), [409]);
  const vr = await PO(`${P}/variations`, { kind: 'move', fromLineId: furn._id, toLineId: labL._id, amount: 20000, reason: 'More lab kit is needed this term' }, X.A); log(vr.status === 201 && /^BV-/.test(vr.data.varNo), 'a variation to move budget between lines is requested');
  const vSelf = await PO(`${P}/variations/${id(vr)}/decide`, { approve: true }, X.A); log(vSelf.status === 403 && vSelf.data.reason === 'maker_checker', 'the person who asked for a variation cannot approve it');
  const before2 = bl.find((l) => l.category === 'Lab equipment').amount; await PO(`${P}/variations/${id(vr)}/decide`, { approve: true }, X.A2); const after2 = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Lab equipment');
  log(after2.amount === before2 + 20000 && after2.available === labL.available + 20000, 'an approved move changes both lines and their available money');
  await expect('a variation cannot be decided twice', PO(`${P}/variations/${id(vr)}/decide`, { approve: true }, X.A2), [409]);

  // ── 14. reports ──
  for (const n of ['budget', 'funds', 'pipeline', 'payables', 'projects', 'assets', 'vendors', 'contracts']) { const r = await G(`${P}/reports/${n}`, X.A); log(r.status === 200, `the ${n} report opens`); }
  await expect('an unknown report is not found', G(`${P}/reports/payroll`, X.A), [404]);
  await expect('a teacher officer cannot open reports', G(`${P}/reports/budget`, X.T3), [403]);
  const csv = await call('GET', `${P}/reports/vendors?format=csv`, X.A); log(csv.status === 200, 'a report can be downloaded as a spreadsheet');
  const pay = (await G(`${P}/reports/payables`, X.A)).data; log(pay.rows.every((r) => r.daysLate >= 0) && pay.total >= 0, 'unpaid bills are listed with how late they are');
  const vend = (await G(`${P}/reports/vendors`, X.A)).data; const alpha = vend.rows.find((r) => r.vendor === 'Alpha Stationers'); log(alpha && alpha.bills >= 2 && alpha.paid > 0, 'spending by supplier counts paid bills after credit notes');
  const reg = (await G(`${P}/reports/assets`, X.A)).data; log(reg.totals.count === reg.rows.length && reg.totals.book <= reg.totals.cost, 'the asset register adds up and book value is never more than cost');
  const ov = await G(`${P}/overview`, X.A); log(ov.status === 200 && ov.data.waiting && ov.data.budget.amount > 0 && ov.data.assets.count > 0, 'the overview shows what is waiting and the budget position');
  log((await G(`${P}/reconcile`, X.A)).data.ok, 'at the end every fund, budget line and project still equals its entries');

  // ── 15. one school never sees another's ──
  const yv = await PO(`${P}/vendors`, { name: 'Alpha Stationers', taxNo: 'NTN-1111' }, Y.A); log(yv.status === 201, 'another school can use the same supplier name and tax number');
  log((await G(`${P}/vendors`, Y.A)).data.total === 1 && (await G(`${P}/assets`, Y.A)).data.total === 0 && (await G(`${P}/orders`, Y.A)).data.total === 0 && (await G(`${P}/requisitions`, Y.A)).data.rows.length === 0, 'another school sees none of this school’s suppliers, assets, orders or requests');
  await expect('another school cannot open our request', G(`${P}/requisitions/${id(st.r1)}`, Y.A), [404]);
  await expect('another school cannot pay our bill', PO(`${P}/bills/${id(b1)}/pay`, { method: 'cash' }, Y.A), [404]);
  await expect('another school cannot tag our order', PO(`${P}/assets/from-order`, { orderId: id(o1), lineId: rl1._id, count: 1, category: 'other' }, Y.A), [404]);
  await expect('another school cannot move our asset', PO(`${P}/assets/${id(a1)}/transfer`, { location: 'Elsewhere' }, Y.A), [404]);
  await expect('another school cannot read our project', G(`${P}/projects/${id(pj)}`, Y.A), [404]);
  await expect('another school’s settings are its own', G(`${P}/settings`, Y.A).then((r) => ({ ...r, status: r.data.version === 1 ? 200 : 500 })), [200]);
  log((await G(`${P}/reconcile`, Y.A)).data.ok, 'the other school’s books are untouched');
  const tcron = await call('GET', '/cron/procure', null); log([401, 503].includes(tcron.status), 'the daily purchasing job is closed to anyone without the secret');
  const idx = await mg.db.get().query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename LIKE 'pc\\_%'"); log((idx.rows || idx).length >= 45, 'the purchasing tables are indexed');
};
