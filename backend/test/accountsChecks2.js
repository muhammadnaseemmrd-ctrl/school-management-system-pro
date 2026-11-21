// School ledger (E23), part 2: automatic postings from fees, pay runs, bills and store sales, statements, reconciliation, isolation.
module.exports = async ({ call, expect, log, tokens, base, X, Y, Z, E, M, mk, today, ymNow, m0, m1, m2, start, line, P, G, PO, PA, PU, DEL, id }) => {
  const mg = require('../lib/pgdoc'); const now = new Date(); const oidn = () => new mg.Types.ObjectId();
  console.log('\n— School ledger: automatic postings and statements —');
  const F = await mk('LED004'); await F.grant(F.tA, 'accounts.prepare'); await F.grant(F.tC, 'accounts.approve'); await F.grant(F.tU, 'accounts.audit');
  await expect('the school sets up its ledger', PO(`${P}/setup`, { startDate: start, fiscalStartMonth: 7 }, F.A), [200]);
  const sid = F.s._id; const day = 86400000;
  const run = async (tok, b) => (await PO(`${P}/feeds/run`, b || {}, tok || F.TC)).data;
  const bal = async (code, to) => (await G(`${P}/ledger?code=${code}&from=${start}&to=${to || today}`, F.TU)).data.closing;
  const trace = async (type, rid, tok) => (await G(`${P}/trace/${type}/${rid}`, tok || F.TU)).data;
  const lines = async (type, rid) => { const t = await trace(type, rid); const out = []; for (const j of t.journals) out.push(...(await G(`${P}/journals/${j._id}`, F.TU)).data.lines); return out; };
  const net = (ls, code) => ls.filter((l) => l.code === code).reduce((s, l) => s + l.debit - l.credit, 0);

  await expect('an accountant cannot start the automatic postings', PO(`${P}/feeds/run`, {}, F.TA), [403]);
  await expect('nothing to post at first', PO(`${P}/feeds/run`, {}, F.TC), [200]);

  // fee invoices
  const inv1 = await M('FeeInvoice').create({ schoolId: sid, studentId: oidn(), number: 'INV-T-1', challanCode: '90000001', issueDate: now, dueDate: new Date(now.getTime() + 10 * day), lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 10000, discount: 0, net: 10000 }, { key: 'c', kind: 'charge', title: 'Lab fee', amount: 2000, discount: 0, net: 2000 }], total: 12000, paid: 0, status: 'Open' });
  const r1 = await run(); log(r1.ready && r1.posted === 1 && r1.held.length === 0, 'a fee invoice is posted by itself');
  let ls = await lines('fee_invoice', String(inv1._id)); log(net(ls, '1200') === 12000 && net(ls, '4100') === -10000 && net(ls, '4110') === -2000, 'the invoice: fee receivable up, tuition and other fees as income');
  const tj = (await trace('fee_invoice', String(inv1._id))); log(tj.journals.length === 1 && tj.journals[0].type === 'system' && tj.journals[0].status === 'posted' && tj.source.refNo === 'INV-T-1', 'the journal is traced to the invoice and the invoice to the journal');
  const jc = await M('AcJournal').countDocuments({ schoolId: sid }); const r2 = await run(); log(r2.posted === 0 && r2.changed === 0 && (await M('AcJournal').countDocuments({ schoolId: sid })) === jc, 'running again changes nothing');
  const r2f = await run(F.A, { full: true }); log(r2f.posted === 0 && r2f.changed === 0 && r2f.scanned >= 1, 'a full run over everything again changes nothing either');

  // payments
  const pay1 = await M('FeePayment').create({ schoolId: sid, studentId: oidn(), amount: 5000, method: 'cash', receivedAt: now, status: 'Confirmed', receiptNo: 'R-T-1', allocations: [{ invoiceId: String(inv1._id), invoiceNumber: 'INV-T-1', amount: 5000, at: now }] });
  await run(); ls = await lines('fee_payment', String(pay1._id)); log(net(ls, '1010') === 5000 && net(ls, '1200') === -5000 && ls.length === 2, 'a cash payment: cash up, receivable down');
  const pay2 = await M('FeePayment').create({ schoolId: sid, studentId: oidn(), amount: 3000, method: 'bank', receivedAt: now, status: 'Confirmed', receiptNo: 'R-T-2', allocations: [] });
  await run(); ls = await lines('fee_payment', String(pay2._id)); log(net(ls, '1020') === 3000 && net(ls, '2200') === -3000, 'money not yet allocated is held as fees received in advance');
  await M('FeePayment').create({ schoolId: sid, studentId: oidn(), amount: 900, method: 'cash', receivedAt: now, status: 'Pending', receiptNo: 'R-T-3' }); await M('FeePayment').create({ schoolId: sid, studentId: oidn(), amount: 800, method: 'cash', receivedAt: now, status: 'Rejected', receiptNo: 'R-T-4' });
  const rp = await run(); log(rp.posted === 0 && (await bal('1010')) === 5000, 'pending and rejected payments post nothing');

  // changes follow the source
  await M('FeeInvoice').updateOne({ _id: inv1._id }, { $set: { adjusted: 1000 } }); const rc = await run(); log(rc.changed === 1, 'a credit note on the invoice is a change');
  ls = await lines('fee_invoice', String(inv1._id)); log(net(ls, '1200') === 11000 && net(ls, '5900') === 1000, 'it posts only the difference: concessions up, receivable down');
  await M('FeeInvoice').updateOne({ _id: inv1._id }, { $set: { adjusted: 1500, writtenOff: 500 } }); await run(); ls = await lines('fee_invoice', String(inv1._id)); log(net(ls, '5400') === 500 && net(ls, '5900') === 1000 && net(ls, '1200') === 10500, 'a write-off goes to bad debts, the rest stays a concession');
  const inv2 = await M('FeeInvoice').create({ schoolId: sid, studentId: oidn(), number: 'INV-T-2', challanCode: '90000002', issueDate: now, dueDate: new Date(now.getTime() + 10 * day), lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 4000, discount: 0, net: 4000 }, { key: 'l', kind: 'charge', title: 'Late fee', amount: 100, net: 100, lateFee: true }], total: 4100, status: 'Open' });
  await run(); ls = await lines('fee_invoice', String(inv2._id)); log(net(ls, '4190') === -100 && net(ls, '4100') === -4000, 'late fees go to their own income account');
  await M('FeeInvoice').updateOne({ _id: inv2._id }, { $set: { status: 'Void', voidReason: 'Issued twice' } }); await run(); ls = await lines('fee_invoice', String(inv2._id)); log(net(ls, '1200') === 0 && net(ls, '4100') === 0 && net(ls, '4190') === 0 && (await trace('fee_invoice', String(inv2._id))).journals.length === 2, 'a void invoice is reversed out, and both journals stay');
  await M('FeePayment').updateOne({ _id: pay2._id }, { $set: { refunded: 1000, refunds: [{ adjustmentId: 'a1', voucherNo: 'V-1', amount: 1000, at: now }] } }); await run(); ls = await lines('fee_payment', String(pay2._id)); log(net(ls, '1020') === 2000 && net(ls, '2200') === -2000, 'a refund brings the cash and the advance down');
  log((await bal('1200')) === 5500, 'the fee receivable in the books equals the open invoice balances (10500 less 5000 paid)');
  const preInv = await M('FeeInvoice').create({ schoolId: sid, studentId: oidn(), number: 'INV-OLD', challanCode: '90000009', issueDate: new Date(Date.parse(`${start}T00:00:00Z`) - 40 * day), dueDate: now, lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 700, net: 700 }], total: 700, status: 'Open' });
  const rs = await run(F.A, { full: true }); log(rs.skipped >= 1 && (await trace('fee_invoice', String(preInv._id))).journals.length === 0, 'an invoice from before the ledger started is left to the opening balances');
  const sug = await expect('the opening balances can be suggested', G(`${P}/opening-suggestion`, F.TA), [200]); log(sug.data.startDate === start && sug.data.feeReceivable >= 700 && typeof sug.data.note === 'string', 'the suggestion counts older open invoices');

  // pay runs
  const pb = await M('PayrollBatch').create({ schoolId: sid, period: ymNow, version: 1, status: 'Finalized', finalizedAt: now, lines: [{ employeeId: 'e1', code: 'E1', name: 'A', gross: 100000, tax: 5000, advance: 2000, net: 90000 }, { employeeId: 'e2', code: 'E2', name: 'B', gross: 50000, tax: 0, advance: 0, net: 48000 }], totals: { gross: 150000, deductions: 12000, net: 138000, employees: 2 } });
  await run(); ls = await lines('payroll', String(pb._id)); log(net(ls, '5100') === 150000 && net(ls, '2310') === -138000 && net(ls, '2320') === -5000 && net(ls, '1250') === -2000 && net(ls, '2330') === -5000, 'a finalized pay run: salaries expense, net pay owed, tax, advance recovery and other deductions');
  await M('PayrollBatch').create({ schoolId: sid, period: ymNow, version: 2, status: 'Draft', lines: [], totals: {} }); await run(); log((await bal('5100')) === 150000, 'a draft pay run posts nothing');
  await M('PayrollBatch').updateOne({ _id: pb._id }, { $set: { status: 'Superseded' } }); await run(); log((await bal('5100')) === 0 && (await bal('2310')) === 0, 'a superseded pay run is taken out again');
  const adv = await M('StaffAdvance').create({ schoolId: sid, employeeId: oidn(), amount: 4000, monthlyRecovery: 1000, status: 'Active', decidedAt: now }); await run(); ls = await lines('advance', String(adv._id)); log(net(ls, '1250') === 4000 && net(ls, '1010') === -4000, 'an approved staff advance: advances up, cash down');

  // supplier bills, from a purchasing grant
  const pcf = await M('PcFund').create({ schoolId: sid, name: 'Robotics grant', kind: 'grant', status: 'active' });
  const ord = await M('PcOrder').create({ schoolId: sid, poNo: 'PO-T-1', requisitionId: oidn(), vendorId: oidn(), vendorName: 'Tech Supplies', title: 'Robot kits', category: 'IT equipment', fundId: pcf._id, total: 7000, status: 'received' });
  const bill = await M('PcInvoice').create({ schoolId: sid, billNo: 'BILL-T-1', vendorId: ord.vendorId, vendorName: 'Tech Supplies', orderId: ord._id, invoiceNo: 'TS-100', invoiceKey: 'ts100', amount: 7000, status: 'approved', approvedAt: now });
  await run(); ls = await lines('bill', String(bill._id)); log(net(ls, '1500') === 7000 && net(ls, '2100') === -7000, 'an approved bill for equipment is added to fixed assets and owed to the supplier');
  const fl = (await G(`${P}/funds`, F.TU)).data.funds.find((f) => f.pcFundId === String(pcf._id)); log(fl && fl.name === 'Robotics grant (purchasing)' && fl.kind === 'grant' && fl.spent === 7000, 'the purchasing grant appears as a ledger fund and the bill is charged to it');
  await M('PcInvoice').updateOne({ _id: bill._id }, { $set: { status: 'paid', pay: { method: 'bank', reference: 'CH-9', paidOn: today } } }); await run(); ls = await lines('bill_payment', String(bill._id)); log(net(ls, '2100') === 7000 && net(ls, '1020') === -7000 && (await bal('2100')) === 0, 'paying the bill clears what is owed and takes the money from the bank');
  const ord2 = await M('PcOrder').create({ schoolId: sid, poNo: 'PO-T-2', requisitionId: oidn(), vendorId: oidn(), title: 'Chalk', category: 'Stationery', total: 300 });
  const bill2 = await M('PcInvoice').create({ schoolId: sid, billNo: 'BILL-T-2', vendorId: ord2.vendorId, orderId: ord2._id, invoiceNo: 'CH-1', invoiceKey: 'ch1', amount: 300, status: 'approved', approvedAt: now }); await run(); ls = await lines('bill', String(bill2._id)); log(net(ls, '5200') === 300, 'an everyday purchase goes to the expense account for its category');
  await M('PcInvoice').updateOne({ _id: bill2._id }, { $set: { status: 'rejected' } }); await run(); log((await bal('5200')) === 0, 'a rejected bill is taken out');

  // store sales
  const sale = await M('StSale').create({ schoolId: sid, receiptNo: 'S-T-1', orderNo: 'O-T-1', ckey: 'ck-t-1', status: 'paid', total: 1500, method: 'cash', paidAt: now });
  await run(); ls = await lines('store_sale', String(sale._id)); log(net(ls, '1010') === 1500 && net(ls, '4300') === -1500, 'a store sale: cash up, store income up');
  await M('StSale').updateOne({ _id: sale._id }, { $set: { status: 'partly_refunded', refundedTotal: 500 } }); await run(); ls = await lines('store_sale', String(sale._id)); log(net(ls, '4300') === -1000 && net(ls, '1010') === 1000, 'a refund brings the sale down to what was kept');
  await M('StSale').create({ schoolId: sid, receiptNo: 'S-T-R', orderNo: 'O-T-R', ckey: 'ck-t-r', status: 'reserved', total: 999, method: 'cash', paidAt: null }); const rr = await run(); log(rr.posted === 0, 'a reserved order that is not paid posts nothing');

  // things that go wrong
  await M('AcAccount').updateOne({ schoolId: sid, code: '4300' }, { $set: { active: false } });
  const sale2 = await M('StSale').create({ schoolId: sid, receiptNo: 'S-T-2', orderNo: 'O-T-2', ckey: 'ck-t-2', status: 'paid', total: 400, method: 'cash', paidAt: now });
  const rh = await run(); log(rh.held.length === 1 && /4300/.test(rh.held[0].text) && (await trace('store_sale', String(sale2._id))).journals.length === 0, 'a posting that cannot be made is held with the reason, not lost');
  const ov = await G(`${P}/overview`, F.TU); log(ov.data.feed.heldCount === 1 && /switched off/.test(ov.data.feed.held[0].text), 'the overview shows what is on hold');
  const ck = await G(`${P}/periods/${m0}/checklist`, F.TU); log(ck.data.warnings.some((w) => /on hold/.test(w)), 'and so does the month-end checklist');
  await M('AcAccount').updateOne({ schoolId: sid, code: '4300' }, { $set: { active: true } }); const rh2 = await run(F.A, { full: true }); log(rh2.held.length === 0 && (await trace('store_sale', String(sale2._id))).journals.length === 1, 'once the account is back, a full run posts it');
  const inv3 = await M('FeeInvoice').create({ schoolId: sid, studentId: oidn(), number: 'INV-T-3', challanCode: '90000003', issueDate: now, dueDate: now, lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 3000, net: 3000 }], total: 3000, status: 'Open' });
  await Promise.all([run(), run(), run(F.A, { full: true })]); log((await trace('fee_invoice', String(inv3._id))).journals.length === 1 && (await bal('1200')) === 8500, 'three runs at once post a new invoice exactly once');
  const dupe = await M('AcJournal').create({ schoolId: sid, number: 'JE-DUP-1', date: today, ym: ymNow, type: 'system', status: 'draft', memo: 'x', lines: [], sourceKey: 'fee_invoice:dupe#1' }); let dupErr = null; try { await M('AcJournal').create({ schoolId: sid, number: 'JE-DUP-2', date: today, ym: ymNow, type: 'system', status: 'draft', memo: 'x', lines: [], sourceKey: 'fee_invoice:dupe#1' }); } catch (e) { dupErr = e; }
  log(!!dupErr && (dupErr.code === 11000 || /unique|duplicate/i.test(dupErr.message)), 'the same source revision cannot be posted twice (unique index)'); await M('AcJournal').deleteOne({ _id: dupe._id });
  let dupLine = null; const anyLine = await M('AcLine').findOne({ schoolId: sid }); try { await M('AcLine').create({ schoolId: sid, journalId: anyLine.journalId, seq: anyLine.seq, date: today, ym: ymNow, code: '1010', kind: 'asset', debit: 1 }); } catch (e) { dupLine = e; }
  log(!!dupLine, 'a journal line position cannot be written twice (unique index)');

  // months and shifting
  await expect('an accountant asks to close the oldest month', PO(`${P}/periods/${m0}/close`, {}, F.TA), [200]); await expect('and the controller signs it off', PO(`${P}/periods/${m0}/approve`, {}, F.TC), [200]);
  const inv4 = await M('FeeInvoice').create({ schoolId: sid, studentId: oidn(), number: 'INV-T-4', challanCode: '90000004', issueDate: new Date(Date.parse(`${m0}-10T08:00:00Z`)), dueDate: now, lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 2000, net: 2000 }], total: 2000, status: 'Open' });
  await run(); const t4 = await trace('fee_invoice', String(inv4._id)); log(t4.journals.length === 1 && t4.journals[0].shifted === true && t4.journals[0].date === `${m1}-01` && t4.journals[0].ym === m1, 'an invoice dated in a closed month is posted in the next open month and marked as moved');

  // statements
  const tb = (await G(`${P}/statements/trial-balance`, F.TU)).data; log(tb.balanced && tb.totalDebit === tb.totalCredit && tb.totalDebit > 0, 'the trial balance balances');
  const bs = (await G(`${P}/statements/balance-sheet`, F.TU)).data; log(bs.balanced && bs.totalAssets === bs.totalLiabilities + bs.totalNetAssets && bs.totalAssets > 0, 'assets equal liabilities plus net assets');
  const ie = (await G(`${P}/statements/income-expenditure?from=${start}&to=${today}`, F.TU)).data; log(ie.totalIncome > 0 && ie.surplus === ie.totalIncome - ie.totalExpense && ie.surplus === bs.accumulatedSurplus, 'income and expenditure agrees with the surplus on the balance sheet');
  const rpay = (await G(`${P}/statements/receipts-payments?from=${start}&to=${today}`, F.TU)).data; const cashNow = (tb.rows.find((r) => r.code === '1010')?.balance || 0) + (tb.rows.find((r) => r.code === '1020')?.balance || 0);
  log(rpay.closing === cashNow && rpay.opening === 0 && rpay.totalReceipts > 0 && rpay.receipts.every((r) => r.amount > 0), 'receipts and payments end at the cash and bank balance');
  log(rpay.receipts.reduce((s, r) => s + r.amount, 0) === rpay.totalReceipts && rpay.payments.reduce((s, r) => s + r.amount, 0) === rpay.totalPayments, 'and each side adds up');
  const fyF = E.fyOf(ymNow, 7); const bvF = (await G(`${P}/statements/budget?fy=${fyF}`, F.TU)).data; log(bvF.status === 'none' && bvF.rows.some((r) => r.code === '4100' && r.actualYtd > 0), 'with no budget the report still shows actuals');
  await expect('an unknown statement is not found', G(`${P}/statements/nonsense`, F.TU), [404]); await expect('a ledger needs a real account', G(`${P}/ledger?code=0000`, F.TU), [404]);
  await expect('the end date cannot be before the start', G(`${P}/statements/income-expenditure?from=${today}&to=${start}`, F.TU), [422]);
  const jm = await PO(`${P}/journals`, { date: today, memo: 'Formula test', lines: [line('1010', 10, 0, { memo: '=1+1' }), line('4900', 0, 10, { memo: '@sum' })] }, F.TA); await PO(`${P}/journals/${id(jm)}/submit`, {}, F.TA); await PO(`${P}/journals/${id(jm)}/decide`, { decision: 'approve' }, F.TC);
  const lcsv = await (await fetch(`${base}/api${P}/ledger?code=4900&from=${start}&to=${today}&format=csv`, { headers: { authorization: `Bearer ${F.TU}` } })).text(); log(lcsv.includes("'@sum") && !/,@sum/.test(lcsv), 'a description that starts like a formula is made safe in the download');

  // bank reconciliation
  await expect('only a bank account can be reconciled', PO(`${P}/recons`, { code: '1010', ym: ymNow, statementBalance: 0 }, F.TA), [422]);
  await expect('the month must look right', PO(`${P}/recons`, { code: '1020', ym: '2026-13', statementBalance: 0 }, F.TA), [422]);
  const tbNow = (await G(`${P}/statements/trial-balance?asOf=${E.lastDay(ymNow)}`, F.TU)).data; const lb = tbNow.rows.find((r) => r.code === '1020').balance;
  const rc0 = await expect('a reconciliation is started', PO(`${P}/recons`, { code: '1020', ym: ymNow, statementBalance: lb - 500, items: [] }, F.TA), [200]); log(rc0.data.difference === 500 && rc0.data.ledgerBalance === lb, 'the ledger balance is worked out and the difference shown');
  await expect('it cannot be signed with an unexplained difference', PO(`${P}/recons/${id(rc0)}/sign`, {}, F.TC), [422]);
  const rc1 = await expect('the difference is explained', PO(`${P}/recons`, { code: '1020', ym: ymNow, statementBalance: lb - 500, items: [{ kind: 'deposit_in_transit', text: 'Cheque banked on the last day', amount: 500 }] }, F.TA), [200]); log(rc1.data.difference === 0 && id(rc1) === id(rc0), 'the same record is updated and now agrees');
  await expect('the preparer cannot sign it', PO(`${P}/recons/${id(rc1)}/sign`, {}, F.TA), [403]);
  await expect('an auditor cannot sign it', PO(`${P}/recons/${id(rc1)}/sign`, {}, F.TU), [403]);
  await expect('someone else signs it', PO(`${P}/recons/${id(rc1)}/sign`, {}, F.TC), [200]);
  await expect('a signed reconciliation cannot be changed', PO(`${P}/recons`, { code: '1020', ym: ymNow, statementBalance: 1, items: [] }, F.TA), [409]);
  await expect('only an administrator reopens it, with a reason', PO(`${P}/recons/${id(rc1)}/reopen`, { reason: '' }, F.A), [422]);
  await expect('and it is reopened', PO(`${P}/recons/${id(rc1)}/reopen`, { reason: 'A cheque bounced' }, F.A), [200]);
  await PO(`${P}/recons/${id(rc1)}/sign`, {}, F.A2).then(() => null);
  await expect('settings can require a reconciliation before a month closes', PU(`${P}/settings`, { reason: 'Auditor asked for it', settings: { requireReconciliation: true } }, F.A), [200]);
  await expect('then closing a month without one is refused', PO(`${P}/periods/${m1}/close`, {}, F.TA), [422]);
  const lb1 = (await G(`${P}/statements/trial-balance?asOf=${E.lastDay(m1)}`, F.TU)).data.rows.find((r) => r.code === '1020')?.balance || 0;
  const rm1 = await PO(`${P}/recons`, { code: '1020', ym: m1, statementBalance: lb1, items: [] }, F.TA); await expect('a reconciliation for that month is signed', PO(`${P}/recons/${id(rm1)}/sign`, {}, F.TC), [200]);
  await expect('and now the month can be closed', PO(`${P}/periods/${m1}/close`, {}, F.TA), [200]);
  await expect('and signed off by someone else', PO(`${P}/periods/${m1}/approve`, {}, F.A2), [200]);
  await expect('a signed reconciliation of a closed month cannot be reopened', PO(`${P}/recons/${id(rm1)}/reopen`, { reason: 'Need to look again' }, F.A), [409]);
  const rl = await G(`${P}/recons?ym=${ymNow}`, F.TU); log(rl.data.rows.length === 1 && rl.data.rows[0].status === 'signed', 'reconciliations are listed with their state');

  // overview and checks
  const ov2 = await G(`${P}/overview`, F.TU); log(ov2.status === 200 && ov2.data.ready && ov2.data.cash === cashNow + 10 && ov2.data.feeReceivable > 0 && ov2.data.closedThrough === m1 && ov2.data.feed.lastRunAt, 'the overview gives the figures that matter');
  await expect('a teacher without a grant cannot see the overview', G(`${P}/overview`, F.TN), [403]);
  log((await G(`${P}/check`, F.TU)).data.ok, 'the books check out after all of it');
  await expect('only an administrator can run the full sweep', PO(`${P}/sweep`, {}, F.TC), [403]); const sw = await expect('the administrator\'s sweep runs and checks', PO(`${P}/sweep`, {}, F.A), [200]); log(sw.data.check.ok, 'and reports the books in order');
  await expect('an unknown source type has no trace', G(`${P}/trace/nonsense/abc`, F.TU), [404]);

  // isolation
  const invY = await M('FeeInvoice').create({ schoolId: Y.s._id, studentId: oidn(), number: 'INV-Y-1', challanCode: '80000001', issueDate: now, dueDate: now, lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 500, net: 500 }], total: 500, status: 'Open' });
  await run(); log((await trace('fee_invoice', String(invY._id))).journals.length === 0, 'another school\'s invoice is not posted into this ledger');
  const ry = await PO(`${P}/feeds/run`, {}, Y.A); log(ry.data.posted === 1 && (await G(`${P}/trace/fee_invoice/${invY._id}`, Y.A)).data.journals.length === 1, 'it is posted into its own school\'s ledger');
  log((await G(`${P}/trace/fee_invoice/${inv1._id}`, Y.A)).data.journals.length === 0, 'and the first school\'s traces are invisible to it');
  const fj = (await trace('fee_invoice', String(inv1._id))).journals[0]; await expect('another school cannot read a journal', G(`${P}/journals/${fj._id}`, Y.A), [404]);
  await expect('another school cannot decide a journal', PO(`${P}/journals/${fj._id}/decide`, { decision: 'approve' }, Y.A), [404]);
  await expect('another school cannot reverse a journal', PO(`${P}/journals/${fj._id}/reverse`, { reason: 'Trying it on' }, Y.A), [404]);
  const fundF = (await G(`${P}/funds`, F.TU)).data.funds[0]; await expect('another school cannot list a fund\'s lines', G(`${P}/funds/${fundF.id}/lines`, Y.A), [404]);
  log((await G(`${P}/statements/trial-balance`, Y.A)).data.totalDebit === 500, 'each school\'s trial balance holds only its own figures');
  await expect('a system journal cannot be reversed by hand', PO(`${P}/journals/${fj._id}/reverse`, { reason: 'Fix at the source please' }, F.TA), [409]);
  const jl = await G(`${P}/journals?type=system&status=posted`, F.TU); log(jl.data.total >= 10 && jl.data.rows.every((j) => j.type === 'system'), 'journals can be filtered by kind and state');
  const jq = await G(`${P}/journals?q=Formula`, F.TU); log(jq.data.rows.length === 1, 'and searched');

  // the daily run
  process.env.CRON_SECRET = 'acct-cron-secret';
  const noAuth = await fetch(`${base}/api/cron/accounts`); log(noAuth.status === 401, 'the daily run refuses a call without the secret');
  const inv5 = await M('FeeInvoice').create({ schoolId: sid, studentId: oidn(), number: 'INV-T-5', challanCode: '90000005', issueDate: now, dueDate: now, lines: [{ key: 't', kind: 'installment', title: 'Tuition', amount: 100, net: 100 }], total: 100, status: 'Open' });
  const cr = await fetch(`${base}/api/cron/accounts`, { headers: { authorization: 'Bearer acct-cron-secret' } }); const crj = await cr.json(); log(cr.status === 200 && crj.schools >= 3 && (await trace('fee_invoice', String(inv5._id))).journals.length === 1, 'the daily run posts what is new in every school');
};
