// Payments ledger, partner agents, commissions, referral sign-up and access isolation (E02, E24).
// Called from smoke.js with the shared helpers.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const SA = tokens.superadmin;
  const mongoose = require('../lib/pgdoc');
  const School = require('../models/School');
  const SubscriptionPayment = require('../models/SubscriptionPayment');
  const Commission = require('../models/Commission');
  const billing = require('../utils/billing');
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  console.log('\n— Payments ledger, agents and commissions —');

  /* agents */
  const mk = await expect('owner creates agent A (10%)', call('POST', '/superadmin/agents', SA, { name: 'Hamza Raza', email: 'hamza@partner.test', phone: '03001234567', city: 'Lahore', commissionPercent: 10 }));
  const agentA = mk.data.agent; const tempA = mk.data.temporaryPassword;
  log(/^AG-[A-Z0-9]{4}$/.test(agentA.referralCode) && !!tempA, `agent gets a referral code (${agentA.referralCode}) and a temporary password`);
  const mkB = await expect('owner creates agent B (20%)', call('POST', '/superadmin/agents', SA, { name: 'Bilal Ahmed', email: 'bilal@partner.test', commissionPercent: 20, password: 'Bilal@2026' }));
  const agentB = mkB.data.agent;
  await expect('duplicate agent email rejected', call('POST', '/superadmin/agents', SA, { name: 'X', email: 'HAMZA@partner.test' }), [400]);
  await expect('commission above 100 rejected', call('POST', '/superadmin/agents', SA, { name: 'X', email: 'x1@partner.test', commissionPercent: 150 }), [400]);
  await expect('school admin cannot manage agents', call('GET', '/superadmin/agents', tokens.admin), [401, 403]);

  /* referral link at self sign-up */
  const ref = await (await fetch(`${base}/api/public/referral/${agentA.referralCode}`)).json();
  log(ref.valid === true && ref.agentFirstName === 'Hamza', 'public referral check confirms a real code and shows only the first name');
  const refBad = await (await fetch(`${base}/api/public/referral/AG-ZZZZ`)).json(); log(refBad.valid === false, 'unknown referral code is not valid');
  const signup = async (code, extra = {}) => {
    const r = await fetch(`${base}/api/schools`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      name: `Ref School ${code}`, code, email: `${code.toLowerCase()}@school.test`, phone: '0511234567', adminName: 'Principal', adminEmail: `p-${code.toLowerCase()}@school.test`, adminPassword: 'Admin@12345', ...extra }) });
    return { status: r.status, data: await r.json() };
  };
  const s1 = await signup('REF001', { referralCode: agentA.referralCode });
  log(s1.status === 201 && s1.data.referral?.linked === true, `school signs up through the agent's link (${s1.status})`);
  log(s1.data.school.agentId === undefined, 'sign-up response does not leak the agent link');
  const s1id = s1.data.school._id || s1.data.school.id;
  const g1 = (await call('GET', `/superadmin/schools/${s1id}`, SA)).data.school;
  log(String(g1.agentId) === String(agentA.id) && g1.agentCommissionPercent === 10 && g1.referralSource === 'link', 'school is linked with the percentage frozen at 10');
  const s2 = await signup('REF002', { referralCode: 'AG-NOPE' }); log(s2.status === 201 && s2.data.referral.linked === false, 'unknown code never blocks sign-up');
  const s3 = await signup('REF003', { referralCode: agentA.referralCode, email: 'hamza@partner.test' }); log(s3.status === 201 && s3.data.referral.reason === 'same-email', 'agent cannot refer a school that uses their own email');
  await expect('owner raises agent A to 15%', call('PUT', `/superadmin/agents/${agentA.id}`, SA, { commissionPercent: 15 }));
  const g1b = (await call('GET', `/superadmin/schools/${s1id}`, SA)).data.school; log(g1b.agentCommissionPercent === 10, 'changing the agent percentage does not change schools already linked');
  const cs = await expect('owner creates a school for agent B (20%)', call('POST', '/superadmin/schools', SA, { name: 'B School', code: 'BSCH01', email: 'b@school.test', phone: '0511111111', adminName: 'B Admin', adminEmail: 'badmin@school.test', adminPassword: 'Admin@12345', agentId: agentB.id }));
  const bSchoolId = cs.data.school._id || cs.data.school.id;
  await expect('owner links REF002 to agent A with a custom 12%', call('PUT', `/superadmin/schools/${s2.data.school._id || s2.data.school.id}/agent`, SA, { agentId: agentA.id, commissionPercent: 12, reason: 'Met in person' }));
  await expect('agent cannot be linked to own email school', call('PUT', `/superadmin/schools/${s3.data.school._id || s3.data.school.id}/agent`, SA, { agentId: agentA.id }), [422]);

  /* recording payments */
  const pay = (body, headers) => fetch(`${base}/api/superadmin/payments`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${SA}`, ...(headers || {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  const base1 = { schoolId: s1id, planSlug: 'standard', billingPeriod: 'monthly', amountPKR: 4999, method: 'bank', reference: 'TXN-1001' };
  log((await pay({ ...base1, amountPKR: -5 })).status === 400, 'negative amount rejected');
  log((await pay({ ...base1, amountPKR: 10.5 })).status === 400, 'fractional rupees rejected');
  log((await pay({ ...base1, paidAt: new Date(Date.now() + 5 * 86400000).toISOString() })).status === 400, 'future payment date rejected');
  log((await pay({ ...base1, planSlug: 'gold' })).status === 400, 'unknown plan rejected');
  log((await pay({ ...base1, method: undefined })).status === 400, 'payment method is required');
  const r1 = await pay(base1, { 'Idempotency-Key': 'pay-1001' });
  log(r1.status === 201 && r1.data.payment.status === 'Confirmed', `owner records a school payment (${r1.status})`);
  const p1 = r1.data.payment;
  const sch1 = (await call('GET', `/superadmin/schools/${s1id}`, SA)).data.school;
  const expiry1 = new Date(sch1.subscriptionExpiresAt);
  log(sch1.plan === 'standard' && sch1.studentLimit === 500 && expiry1 > new Date(Date.now() + 27 * 86400000) && expiry1 < new Date(Date.now() + 32 * 86400000), 'payment upgrades the plan and extends the subscription by one month');
  log(expiry1.getTime() === new Date(p1.coversTo).getTime(), 'subscription end equals the paid coverage end');
  const r1b = await pay(base1, { 'Idempotency-Key': 'pay-1001' });
  log(r1b.status === 200 && r1b.data.duplicate === true && r1b.data.payment.id === p1.id, 'repeating the same request does not record the money twice');
  const comms1 = (await call('GET', `/superadmin/commissions?agentId=${agentA.id}`, SA)).data.commissions;
  log(comms1.length === 1 && comms1[0].amountPKR === 500 && comms1[0].percent === 10 && comms1[0].status === 'Pending', 'commission is 10% of Rs 4,999 = Rs 500 (frozen rate, not the new 15%), Pending');
  await expect('school admin cannot record owner payments', call('POST', '/superadmin/payments', tokens.admin, base1), [401, 403]);

  // a second payment stacks coverage after the current end date
  const r2 = await pay({ ...base1, amountPKR: 4999, reference: 'TXN-1002' });
  log(r2.status === 201 && new Date(r2.data.payment.coversFrom).getTime() === expiry1.getTime(), 'next payment starts where the current subscription ends');
  const pay2 = r2.data.payment;

  /* agent portal: sees only own data */
  const lg = await call('POST', '/agent/login', null, { email: 'hamza@partner.test', password: tempA });
  const AT = lg.data && lg.data.accessToken; log(!!AT && lg.data.user.role === 'agent', 'agent signs in with the temporary password');
  const lgB = await call('POST', '/agent/login', null, { email: 'bilal@partner.test', password: 'Bilal@2026' }); const BT = lgB.data.accessToken;
  await expect('wrong password rejected', call('POST', '/agent/login', null, { email: 'hamza@partner.test', password: 'nope' }), [401]);
  const sum1 = (await call('GET', '/agent/summary', AT)).data;
  log(sum1.schools.total === 2 && sum1.payments.count === 2 && sum1.payments.totalPKR === 9998 && sum1.commission.pendingPKR === 1000, `agent summary: 2 schools, 2 payments (Rs 9,998), Rs 1,000 pending`);
  const as = (await call('GET', '/agent/schools', AT)).data.schools;
  const asB = (await call('GET', '/agent/schools', BT)).data.schools;
  log(as.length === 2 && as.every((s) => ['REF001', 'REF002'].includes(s.code)) && asB.length === 1 && asB[0].code === 'BSCH01', 'each agent sees only their own schools');
  const leak = JSON.stringify(as);
  log(!/adminEmail|principalEmail|"email"|password|students|teachers/i.test(leak), 'agent school rows carry no email, password or student data');
  const ap = (await call('GET', '/agent/payments', AT)).data.payments;
  log(ap.length === 2 && ap.every((p) => p.commissionPKR === 500) && !JSON.stringify(ap).includes('TXN-100'), 'agent sees payments and commission but not bank references');
  for (const [label, url] of [['students', '/students'], ['classes', '/classes'], ['subjects', '/subjects'], ['notices', '/notices/user/notices'], ['school billing', '/schools/billing'], ['owner stats', '/superadmin/stats'], ['owner agents', '/superadmin/agents'], ['backups', '/backup']]) {
    const r = await call('GET', url, AT); log(r.status === 403, `agent token is refused on ${label} (${r.status})`);
  }
  await expect('agent can read notifications', call('GET', '/notifications', AT));
  const prof = await call('GET', '/auth/profile', AT);
  log(prof.status === 200 && prof.data.user.email === 'hamza@partner.test' && !prof.data.user.password && !prof.data.user.refreshTokens, 'agent profile loads without password or tokens');
  const rt = await call('POST', '/auth/refresh-token', null, { refreshToken: lg.data.refreshToken });
  log(rt.status === 200 && !!rt.data.accessToken, 'agent session can be refreshed');
  await expect('agent token cannot change a school profile', call('PUT', '/auth/profile', AT, { name: 'x' }), [403]);
  const me2 = await call('PUT', '/agent/me', AT, { name: 'Hamza R.', commissionPercent: 90, referralCode: 'AG-HACK', isActive: true, payout: { method: 'jazzcash', accountTitle: 'Hamza Raza', accountNumber: '03001234567' } });
  log(me2.status === 200 && me2.data.agent.commissionPercent === 15 && me2.data.agent.referralCode === agentA.referralCode, 'agent cannot change their own commission percentage or referral code');
  await expect('teacher cannot open the agent portal', call('GET', '/agent/summary', tokens.teacher), [403]);
  await expect('agent password change needs the current password', call('PUT', '/agent/password', AT, { currentPassword: 'wrong', newPassword: 'Hamza@2026' }), [400]);

  /* approval, payout, refund, ledger */
  const pending = (await call('GET', `/superadmin/commissions?agentId=${agentA.id}&status=Pending`, SA)).data.commissions;
  const ap0 = await call('POST', '/superadmin/commissions/approve', SA, { ids: pending.map((c) => c.id) });
  log(ap0.data.approved.length === 0 && ap0.data.skipped.length === 2, 'approval waits for the 7-day holding period');
  const hold = await call('PUT', '/superadmin/commission-policy', SA, { holdDays: 0 });
  log(hold.status === 200 && hold.data.policy.holdDays === 0 && hold.data.policy.recurringMonths === 12, 'owner can change the holding period');
  const firstComm = pending.find((c) => String(c.paymentId) === String(p1.id));
  const secondComm = pending.find((c) => String(c.paymentId) === String(pay2.id));
  await db_forceEligible(Commission);
  const ap1 = await call('POST', '/superadmin/commissions/approve', SA, { ids: [firstComm.id] });
  log(ap1.data.approved.length === 1, 'owner approves a commission');
  const bad = await call('POST', `/superadmin/agents/${agentA.id}/payouts`, SA, { method: 'jazzcash', reference: 'JC-1', amountPKR: 999 });
  log(bad.status === 409 && bad.data.expectedAmount === 500, 'payout amount must match the approved total');
  const noMethod = await call('POST', `/superadmin/agents/${agentA.id}/payouts`, SA, { reference: 'x' }); log(noMethod.status === 400, 'payout needs a method');
  const po = await call('POST', `/superadmin/agents/${agentA.id}/payouts`, SA, { method: 'jazzcash', reference: 'JC-1', amountPKR: 500 });
  log(po.status === 201 && po.data.payout.amountPKR === 500, 'owner records a payout of Rs 500');
  log((await call('POST', `/superadmin/agents/${agentA.id}/payouts`, SA, { method: 'jazzcash' })).status === 422, 'cannot pay the same commission twice');
  const cm = (await call('GET', '/agent/commissions', AT)).data;
  log(cm.balance.paidPKR === 500 && cm.balance.pendingPKR === 500, 'agent sees Rs 500 paid and Rs 500 pending');
  const pyo = (await call('GET', '/agent/payouts', AT)).data.payouts; log(pyo.length === 1 && pyo[0].reference === 'JC-1', 'agent sees the payout reference');

  let led = (await call('GET', '/superadmin/ledger', SA)).data;
  log(led.ok === true && led.checks.every((c) => c.ok), 'ledger balances reconcile after payments, commission and payout');

  // refund of an already-paid commission: claw back with a negative row, never edit the paid row
  const rf = await call('POST', `/superadmin/payments/${p1.id}/refund`, SA, { reason: 'Cheque bounced' });
  log(rf.status === 200 && rf.data.commissionReversal === true, 'refunding a paid-out payment adds a negative reversal row');
  const allC = (await call('GET', `/superadmin/commissions?agentId=${agentA.id}`, SA)).data.commissions;
  const paidRow = allC.find((c) => c.id === firstComm.id); const rev = allC.find((c) => c.kind === 'reversal');
  log(paidRow.status === 'Paid' && paidRow.amountPKR === 500 && rev && rev.amountPKR === -500 && rev.status === 'Approved', 'paid commission row is unchanged; reversal of -500 waits for the next payout');
  log((await call('POST', `/superadmin/payments/${p1.id}/refund`, SA, { reason: 'again' })).status === 422, 'a payment cannot be refunded twice');
  log((await call('POST', `/superadmin/payments/${pay2.id}/refund`, SA, {})).status === 400, 'refund needs a reason');
  const rf2 = await call('POST', `/superadmin/payments/${pay2.id}/refund`, SA, { reason: 'Duplicate transfer' });
  const c2 = (await call('GET', `/superadmin/commissions?agentId=${agentA.id}`, SA)).data.commissions.find((c) => c.id === secondComm.id);
  log(rf2.status === 200 && c2.status === 'Void' && /refunded/i.test(c2.voidReason), 'refunding an unpaid payment voids its commission');
  const sch1c = (await call('GET', `/superadmin/schools/${s1id}`, SA)).data.school;
  log(new Date(sch1c.subscriptionExpiresAt).getTime() <= new Date(p1.coversTo).getTime(), 'subscription end moves back after refunds so it matches the remaining paid coverage');
  led = (await call('GET', '/superadmin/ledger', SA)).data;
  const acc = (c) => led.trialBalance.accounts.find((a) => a.code === c).balance;
  log(led.ok === true && led.trialBalance.balanced && acc('1000') === -500 && acc('2000') === -500 && acc('4000') === 0, 'after full refunds revenue is Rs 0; the Rs 500 already paid to the agent shows as a clawback owed back (bank -500, payable -500) and the ledger balances');

  /* interrupted payment is completed by reconcile; settle is idempotent */
  const sp = await SubscriptionPayment.create({ schoolId: new mongoose.Types.ObjectId(bSchoolId), schoolName: 'B School', schoolCode: 'BSCH01', planSlug: 'premium', billingPeriod: 'yearly', amountPKR: 129990, method: 'bank',
    paidAt: new Date(), coversFrom: new Date(), coversTo: new Date(Date.now() + 365 * 86400000), agentId: new mongoose.Types.ObjectId(agentB.id), commissionPercent: 20 });
  const rc = (await call('POST', '/superadmin/ledger/reconcile', SA)).data;
  log(rc.fixed >= 1 && rc.ok === true && rc.unsettled === 0, 'reconcile finishes a payment that was interrupted halfway');
  const sp2 = await SubscriptionPayment.findById(sp._id); await billing.settle(sp2); await billing.settle(sp2);
  const bComms = await Commission.find({ paymentId: sp._id });
  log(bComms.length === 1 && bComms[0].amountPKR === 25998, 'settling twice never creates a second commission (20% of Rs 129,990 = Rs 25,998)');
  led = (await call('GET', '/superadmin/ledger', SA)).data; log(led.ok === true, 'ledger reconciles after the retry');

  /* earning window: no commission for payments long after the referral */
  await School.updateOne({ _id: new mongoose.Types.ObjectId(bSchoolId) }, { $set: { referredAt: new Date(Date.now() - 400 * 86400000) } });
  const late = await pay({ schoolId: bSchoolId, planSlug: 'standard', billingPeriod: 'monthly', amountPKR: 4999, method: 'cash' });
  const lateC = await Commission.countDocuments({ paymentId: new mongoose.Types.ObjectId(late.data.payment.id) });
  log(late.status === 201 && lateC === 0, 'no commission after the 12-month earning window');

  /* stats and financial history */
  const st = (await call('GET', '/superadmin/stats', SA)).data.stats;
  const confirmed = await SubscriptionPayment.find({ status: 'Confirmed' });
  log(st.revenue.collectedTotalPKR === sum(confirmed, (p) => p.amountPKR) && st.revenue.refundedTotalPKR === 9998, `owner overview shows collected money from the ledger (Rs ${st.revenue.collectedTotalPKR.toLocaleString()})`);
  log(Array.isArray(st.revenue.byMonth) && st.revenue.byMonth.length === 6, 'overview has six months of collected revenue');
  const before = await SubscriptionPayment.countDocuments({ schoolId: new mongoose.Types.ObjectId(bSchoolId) });
  await expect('owner deletes a school', call('DELETE', `/superadmin/schools/${bSchoolId}`, SA, { confirmCode: 'BSCH01' }));
  log(before > 0 && (await SubscriptionPayment.countDocuments({ schoolId: new mongoose.Types.ObjectId(bSchoolId) })) === before, 'payments and commissions survive deleting the school');
  const aud = (await call('GET', '/superadmin/audit?limit=100', SA)).data.entries.map((e) => e.action);
  log(['payment.record', 'payment.refund', 'payout.record', 'commission.approve', 'agent.create', 'school.agent-link'].every((a) => aud.includes(a)), 'money and access changes are in the audit log');

  /* suspension */
  await expect('owner suspends agent A', call('PUT', `/superadmin/agents/${agentA.id}`, SA, { isActive: false }));
  await expect('suspended agent cannot sign in', call('POST', '/agent/login', null, { email: 'hamza@partner.test', password: tempA }), [403]);
  await expect('suspended agent loses access with an old token', call('GET', '/agent/summary', AT), [423]);
  const s4 = await signup('REF004', { referralCode: agentA.referralCode }); log(s4.data.referral.linked === false, 'a suspended agent code no longer links new schools');
  await expect('owner resets agent password', call('POST', `/superadmin/agents/${agentB.id}/reset-password`, SA, {}));

  /* database indexes */
  const db = mongoose.db;
  const names = mongoose.modelNames();
  const idx = {};
  const { rows } = await db.get().query(`SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema()`);
  rows.forEach((r) => { (idx[r.tablename] = idx[r.tablename] || []).push(r.indexname); });
  const missing = names.filter((n) => { const M = mongoose.model(n); const secondary = (idx[M.table] || []).filter((i) => !/_pkey$/.test(i)); return M.schema.path('schoolId') && secondary.length === 0; });
  log(missing.length === 0, `every school-scoped collection has a schoolId index${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
  const need = { Agent: 2, SubscriptionPayment: 4, Commission: 4, AgentPayout: 1, LedgerJournal: 2, AuditLog: 3, School: 5 };
  const lowIdx = Object.entries(need).filter(([n, c]) => ((idx[mongoose.model(n).table] || []).filter((i) => !/_pkey$/.test(i)).length) < c);
  log(lowIdx.length === 0, `billing and agent collections are indexed for their queries${lowIdx.length ? ' (low: ' + lowIdx.map((x) => x[0]).join(', ') + ')' : ''}`);
  const dupCode = await call('POST', '/superadmin/agents', SA, { name: 'Z', email: 'z@partner.test', commissionPercent: 5 });
  log(dupCode.status === 201 && dupCode.data.agent.referralCode !== agentA.referralCode && dupCode.data.agent.referralCode !== agentB.referralCode, 'every agent gets a unique referral code');
};

// make every pending commission eligible now so approval can be tested without waiting 7 days
async function db_forceEligible(Commission) { await Commission.updateMany({ status: 'Pending' }, { $set: { eligibleAt: new Date(Date.now() - 1000) } }); }
