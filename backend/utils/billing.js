// SaaS billing for the platform owner: what schools pay Aulensia, the subscription it buys, and the
// commission earned by the partner agent who brought the school.
//
// There is no multi-collection transaction in the data layer, so every step is idempotent and `settle()`
// can be re-run safely. `reconcile()` finishes any payment that was interrupted halfway.
const mongoose = require('../lib/pgdoc');
const School = require('../models/School');
const Agent = require('../models/Agent');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const Commission = require('../models/Commission');
const AgentPayout = require('../models/AgentPayout');
const AppSetting = require('../models/AppSetting');
const ledger = require('./ledger');
const { getPlansMap, clearSchoolPlanCache } = require('./plans');
const { invalidateSchoolStatus } = require('../middleware/auth');
const { notify } = require('./notify');

const A = ledger.ACCOUNTS;
const MAX_AMOUNT = 100000000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/* ───────────── commission policy (set by the platform owner) ───────────── */
const DEFAULT_POLICY = { recurringMonths: 12, holdDays: 7 };
const getPolicy = async () => {
  const doc = await AppSetting.findOne({ key: 'agent_policy' });
  return { ...DEFAULT_POLICY, ...(doc?.value || {}) };
};
const setPolicy = async (patch) => {
  const cur = await getPolicy();
  const next = { ...cur };
  if (patch.recurringMonths !== undefined) {
    const n = Number(patch.recurringMonths);
    if (!Number.isInteger(n) || n < 0 || n > 120) throw httpError(400, 'recurringMonths must be a whole number from 0 to 120 (0 = first payment only is not supported; use 1)');
    next.recurringMonths = n;
  }
  if (patch.holdDays !== undefined) {
    const n = Number(patch.holdDays);
    if (!Number.isInteger(n) || n < 0 || n > 90) throw httpError(400, 'holdDays must be a whole number from 0 to 90');
    next.holdDays = n;
  }
  await AppSetting.updateOne({ key: 'agent_policy' }, { $set: { value: next } }, { upsert: true });
  return next;
};

/* ───────────── dates ───────────── */
const addPeriod = (from, period) => {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + (period === 'yearly' ? 12 : 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};
const addMonths = (from, n) => { const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + n); return d; };

/* ───────────── record a payment ───────────── */
// input: { schoolId, planSlug, billingPeriod, amountPKR, method, reference, paidAt, coversFrom?, coversTo?, note, idempotencyKey }
async function recordPayment(input, actor) {
  const school = await School.findById(input.schoolId);
  if (!school) throw httpError(404, 'School not found');
  const plans = await getPlansMap();
  const plan = plans[String(input.planSlug || '').toLowerCase()];
  if (!plan) throw httpError(400, 'Unknown plan');
  const billingPeriod = input.billingPeriod;
  if (!['monthly', 'yearly'].includes(billingPeriod)) throw httpError(400, 'billingPeriod must be monthly or yearly');
  const amount = Number(input.amountPKR);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) throw httpError(400, 'Amount must be a whole number of rupees from 1 to 100,000,000');
  if (!['bank', 'jazzcash', 'easypaisa', 'cash', 'other'].includes(input.method)) throw httpError(400, 'Choose how the money was received');
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw httpError(400, 'Invalid payment date');
  if (paidAt.getTime() > Date.now() + 24 * 3600 * 1000) throw httpError(400, 'Payment date cannot be in the future');

  const key = input.idempotencyKey ? String(input.idempotencyKey).slice(0, 80) : undefined;
  if (key) {
    const dup = await SubscriptionPayment.findOne({ idempotencyKey: key });
    if (dup) { await settle(dup); return { payment: await SubscriptionPayment.findById(dup._id), duplicate: true }; }
  }

  // Coverage starts when the current subscription ends (if still running), otherwise on the payment date.
  const now = new Date();
  const running = school.subscriptionExpiresAt && school.subscriptionExpiresAt > now ? school.subscriptionExpiresAt : null;
  const coversFrom = input.coversFrom ? new Date(input.coversFrom) : (running || paidAt);
  const coversTo = input.coversTo ? new Date(input.coversTo) : addPeriod(coversFrom, billingPeriod);
  if (Number.isNaN(coversFrom.getTime()) || Number.isNaN(coversTo.getTime()) || coversTo <= coversFrom) throw httpError(400, 'Coverage dates are not valid');

  const payment = await SubscriptionPayment.create({
    schoolId: school._id, schoolName: school.name, schoolCode: school.code,
    planSlug: plan.slug, billingPeriod, amountPKR: amount, method: input.method,
    reference: String(input.reference || '').slice(0, 120), paidAt, coversFrom, coversTo,
    note: String(input.note || '').slice(0, 300),
    agentId: school.agentId || null, commissionPercent: school.agentId ? (school.agentCommissionPercent || 0) : 0,
    idempotencyKey: key, recordedBy: actor?.userId || undefined, recordedByName: actor?.name || '',
  });
  await settle(payment);
  return { payment: await SubscriptionPayment.findById(payment._id), duplicate: false };
}

/* Apply everything a confirmed payment implies. Safe to run again. */
async function settle(payment) {
  if (payment.status !== 'Confirmed') return payment;
  // 1. ledger
  await ledger.post({
    sourceType: 'payment', sourceId: String(payment._id), postedAt: payment.paidAt,
    memo: `${payment.schoolName} ${payment.planSlug} ${payment.billingPeriod}`,
    lines: [{ account: A.BANK, debit: payment.amountPKR }, { account: A.REVENUE, credit: payment.amountPKR }],
  });
  // 2. commission for the agent, if the school is still inside the recurring window
  await accrueCommission(payment);
  // 3. the subscription the money bought (only once)
  if (!payment.settledAt) {
    const school = await School.findById(payment.schoolId);
    if (school) {
      const plans = await getPlansMap();
      const plan = plans[payment.planSlug];
      const patch = { plan: payment.planSlug, subscriptionExpiresAt: payment.coversTo, isActive: true, suspendedReason: '' };
      if (plan) { patch.studentLimit = plan.studentLimit; patch.teacherLimit = plan.teacherLimit; }
      // a later payment may already have pushed the end date further: never shorten
      if (school.subscriptionExpiresAt && school.subscriptionExpiresAt > payment.coversTo) patch.subscriptionExpiresAt = school.subscriptionExpiresAt;
      await School.updateOne({ _id: school._id }, { $set: patch });
      clearSchoolPlanCache();
      invalidateSchoolStatus(school._id);
    }
    await SubscriptionPayment.updateOne({ _id: payment._id, settledAt: null }, { $set: { settledAt: new Date() } });
  }
  return payment;
}

async function accrueCommission(payment) {
  if (!payment.agentId || !(payment.commissionPercent > 0)) return null;
  const exists = await Commission.findOne({ paymentId: payment._id, kind: 'accrual' });
  if (exists) { await postCommissionJournal(exists); return exists; }
  const school = await School.findById(payment.schoolId).select('referredAt createdAt');
  const policy = await getPolicy();
  const windowStart = school?.referredAt || school?.createdAt || payment.paidAt;
  if (policy.recurringMonths > 0 && payment.paidAt > addMonths(windowStart, policy.recurringMonths)) return null; // earning window over
  const amount = Math.round((payment.amountPKR * payment.commissionPercent) / 100);
  if (amount < 1) return null;
  let row;
  try {
    row = await Commission.create({
      agentId: payment.agentId, schoolId: payment.schoolId, schoolName: payment.schoolName, paymentId: payment._id, kind: 'accrual',
      baseAmountPKR: payment.amountPKR, percent: payment.commissionPercent, amountPKR: amount, status: 'Pending',
      eligibleAt: new Date(payment.paidAt.getTime() + policy.holdDays * 24 * 3600 * 1000),
    });
  } catch (e) {
    row = await Commission.findOne({ paymentId: payment._id, kind: 'accrual' });
    if (!row) throw e;
  }
  await postCommissionJournal(row);
  notify({ recipients: [{ id: payment.agentId, role: 'agent' }], title: `${payment.schoolName} paid: you earned Rs ${amount.toLocaleString('en-PK')}`,
    body: `${payment.commissionPercent}% of Rs ${payment.amountPKR.toLocaleString('en-PK')}`, link: '/agent/dashboard#/commissions', type: 'commission', key: `commission:${row._id}` });
  return row;
}

const postCommissionJournal = (row) => ledger.post({
  sourceType: 'commission', sourceId: String(row._id), memo: `Commission ${row.schoolName}`,
  lines: row.amountPKR >= 0
    ? [{ account: A.COMMISSION_COST, debit: row.amountPKR }, { account: A.COMMISSION_DUE, credit: row.amountPKR }]
    : [{ account: A.COMMISSION_DUE, debit: -row.amountPKR }, { account: A.COMMISSION_COST, credit: -row.amountPKR }],
});

/* ───────────── refund ───────────── */
async function refundPayment(paymentId, reason, actor) {
  if (!reason || String(reason).trim().length < 3) throw httpError(400, 'A reason is required to refund a payment');
  const payment = await SubscriptionPayment.findById(paymentId);
  if (!payment) throw httpError(404, 'Payment not found');
  if (payment.status === 'Refunded') throw httpError(422, 'This payment is already refunded');
  await settle(payment); // make sure the original entries exist before reversing them

  await SubscriptionPayment.updateOne({ _id: payment._id }, { $set: { status: 'Refunded', refundedAt: new Date(), refundReason: String(reason).trim().slice(0, 300) } });
  await ledger.post({
    sourceType: 'payment_refund', sourceId: String(payment._id), memo: `Refund ${payment.schoolName}`,
    lines: [{ account: A.REVENUE, debit: payment.amountPKR }, { account: A.BANK, credit: payment.amountPKR }],
  });

  // Commission: void if unpaid, otherwise claw back with a negative row that the next payout nets off.
  let commission = null;
  const accrual = await Commission.findOne({ paymentId: payment._id, kind: 'accrual' });
  if (accrual && accrual.status !== 'Void') {
    if (accrual.status === 'Paid') {
      try {
        commission = await Commission.create({
          agentId: accrual.agentId, schoolId: accrual.schoolId, schoolName: accrual.schoolName, paymentId: payment._id, kind: 'reversal',
          reversesId: accrual._id, baseAmountPKR: -accrual.baseAmountPKR, percent: accrual.percent, amountPKR: -accrual.amountPKR,
          status: 'Approved', approvedAt: new Date(), approvedByName: 'Refund', voidReason: '',
        });
      } catch (e) { commission = await Commission.findOne({ paymentId: payment._id, kind: 'reversal' }); if (!commission) throw e; }
      await postCommissionJournal(commission);
    } else {
      await Commission.updateOne({ _id: accrual._id }, { $set: { status: 'Void', voidReason: `Payment refunded: ${String(reason).trim().slice(0, 150)}` } });
      await ledger.post({
        sourceType: 'commission_void', sourceId: String(accrual._id), memo: `Void ${accrual.schoolName}`,
        lines: [{ account: A.COMMISSION_DUE, debit: accrual.amountPKR }, { account: A.COMMISSION_COST, credit: accrual.amountPKR }],
      });
    }
  }

  // Subscription: if this payment is what the school's end date is based on, move it back.
  let subscription = null;
  const school = await School.findById(payment.schoolId);
  if (school && school.subscriptionExpiresAt && school.subscriptionExpiresAt.getTime() === payment.coversTo.getTime()) {
    const from = payment.coversFrom;
    await School.updateOne({ _id: school._id }, { $set: { subscriptionExpiresAt: from } });
    invalidateSchoolStatus(school._id);
    subscription = { from: payment.coversTo, to: from, note: 'Subscription end moved back to match the remaining paid coverage' };
  }
  return { payment: await SubscriptionPayment.findById(payment._id), commission, subscription };
}

/* ───────────── approve / void commission ───────────── */
async function approveCommissions(ids, actor, { force = false } = {}) {
  const rows = await Commission.find({ _id: { $in: ids.map(oid) } });
  if (!rows.length) throw httpError(404, 'No commission found');
  const now = new Date();
  const done = []; const skipped = [];
  for (const r of rows) {
    if (r.status !== 'Pending') { skipped.push({ id: r._id, reason: `Already ${r.status}` }); continue; }
    if (!force && r.eligibleAt && r.eligibleAt > now) { skipped.push({ id: r._id, reason: `Holding period ends ${r.eligibleAt.toISOString().slice(0, 10)}` }); continue; }
    const res = await Commission.updateOne({ _id: r._id, status: 'Pending' }, { $set: { status: 'Approved', approvedAt: now, approvedByName: actor?.name || '' } });
    if (res.modifiedCount || res.nModified || res.matchedCount) done.push(r._id);
  }
  return { approved: done, skipped };
}

async function voidCommission(id, reason) {
  if (!reason || String(reason).trim().length < 3) throw httpError(400, 'A reason is required to void a commission');
  const row = await Commission.findById(id);
  if (!row) throw httpError(404, 'Commission not found');
  if (!['Pending', 'Approved'].includes(row.status)) throw httpError(422, `A ${row.status} commission cannot be voided`);
  await Commission.updateOne({ _id: row._id }, { $set: { status: 'Void', voidReason: String(reason).trim().slice(0, 200) } });
  await ledger.post({
    sourceType: 'commission_void', sourceId: String(row._id), memo: `Void ${row.schoolName}`,
    lines: row.amountPKR >= 0
      ? [{ account: A.COMMISSION_DUE, debit: row.amountPKR }, { account: A.COMMISSION_COST, credit: row.amountPKR }]
      : [{ account: A.COMMISSION_COST, debit: -row.amountPKR }, { account: A.COMMISSION_DUE, credit: -row.amountPKR }],
  });
  return Commission.findById(row._id);
}

/* ───────────── payout ───────────── */
// Pays every Approved row of the agent (accruals and reversals) in one net transfer.
async function recordPayout(agentId, input, actor) {
  const agent = await Agent.findById(agentId);
  if (!agent) throw httpError(404, 'Agent not found');
  if (!['bank', 'jazzcash', 'easypaisa', 'cash', 'other'].includes(input.method)) throw httpError(400, 'Choose how the agent was paid');
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 24 * 3600 * 1000) throw httpError(400, 'Invalid payout date');
  const approved = await Commission.find({ agentId: agent._id, status: 'Approved' });
  const ids = Array.isArray(input.commissionIds) && input.commissionIds.length ? input.commissionIds.map(String) : null;
  const rows = ids ? approved.filter((r) => ids.includes(String(r._id))) : approved;
  if (!rows.length) throw httpError(422, 'There is no approved commission to pay');
  const net = rows.reduce((s, r) => s + r.amountPKR, 0);
  if (net < 1) throw httpError(422, 'Approved commission nets to zero or less after refunds; nothing to pay yet');
  if (input.amountPKR !== undefined && Number(input.amountPKR) !== net) throw httpError(409, `The amount to pay is Rs ${net.toLocaleString('en-PK')}, not Rs ${Number(input.amountPKR).toLocaleString('en-PK')}. Reload and try again.`, { expectedAmount: net });

  const payout = await AgentPayout.create({
    agentId: agent._id, agentName: agent.name, amountPKR: net, method: input.method, reference: String(input.reference || '').slice(0, 120),
    paidAt, commissionIds: rows.map((r) => r._id), note: String(input.note || '').slice(0, 300),
    recordedBy: actor?.userId || undefined, recordedByName: actor?.name || '',
  });
  await Commission.updateMany({ _id: { $in: rows.map((r) => r._id) }, status: 'Approved' }, { $set: { status: 'Paid', payoutId: payout._id } });
  await ledger.post({
    sourceType: 'payout', sourceId: String(payout._id), postedAt: paidAt, memo: `Payout ${agent.name}`,
    lines: [{ account: A.COMMISSION_DUE, debit: net }, { account: A.BANK, credit: net }],
  });
  notify({ recipients: [{ id: agent._id, role: 'agent' }], title: `Payout recorded: Rs ${net.toLocaleString('en-PK')}`, body: input.reference ? `Reference ${input.reference}` : '', link: '/agent/dashboard#/commissions', type: 'payout', key: `payout:${payout._id}` });
  return { payout, rows: rows.length };
}

/* ───────────── reconcile ───────────── */
// Finishes interrupted payments and checks that ledger balances equal what the business tables say.
async function reconcile({ fix = true } = {}) {
  const stuck = await SubscriptionPayment.find({ status: 'Confirmed', settledAt: null }).limit(200);
  let fixed = 0;
  if (fix) for (const p of stuck) { try { await settle(p); fixed += 1; } catch (e) { console.warn('reconcile settle failed:', p._id, e.message); } }

  const tb = await ledger.trialBalance();
  const bal = Object.fromEntries(tb.accounts.map((a) => [a.code, a.balance]));
  const [payAgg, payoutAgg, commAgg] = await Promise.all([
    SubscriptionPayment.aggregate([{ $match: { status: 'Confirmed' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
    AgentPayout.aggregate([{ $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
    Commission.aggregate([{ $match: { status: { $in: ['Pending', 'Approved'] } } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
  ]);
  const confirmed = payAgg[0]?.total || 0; const paidOut = payoutAgg[0]?.total || 0; const owed = commAgg[0]?.total || 0;
  const checks = [
    { name: 'Debits equal credits', ok: tb.balanced, expected: tb.totalDebit, actual: tb.totalCredit },
    { name: 'Revenue equals confirmed payments', ok: (bal[A.REVENUE] || 0) === confirmed, expected: confirmed, actual: bal[A.REVENUE] || 0 },
    { name: 'Bank equals confirmed payments minus payouts', ok: (bal[A.BANK] || 0) === confirmed - paidOut, expected: confirmed - paidOut, actual: bal[A.BANK] || 0 },
    { name: 'Commissions payable equals unpaid commission', ok: (bal[A.COMMISSION_DUE] || 0) === owed, expected: owed, actual: bal[A.COMMISSION_DUE] || 0 },
  ];
  const remaining = await SubscriptionPayment.countDocuments({ status: 'Confirmed', settledAt: null });
  return { ok: checks.every((c) => c.ok) && remaining === 0, fixed, unsettled: remaining, checks, trialBalance: tb };
}

module.exports = { getPolicy, setPolicy, recordPayment, settle, refundPayment, approveCommissions, voidCommission, recordPayout, reconcile, addPeriod, httpError };
