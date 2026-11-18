// School finance (E06): invoices, challan, cash till, bank reconciliation, adjustments, rules.
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Student = require('../models/Student'); const Parent = require('../models/Parent'); const User = require('../models/User');
  const FeeCharge = require('../models/FeeCharge'); const Invoice = require('../models/FeeInvoice'); const Payment = require('../models/FeePayment'); const AuditLog = require('../models/AuditLog');
  const Line = require('../models/BankStatementLine'); const StudentFee = require('../models/StudentFee');
  const { hashPassword } = require('../utils/password');
  const A = tokens.admin;
  console.log('\n— School finance —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id);
  await Promise.all([Invoice.deleteMany({ schoolId: sid }), Payment.deleteMany({ schoolId: sid }), Line.deleteMany({ schoolId: sid })]);
  const stu = (await Student.find({ schoolId: sid }).sort({ createdAt: 1 }))[0];
  await FeeCharge.deleteMany({ schoolId: sid, studentId: stu._id });
  let cn = 0; const mkCharge = (title, amount, type = 'Other') => FeeCharge.create({ schoolId: sid, studentId: stu._id, title, type, period: `t${++cn}`, amount, dueDate: new Date(Date.now() + 864e5) });
  await mkCharge('Lab fee', 2000); await mkCharge('Trip fee', 3000);
  let A2 = (await call('POST', '/auth/login', null, { email: 'second@demo.school', password: 'Admin@1234', schoolCode: 'DEMO01' })).data;
  if (!(A2.token || A2.accessToken)) { await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' }); A2 = (await call('POST', '/auth/login', null, { email: 'second@demo.school', password: 'Admin@1234', schoolCode: 'DEMO01' })).data; }
  A2 = A2.token || A2.accessToken;
  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  await expect('teacher cannot open finance', call('GET', '/finance/overview', tokens.teacher), [401, 403]);
  await expect('unauthenticated refused', call('GET', '/finance/overview', null), [401]);
  await expect('invoice needs a due date', call('POST', '/finance/invoices/generate', A, { period: 'Nov', studentIds: [String(stu._id)] }), [400]);
  await expect('invoice needs a period', call('POST', '/finance/invoices/generate', A, { dueDate: due, studentIds: [String(stu._id)] }), [400]);
  await expect('invoice needs students', call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Nov' }), [400]);

  // generate
  const dry = (await expect('dry run previews', call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Nov 2026', studentIds: [String(stu._id)], itemKeys: [], dryRun: true }), [200])).data;
  log(dry.created.length === 1 && (await Invoice.countDocuments({ schoolId: sid })) === 0, 'a dry run writes nothing');
  const g = (await expect('generate invoice', call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Nov 2026', studentIds: [String(stu._id)] }), [201])).data;
  const inv = await Invoice.findOne({ schoolId: sid, studentId: stu._id });
  log(g.created.length === 1 && /^INV-\d{4}-000001$/.test(inv.number), 'invoice number follows the school sequence');
  log(inv.total === inv.lines.reduce((t, l) => t + l.net, 0) && inv.total >= 5000, 'invoice total equals the sum of its lines');
  log(/^\d{8}$/.test(inv.challanCode), 'challan code has a check digit');
  const again = (await call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Nov 2026', studentIds: [String(stu._id)] })).data;
  log(again.created.length === 0 && again.skipped.length === 1, 'items already invoiced are not invoiced again');
  const ch = (await expect('challan data', call('GET', `/finance/invoices/${inv._id}/challan`, A), [200])).data;
  log(ch.copies.length === 3 && ch.invoice.challanCode === inv.challanCode, 'challan has bank, school and parent copies');
  await expect('unknown invoice', call('GET', '/finance/invoices/000000000000000000000000', A), [404]);

  // cash needs a till
  const total = inv.total;
  await expect('cash without a till is refused', call('POST', '/finance/payments', A, { studentId: String(stu._id), amount: 1000, method: 'cash' }), [422]);
  await expect('amount must be whole rupees', call('POST', '/finance/payments', A, { studentId: String(stu._id), amount: 10.5, method: 'bank', reference: 'ABC123' }), [400]);
  await expect('non-cash needs a reference', call('POST', '/finance/payments', A, { studentId: String(stu._id), amount: 1000, method: 'bank' }), [400]);
  const sess = (await expect('open the till', call('POST', '/finance/sessions/open', A, { openingFloat: 500 }), [201])).data.session;
  await expect('one till at a time', call('POST', '/finance/sessions/open', A, { openingFloat: 0 }), [422]);
  const k1 = 'cash-1';
  const pay1 = await fetchPay(A, { studentId: String(stu._id), amount: 2000, method: 'cash', invoiceId: String(inv._id) }, k1);
  log(pay1.status === 201 && pay1.data.payment.status === 'Confirmed' && /^R-\d{6}$/.test(pay1.data.payment.receiptNo), 'cash is confirmed at once with a receipt number');
  const dup = await fetchPay(A, { studentId: String(stu._id), amount: 2000, method: 'cash', invoiceId: String(inv._id) }, k1);
  log(dup.data.duplicate === true && (await Payment.countDocuments({ schoolId: sid })) === 1, 'the same Idempotency-Key does not take the money twice');
  let cur = await Invoice.findById(inv._id);
  log(cur.paid === 2000 && cur.status === 'PartiallyPaid', 'invoice is part paid after Rs 2,000');

  // bank payment waits for evidence
  const bank = (await expect('bank payment is recorded', call('POST', '/finance/payments', A, { studentId: String(stu._id), amount: total - 2000, method: 'bank', reference: 'TXN-77' }), [201])).data.payment;
  log(bank.status === 'Pending' && !bank.receiptNo, 'a bank payment is pending with no receipt');
  await expect('confirming needs evidence', call('POST', `/finance/payments/${bank._id}/confirm`, A, {}), [422]);
  await expect('receipt only after confirmation', call('GET', `/finance/payments/${bank._id}/receipt`, A), [422]);

  // bank statement import
  const csv = `Date,Description,Credit,Reference\n2026-11-10,Fee ${inv.challanCode} Ali,${total - 2000},TXN-77\n2026-11-11,Salary refund,9999,X1\n2026-11-12,Bad row,abc,Y1\nnotadate,Oops,100,Z1\n`;
  const dryImp = (await expect('statement preview', call('POST', '/finance/bank/import', A, { csv, dryRun: true }), [200])).data;
  log(dryImp.willImport === 2 && dryImp.errors.length === 2, 'preview counts 2 good rows and 2 unreadable rows');
  log(dryImp.preview[0].suggestion && dryImp.preview[0].suggestion.confidence === 'high', 'the challan code and amount give a high-confidence suggestion');
  const imp = (await expect('statement import', call('POST', '/finance/bank/import', A, { csv, fileName: 'nov.csv' }), [201])).data;
  log(imp.imported === 2, 'two credits imported');
  const re = (await call('POST', '/finance/bank/import', A, { csv })).data;
  log(re.duplicate === true, 'the same file is not imported twice');
  const csv2 = csv + `2026-11-10,Fee again,${total - 2000},TXN-77\n`;
  const imp2 = (await call('POST', '/finance/bank/import', A, { csv: csv2 })).data;
  log(imp2.imported === 1, 'an identical row twice in one day is kept as two, an old row is not duplicated');
  const lines = (await call('GET', '/finance/bank/lines?status=Unmatched', A)).data.lines;
  const mine = lines.find((x) => x.amount === total - 2000 && x.suggestion); const spare = lines.find((x) => x.amount === 9999);
  log(!!mine && (await Invoice.findById(inv._id)).paid === 2000, 'nothing is settled just by importing');
  await expect('wrong amount cannot confirm a payment', call('POST', `/finance/payments/${bank._id}/confirm`, A, { bankLineId: String(spare._id) }), [422]);
  const ok = (await expect('confirm with the matching bank line', call('POST', `/finance/payments/${bank._id}/confirm`, A, { bankLineId: String(mine._id) }), [200])).data.payment;
  cur = await Invoice.findById(inv._id);
  log(ok.status === 'Confirmed' && cur.status === 'Paid' && cur.paid === total, 'the invoice is Paid once the full amount is confirmed');
  log((await Line.findById(mine._id)).status === 'Matched', 'the bank line is marked matched');
  await expect('a used bank line cannot be matched again', call('POST', `/finance/bank/lines/${mine._id}/match`, A, { invoiceId: String(inv._id) }), [422]);
  await expect('ignoring needs a reason', call('POST', `/finance/bank/lines/${spare._id}/ignore`, A, {}), [400]);
  await expect('ignore with a reason', call('POST', `/finance/bank/lines/${spare._id}/ignore`, A, { reason: 'Not a fee payment' }), [200]);
  const legacy = await FeeCharge.find({ schoolId: sid, studentId: stu._id });
  log(legacy.every((c) => c.status === 'Paid'), 'the older fee screens show the charges as paid');
  const rc = (await expect('receipt', call('GET', `/finance/payments/${ok._id}/receipt`, A), [200])).data.receipt;
  log(rc.amount === total - 2000 && rc.allocations.length >= 1, 'receipt shows what it paid');

  // overpayment becomes credit, applied to next invoice
  await mkCharge('Uniform', 1500, 'Uniform');
  const over = (await fetchPay(A, { studentId: String(stu._id), amount: 2500, method: 'cash' }, 'cash-over')).data.payment;
  log(over.unallocated === 2500, 'money with no open invoice is kept as credit');
  await call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Dec 2026', studentIds: [String(stu._id)] });
  const ap = (await expect('apply credit', call('POST', `/finance/students/${stu._id}/apply-credit`, A), [200])).data;
  const inv2 = await Invoice.findOne({ schoolId: sid, period: 'Dec 2026' });
  log(ap.applied === 1500 && inv2.status === 'Paid', 'credit settles the next invoice and the rest stays as credit');

  // maker-checker
  await expect('adjustment needs a reason code', call('POST', '/finance/adjustments', A, { type: 'refund', paymentId: over._id, amount: 500, note: 'Parent asked' }), [400]);
  await expect('cannot refund more than was paid', call('POST', '/finance/adjustments', A, { type: 'refund', paymentId: over._id, amount: 99999, reasonCode: 'overpayment', note: 'Parent asked' }), [422]);
  const rq = (await expect('request a refund', call('POST', '/finance/adjustments', A, { type: 'refund', paymentId: over._id, amount: 1000, reasonCode: 'overpayment', note: 'Parent asked for money back' }), [201])).data.adjustment;
  await expect('the requester cannot approve', call('POST', `/finance/adjustments/${rq._id}/decide`, A, { decision: 'approve' }), [403]);
  const ap2 = (await expect('another admin approves', call('POST', `/finance/adjustments/${rq._id}/decide`, A2, { decision: 'approve' }), [200])).data.adjustment;
  log(/^V-\d{6}$/.test(ap2.voucherNo), 'an approved refund gets a voucher number');
  const p2 = await Payment.findById(over._id);
  log(p2.refunded === 1000 && p2.refunds.length === 1, 'the refund is recorded on the payment and the payment stays');
  await expect('a decided request cannot be decided again', call('POST', `/finance/adjustments/${rq._id}/decide`, A2, { decision: 'reject', note: 'oops' }), [422]);
  // refund eats into invoice when no free credit left
  const rq2 = (await call('POST', '/finance/adjustments', A2, { type: 'refund', paymentId: over._id, amount: 1500, reasonCode: 'duplicate', note: 'Duplicate payment of fees' })).data.adjustment;
  await expect('refund beyond what is left is refused', call('POST', '/finance/adjustments', A, { type: 'refund', paymentId: over._id, amount: 1500, reasonCode: 'duplicate', note: 'Too much now' }), [422]);
  await call('POST', `/finance/adjustments/${rq2._id}/decide`, A, { decision: 'approve' });
  const inv2b = await Invoice.findById(inv2._id);
  log(inv2b.paid === 0 && inv2b.status === 'Open', 'a refund beyond free credit takes the money back off the invoice');
  log((await FeeCharge.findOne({ schoolId: sid, title: 'Uniform' })).status === 'Unpaid', 'and the older screen shows it unpaid again');
  // write-off
  const wo = (await call('POST', '/finance/adjustments', A, { type: 'write-off', invoiceId: String(inv2._id), amount: 1500, reasonCode: 'hardship', note: 'Family hardship approved by principal' })).data.adjustment;
  await call('POST', `/finance/adjustments/${wo._id}/decide`, A2, { decision: 'approve' });
  const inv2c = await Invoice.findById(inv2._id);
  log(inv2c.status === 'WrittenOff' && inv2c.writtenOff === 1500, 'a approved write-off clears the balance');
  await expect('void needs a reason', call('POST', `/finance/invoices/${inv._id}/void`, A, {}), [400]);
  await expect('an invoice with money received cannot be voided', call('POST', `/finance/invoices/${inv._id}/void`, A, { reason: 'Wrong student' }), [422]);

  // rules
  await expect('rule needs a reason', call('POST', '/finance/rules', A, { name: 'Sibling 10%', kind: 'sibling', valueType: 'percent', value: 10 }), [400]);
  await expect('percent above 100 is refused', call('POST', '/finance/rules', A, { name: 'Bad', kind: 'concession', valueType: 'percent', value: 150, reason: 'Testing the limit' }), [400]);
  const rule = (await expect('create a concession rule', call('POST', '/finance/rules', A, { name: 'Staff child 50%', kind: 'concession', valueType: 'percent', value: 50, appliesTo: 'all', reason: 'Staff child policy' }), [201])).data.rule;
  await expect('creator cannot approve a rule', call('POST', `/finance/rules/${rule._id}/decide`, A, { decision: 'approve' }), [403]);
  await mkCharge('Library fee', 1000);
  const pre = (await call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Jan', studentIds: [String(stu._id)], dryRun: true })).data;
  log(pre.created[0].discount === 0, 'a pending rule gives no discount');
  await expect('another admin approves the rule', call('POST', `/finance/rules/${rule._id}/decide`, A2, { decision: 'approve' }), [200]);
  const post = (await call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Jan', studentIds: [String(stu._id)], dryRun: true })).data;
  log(post.created[0].discount > 0 && post.created[0].total < pre.created[0].total, 'an active rule discounts new invoices');
  await expect('end a rule', call('POST', `/finance/rules/${rule._id}/decide`, A, { decision: 'end' }), [200]);

  // late fee
  await expect('late fee needs an amount', call('POST', '/finance/late-fees/run', A), [422]);
  await expect('settings are validated', call('PUT', '/finance/settings', A, { graceDays: -1, lateFeeAmount: 100 }), [400]);
  await expect('save settings', call('PUT', '/finance/settings', A, { graceDays: 0, lateFeeAmount: 200 }), [200]);
  const gj = await call('POST', '/finance/invoices/generate', A, { dueDate: due, period: 'Jan', studentIds: [String(stu._id)] });
  const jan = await Invoice.findOne({ schoolId: sid, period: 'Jan' }); await Invoice.updateOne({ _id: jan._id }, { $set: { dueDate: new Date(Date.now() - 864e5) } });
  const lf = (await call('POST', '/finance/late-fees/run', A)).data; const lf2 = (await call('POST', '/finance/late-fees/run', A)).data;
  log(lf.applied === 1 && lf2.applied === 0, 'the late fee is added once per invoice');
  log((await Invoice.findById(jan._id)).total === jan.total + 200, 'the invoice total grows by the late fee');

  // close the till
  const exp = 500 + 2000 + 2500 - 1000 - 1500;
  const bad = (await expect('a till difference needs a note', call('POST', `/finance/sessions/${sess._id}/close`, A, { countedCash: exp - 100 }), [422])).data;
  log(bad.variance === -100, 'the shortfall is shown to the cashier');
  await expect('only the cashier can close the till', call('POST', `/finance/sessions/${sess._id}/close`, A2, { countedCash: exp }), [403]);
  const cl = (await expect('close with a note', call('POST', `/finance/sessions/${sess._id}/close`, A, { countedCash: exp - 100, varianceNote: 'Rs 100 given as change to a parent', depositSlip: 'DS-1' }), [200])).data.session;
  log(cl.expectedCash === exp && cl.variance === -100, 'expected cash = float + cash in − cash out');
  await expect('a closed till cannot be closed again', call('POST', `/finance/sessions/${sess._id}/close`, A, { countedCash: exp }), [422]);
  await expect('cash needs an open till again', call('POST', '/finance/payments', A, { studentId: String(stu._id), amount: 100, method: 'cash' }), [422]);

  // statements and tenant isolation
  const st = (await call('GET', `/finance/students/${stu._id}/statement`, A)).data;
  log(st.totals.billed > 0 && st.students[0].invoices.length >= 3, 'student statement lists the invoices');
  const parent = await Parent.findOne({ schoolId: sid, children: stu._id });
  if (parent) { const fam = (await call('GET', `/finance/families/${parent._id}/statement`, A)).data; log(fam.students.some((s) => String(s.student._id) === String(stu._id)), 'family statement covers the children'); }
  const mineP = await call('GET', '/finance/me/family', tokens.parent); log([200, 404].includes(mineP.status), 'a parent can ask for their family statement');
  await expect('admin cannot use the parent endpoint', call('GET', '/finance/me/family', A), [401, 403]);
  const other = await School.create({ name: 'Other Fin School', code: 'OFS001', email: 'o@fin.test', isActive: true }).catch(() => null);
  if (other) { const os = await Student.create({ schoolId: other._id, name: 'Elsewhere', rollNumber: '1', gender: 'Male', dateOfBirth: new Date('2015-01-01'), classId: stu.classId }).catch(() => null); if (os) await expect('another school\'s student is 404', call('GET', `/finance/students/${os._id}/statement`, A), [404]); await Student.deleteMany({ schoolId: other._id }); await School.deleteOne({ _id: other._id }); }
  const ov = (await call('GET', '/finance/overview', A)).data;
  log(ov.invoiced > 0 && ov.collected > 0, 'overview shows billed and collected');
  const rec = (await expect('reconcile', call('GET', '/finance/reconcile', A), [200])).data;
  log(rec.ok === true, `books reconcile: every invoice equals its allocations (${rec.problems.map((p) => p.message).join('; ')})`);
  const acts = (await AuditLog.find({ schoolId: sid, action: /^finance\./ })).map((x) => x.action);
  log(['finance.invoice.generate', 'finance.payment.cash', 'finance.payment.confirm', 'finance.adjustment.approve', 'finance.session.close', 'finance.bank.import', 'finance.rule.approve'].every((a) => acts.includes(a)), 'every money action is in the audit log');

  async function fetchPay(token, body, key) { return call('POST', '/finance/payments', token, body, { 'Idempotency-Key': key }); }
};
