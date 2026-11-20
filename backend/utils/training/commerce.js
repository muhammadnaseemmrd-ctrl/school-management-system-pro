// Orders, payment confirmation, access and refunds (PRD E17). Money is only counted when an administrator confirms an instalment; proof from the
// learner is kept separately and never opens a course. Every order change is a compare-and-set on `rev`, so a repeated click cannot count twice.
const S = require('./service');
const { E, oid, clean } = S;
const TrBundle = require('../../models/TrBundle');
const TrCredential = require('../../models/TrCredential');

const err = (code, message, extra = {}) => Object.assign(new Error(message), { http: code, extra });
const METHODS = ['cash', 'bank', 'easypaisa', 'jazzcash', 'card', 'other'];

async function openCohort(schoolId, course, cohortId) {
  if (!cohortId) return null;
  const co = await S.TrCohort.findOne({ _id: oid(cohortId), schoolId, courseId: course._id }); if (!co) throw err(404, 'That cohort does not belong to this course.');
  if (!['open', 'running'].includes(co.status)) throw err(409, 'That cohort is not taking new learners.');
  if (co.enrolUntil && new Date() > co.enrolUntil) throw err(409, 'Joining that cohort has closed.');
  return co;
}

// Build and store an order. Returns the order; a free course is paid and open at once.
async function placeOrder(schoolId, { learner, courseId, bundleId, cohortId, couponCode, installments, source = 'storefront', by = '' }) {
  const sidv = oid(schoolId); const st = await S.getSettings(schoolId); const pol = st.policies[st.policies.length - 1];
  let course = null; let bundle = null; let title; let list; let maxInst = 1;
  if (bundleId) { bundle = await TrBundle.findOne({ _id: oid(bundleId), schoolId: sidv, status: 'published' }); if (!bundle) throw err(404, 'That bundle is not on sale.'); title = bundle.title; list = bundle.price; }
  else { course = await S.TrCourse.findOne({ _id: oid(courseId), schoolId: sidv, status: 'published' }); if (!course || !course.live) throw err(404, 'That course is not on sale.'); title = course.title; list = course.price; maxInst = course.installments?.max || 1; }
  const courseIds = bundle ? bundle.courseIds : [course._id];
  for (const cid of courseIds) { const e = await S.bestEntitlement(schoolId, learner._id, cid); if (e && ['active', 'paused'].includes(E.entState(e)) && e.completion !== 'complete') throw err(409, bundle ? 'You already have access to one of these courses.' : 'You already have access to this course.'); }
  const open = await S.TrOrder.findOne({ schoolId: sidv, learnerId: learner._id, status: { $in: ['pending', 'part_paid'] }, ...(bundle ? { bundleId: bundle._id } : { courseId: course._id }) });
  if (open) throw err(409, `You already have an open order for this (${open.orderNo}). Finish paying for it first.`, { orderNo: open.orderNo });
  const cohort = course ? await openCohort(sidv, course, cohortId) : null;
  // the coupon is judged here and nowhere else
  let discount = 0; let coupon = null; let couponDoc = null;
  if (couponCode) {
    couponDoc = await S.TrCoupon.findOne({ schoolId: sidv, code: clean(couponCode, 24).toUpperCase() });
    const usedBy = couponDoc ? await S.TrOrder.countDocuments({ schoolId: sidv, learnerId: learner._id, 'coupon.code': couponDoc.code, status: { $ne: 'cancelled' } }) : 0;
    const ck = E.couponCheck(couponDoc, { courseId: course?._id || (bundle ? courseIds[0] : null), list, used: usedBy });
    if (bundle && couponDoc && (couponDoc.courseIds || []).length) throw err(422, 'That code does not apply to bundles.');
    if (!ck.ok) throw err(422, ck.reason);
    discount = ck.discount; coupon = { code: couponDoc.code, attribution: couponDoc.attribution || '' };
  }
  const p = E.priceOrder({ list, discount, taxPercent: pol.taxPercent });
  const n = Math.min(Math.max(1, E.int(installments, 1)), p.total > 0 ? maxInst : 1);
  if (couponDoc) { let took = false; for (let i = 0; i < 5 && !took; i += 1) { const c = await S.TrCoupon.findById(couponDoc._id); if (c.maxUses > 0 && c.used >= c.maxUses) throw err(422, 'That code has been used up.'); took = !!(await S.TrCoupon.updateOne({ _id: c._id, used: c.used }, { $set: { used: c.used + 1 } })).matchedCount; } if (!took) throw err(409, 'Please try again.'); }
  const rollback = async () => { if (couponDoc) { const c = await S.TrCoupon.findById(couponDoc._id); if (c && c.used > 0) await S.TrCoupon.updateOne({ _id: c._id, used: c.used }, { $set: { used: c.used - 1 } }); } };
  if (cohort && !(await S.takeSeat(cohort))) { await rollback(); throw err(409, 'That cohort is full.'); }
  const policy = { policyVersion: pol.version, taxPercent: pol.taxPercent, refundDays: course?.refundDays ?? pol.refundDays };
  let order;
  try {
    order = await S.numbered(S.TrOrder, sidv, 'orderNo', 'TO', { learnerId: learner._id, kind: bundle ? 'bundle' : 'course', courseId: course?._id || null, bundleId: bundle?._id || null, cohortId: cohort?._id || null, title, ...p, coupon, ...policy, accessAfter: course?.installments?.accessAfter || 'first', currency: st.currency, installments: p.total > 0 ? E.split(p.total, n) : [], status: p.total > 0 ? 'pending' : 'paid', source, createdByName: by });
  } catch (e) { if (cohort) await S.freeSeat(cohort._id); await rollback(); throw e; }
  if (p.total === 0) await openAccess(schoolId, order, learner, 'free', by);
  return order;
}

// Give access for an order: a course, or every course of a bundle (in order when the path is ordered).
async function openAccess(schoolId, order, learner, source, by) {
  const sidv = oid(schoolId);
  if (order.kind === 'bundle') {
    const bundle = await TrBundle.findOne({ _id: order.bundleId, schoolId: sidv }); if (!bundle) return [];
    const out = []; let prev = null;
    for (const cid of bundle.courseIds) { const course = await S.TrCourse.findOne({ _id: cid, schoolId: sidv }); if (!course) continue; const g = await S.grant(schoolId, { learner, course, orderId: order._id, bundle, unlockAfter: bundle.ordered ? prev : null, source, by }); out.push(g.ent); prev = g.ent._id; }
    return out;
  }
  const course = await S.TrCourse.findOne({ _id: order.courseId, schoolId: sidv }); const cohort = order.cohortId ? await S.TrCohort.findOne({ _id: order.cohortId, schoolId: sidv }) : null;
  const g = await S.grant(schoolId, { learner, course, cohort, orderId: order._id, source, by }); return [g.ent];
}

// compare-and-set update of an order
async function casOrder(order, set) { const r = await S.TrOrder.updateOne({ _id: order._id, rev: order.rev || 0 }, { $set: { ...set, rev: (order.rev || 0) + 1 } }); return !!r.matchedCount; }

async function learnerProof(schoolId, order, no, { reference, method, note }) {
  const ins = [...order.installments]; const i = ins.findIndex((x) => x.no === no); if (i < 0) throw err(404, 'That instalment is not on this order.');
  if (['cancelled', 'refunded'].includes(order.status)) throw err(409, 'This order is closed.');
  if (ins[i].status === 'paid') throw err(409, 'That instalment is already confirmed.');
  const ref = clean(reference, 80); if (ref.length < 3) throw err(422, 'Write the payment reference (the transaction number or receipt number).');
  ins[i] = { ...ins[i], status: 'proof', proof: { reference: ref, method: METHODS.includes(method) ? method : 'other', note: clean(note, 300), at: new Date() } };
  if (!(await casOrder(order, { installments: ins }))) throw err(409, 'This order just changed. Please try again.');
  return ins[i];
}

// An administrator confirms that the money really arrived. The amount must match the instalment exactly.
async function confirmInstallment(schoolId, order, no, { reference, method, amount, force, by }) {
  if (['cancelled', 'refunded'].includes(order.status)) throw err(409, 'This order is closed.');
  const ins = [...order.installments]; const i = ins.findIndex((x) => x.no === no); if (i < 0) throw err(404, 'That instalment is not on this order.');
  if (ins[i].status === 'paid') throw err(409, 'That instalment is already confirmed.');
  const ref = clean(reference || ins[i].proof?.reference, 80); if (ref.length < 3) throw err(422, 'Write the payment reference you checked.');
  if (E.int(amount, -1) !== ins[i].amount) throw err(422, `The instalment is ${ins[i].amount} ${order.currency}. Confirm the exact amount received (to take part payments, change the plan first).`);
  const dup = await S.TrOrder.findOne({ schoolId: oid(schoolId), refs: ref.toLowerCase(), _id: { $ne: order._id } });
  if (dup && !force) throw err(409, `That reference was already used to confirm a payment on ${dup.orderNo}. Check it is not a second use of the same transfer.`, { duplicate: dup.orderNo });
  const now = new Date(); ins[i] = { ...ins[i], status: 'paid', paidAt: now, reference: ref, method: METHODS.includes(method) ? method : (ins[i].proof?.method || 'other'), receiptNo: `${order.orderNo}-R${no}`, confirmedBy: by };
  const all = ins.every((x) => x.status === 'paid'); const status = (order.refunded || 0) > 0 ? 'part_refunded' : all ? 'paid' : 'part_paid';
  if (!(await casOrder(order, { installments: ins, status, refs: [...(order.refs || []), ref.toLowerCase()] }))) throw err(409, 'This order was just changed by someone else. Reload and check before confirming.');
  const learner = await S.TrLearner.findById(order.learnerId); const fresh = await S.TrOrder.findById(order._id); let ents = [];
  if (order.accessAfter === 'full' ? all : true) ents = await openAccess(schoolId, fresh, learner, 'payment', by);
  // paying an overdue instalment lifts a pause
  await S.TrEntitlement.updateMany({ schoolId: oid(schoolId), orderId: order._id, status: 'paused' }, { $set: { status: 'active' } });
  return { order: fresh, entitlements: ents, receiptNo: ins[i].receiptNo };
}

async function cancelOrder(schoolId, order, reason) {
  if (order.status !== 'pending') throw err(409, order.status === 'cancelled' ? 'This order is already cancelled.' : 'Money was received on this order. Refund it instead.');
  if (!(await casOrder(order, { status: 'cancelled' }))) throw err(409, 'This order just changed. Please try again.');
  await S.freeSeat(order.cohortId);
  if (order.coupon?.code) { const c = await S.TrCoupon.findOne({ schoolId: oid(schoolId), code: order.coupon.code }); if (c && c.used > 0) await S.TrCoupon.updateOne({ _id: c._id, used: c.used }, { $set: { used: c.used - 1 } }); }
}

// Refund money already confirmed. Inside the refund window anyone with the right can do it; later it needs an override with a written reason.
async function refund(schoolId, order, { amount, reason, override, revoke, by }) {
  const paid = (order.installments || []).filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0); const left = paid - (order.refunded || 0);
  if (['cancelled', 'refunded'].includes(order.status) || left <= 0) throw err(409, 'Nothing is left to refund on this order.');
  const amt = amount === undefined || amount === null || amount === '' ? left : E.int(amount); if (!(amt > 0) || amt > left) throw err(422, `Refund between 1 and ${left} ${order.currency}.`);
  const why = clean(reason, 300); if (why.length < 10) throw err(422, 'Write the reason for the refund (at least 10 characters).');
  const inside = E.refundOpen(order, order.refundDays); if (!inside && !override) throw err(422, `The ${order.refundDays}-day refund window has passed. An administrator can still refund with "override" and a clear reason.`, { window: false });
  const full = amt === left; const refunds = [...(order.refunds || []), { at: new Date(), amount: amt, reason: why, byName: by, override: !inside, revoked: full || !!revoke }];
  const status = full ? 'refunded' : 'part_refunded';
  if (!(await casOrder(order, { refunds, refunded: (order.refunded || 0) + amt, status }))) throw err(409, 'This order just changed. Please try again.');
  let revoked = 0;
  if (full || revoke) {
    const r = await S.TrEntitlement.updateMany({ schoolId: oid(schoolId), orderId: order._id, status: { $ne: 'revoked' } }, { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: `Refund: ${why}`, revokedByName: by } }); revoked = r.modifiedCount || 0;
    if (order.cohortId) await S.freeSeat(order.cohortId);
  }
  // a certificate that was earned stays as evidence, but someone must look at it
  const ids = (await S.TrEntitlement.find({ schoolId: oid(schoolId), orderId: order._id }).select('_id')).map((e) => e._id);
  if (ids.length) await TrCredential.updateMany({ schoolId: oid(schoolId), entitlementId: { $in: ids }, status: 'valid' }, { $set: { refundFlag: true } });
  return { refunded: amt, left: left - amt, revoked, status };
}

module.exports = { err, METHODS, placeOrder, openAccess, confirmInstallment, learnerProof, cancelOrder, refund, casOrder };
