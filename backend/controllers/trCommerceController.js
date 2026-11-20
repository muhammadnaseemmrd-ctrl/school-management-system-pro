// Learners, orders, payments, refunds, access and sponsors (PRD E17). Nothing here opens a paid course except a confirmed payment,
// a confirmed sponsor payment or a written administrator grant.
const S = require('../utils/training/service');
const C = require('../utils/training/commerce');
const { E, oid, sid, bad, wrap, clean, plain } = S;
const { audit } = require('../utils/audit');
const TrSponsor = require('../models/TrSponsor');
const TrSponsorship = require('../models/TrSponsorship');
const TrBundle = require('../models/TrBundle');
const TrCredential = require('../models/TrCredential');
const { TrOrder, TrEntitlement, TrLearner, TrProgress } = S;

const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'training', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const run = (name, fn) => wrap(name, async (req, res) => { try { await fn(req, res); } catch (e) { if (e && e.http) return bad(res, e.http, e.message, e.extra || {}); throw e; } });
const rx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });

/* ───────── learners ───────── */
exports.learners = run('tr.learners', async (req, res) => {
  const schoolId = sid(req); const { p, l } = pg(req.query); const q = { schoolId };
  if (req.query.search) q.$or = [{ name: rx(req.query.search) }, { email: rx(req.query.search) }];
  if (req.query.status) q.status = String(req.query.status);
  const [rows, total] = await Promise.all([TrLearner.find(q).select('-keyHash').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), TrLearner.countDocuments(q)]);
  const ents = await TrEntitlement.find({ schoolId, learnerId: { $in: rows.map((r) => r._id) }, status: { $in: ['active', 'paused'] } }).select('learnerId');
  res.json({ total, page: p, learners: rows.map((r) => ({ ...plain(r), activeCourses: ents.filter((e) => String(e.learnerId) === String(r._id)).length })) });
});
exports.createLearner = run('tr.createLearner', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const name = clean(b.name, 120); if (!name) return bad(res, 400, 'Give the learner a name.');
  const email = clean(b.email, 160).toLowerCase(); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 400, 'That email address does not look right.');
  const r = await S.makeLearner(schoolId, { name, email, phone: b.phone, minor: !!b.minor, consent: true, source: 'office' });
  if (r.existing) return bad(res, 409, 'A learner with that email already exists.', { learnerId: r.learner._id });
  await A(req, 'training.learner.create', r.learner._id, name); res.status(201).json({ learner: { ...plain(r.learner), keyHash: undefined }, key: r.key });
});
exports.learnerFromStudent = run('tr.learnerFromStudent', async (req, res) => {
  const schoolId = sid(req); const st = await S.Student.findOne({ _id: oid(req.body?.studentId), schoolId }).select('name email dateOfBirth'); if (!st) return bad(res, 404, 'That student is not in your school.');
  const old = await TrLearner.findOne({ schoolId, studentId: st._id }); if (old) return res.json({ learner: { ...plain(old), keyHash: undefined }, existing: true });
  const dob = st.dateOfBirth ? new Date(st.dateOfBirth) : null; const minor = !dob || (Date.now() - dob.getTime()) / (365.25 * E.DAY) < 18;
  const r = await S.makeLearner(schoolId, { name: st.name, email: '', studentId: st._id, minor, consent: true, source: 'student' });
  await A(req, 'training.learner.fromStudent', r.learner._id, st.name); res.status(201).json({ learner: { ...plain(r.learner), keyHash: undefined } });
});
exports.learner = run('tr.learner', async (req, res) => {
  const schoolId = sid(req); const l = await TrLearner.findOne({ _id: oid(req.params.id), schoolId }).select('-keyHash'); if (!l) return bad(res, 404, 'Learner not found.');
  const [orders, ents, creds] = await Promise.all([TrOrder.find({ schoolId, learnerId: l._id }).sort({ createdAt: -1 }).limit(50), TrEntitlement.find({ schoolId, learnerId: l._id }).sort({ createdAt: -1 }).limit(100), TrCredential.find({ schoolId, learnerId: l._id }).select('serial title status issuedAt createdAt verifyKey refundFlag').sort({ createdAt: -1 })]);
  const cs = await S.TrCourse.find({ schoolId, _id: { $in: ents.map((e) => e.courseId) } }).select('title live'); const cm = new Map(cs.map((c) => [String(c._id), c]));
  const prog = await TrProgress.find({ schoolId, learnerId: l._id }); const pm = new Map(prog.map((p) => [String(p.courseId), p]));
  res.json({ learner: plain(l), orders, credentials: creds, entitlements: ents.map((e) => { const c = cm.get(String(e.courseId)); const mods = c?.live?.modules || []; const req2 = E.flat(mods).filter((x) => x.required); const pr = pm.get(String(e.courseId))?.lessons || {}; return { ...plain(e), courseTitle: c?.title || '', state: E.entState(e), percent: req2.length ? Math.round((req2.filter((x) => pr[x.id]?.done).length * 100) / req2.length) : 0 }; }) });
});
exports.updateLearner = run('tr.updateLearner', async (req, res) => {
  const schoolId = sid(req); const l = await TrLearner.findOne({ _id: oid(req.params.id), schoolId }); if (!l) return bad(res, 404, 'Learner not found.'); const b = req.body || {}; const set = {};
  if (b.status !== undefined) { if (!['active', 'suspended'].includes(b.status)) return bad(res, 400, 'Status must be active or suspended.'); if (b.status === 'suspended' && clean(b.reason, 300).length < 10) return bad(res, 422, 'Say why you are pausing this learner (at least 10 characters).'); set.status = b.status; }
  if (b.minor !== undefined) set.minor = !!b.minor; if (b.name !== undefined) set.name = clean(b.name, 120) || l.name; if (b.phone !== undefined) set.phone = clean(b.phone, 40);
  await TrLearner.updateOne({ _id: l._id }, { $set: set }); await A(req, 'training.learner.update', l._id, Object.keys(set).join(',')); res.json({ ok: true });
});
exports.resetKey = run('tr.resetKey', async (req, res) => {
  const schoolId = sid(req); const l = await TrLearner.findOne({ _id: oid(req.params.id), schoolId }); if (!l) return bad(res, 404, 'Learner not found.');
  if (l.studentId) return bad(res, 422, 'This learner signs in with their student account.');
  const key = await S.resetKey(l); await A(req, 'training.learner.resetKey', l._id, l.name); res.json({ key });
});

/* ───────── orders and payments ───────── */
exports.orders = run('tr.orders', async (req, res) => {
  const schoolId = sid(req); const { p, l } = pg(req.query); const q = { schoolId };
  if (req.query.status) q.status = String(req.query.status); if (req.query.courseId) q.courseId = oid(req.query.courseId); if (req.query.learnerId) q.learnerId = oid(req.query.learnerId);
  if (req.query.search) q.$or = [{ orderNo: rx(req.query.search) }, { title: rx(req.query.search) }];
  const [rows, total] = await Promise.all([TrOrder.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), TrOrder.countDocuments(q)]);
  const ls = await TrLearner.find({ schoolId, _id: { $in: rows.map((r) => r.learnerId) } }).select('name email'); const lm = new Map(ls.map((x) => [String(x._id), x]));
  let list = rows.map((o) => ({ ...plain(o), learnerName: lm.get(String(o.learnerId))?.name || '', learnerEmail: lm.get(String(o.learnerId))?.email || '', paid: o.installments.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0), proofWaiting: o.installments.some((i) => i.status === 'proof') }));
  if (req.query.proof === '1') list = list.filter((o) => o.proofWaiting);
  res.json({ total, page: p, orders: list });
});
exports.order = run('tr.order', async (req, res) => {
  const schoolId = sid(req); const o = await TrOrder.findOne({ _id: oid(req.params.id), schoolId }); if (!o) return bad(res, 404, 'Order not found.');
  const [learner, ents] = await Promise.all([TrLearner.findById(o.learnerId).select('name email phone'), TrEntitlement.find({ schoolId, orderId: o._id })]);
  res.json({ order: plain(o), learner, entitlements: ents.map((e) => ({ ...plain(e), state: E.entState(e) })), refundWindowOpen: E.refundOpen(o, o.refundDays) });
});
exports.createOrder = run('tr.createOrder', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const learner = await TrLearner.findOne({ _id: oid(b.learnerId), schoolId }); if (!learner) return bad(res, 404, 'Learner not found.');
  if (learner.status !== 'active') return bad(res, 409, 'This learner is paused.');
  const o = await C.placeOrder(schoolId, { learner, courseId: b.courseId, bundleId: b.bundleId, cohortId: b.cohortId, couponCode: b.coupon, installments: b.installments, source: 'office', by: req.actorName || '' });
  await A(req, 'training.order.create', o._id, o.orderNo); res.status(201).json(o);
});
const orderFor = async (req, res) => { const o = await TrOrder.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!o) { bad(res, 404, 'Order not found.'); return null; } return o; };
exports.confirm = run('tr.confirm', async (req, res) => {
  const o = await orderFor(req, res); if (!o) return; const no = E.int(req.params.no); const b = req.body || {};
  const r = await C.confirmInstallment(sid(req), o, no, { reference: b.reference, method: b.method, amount: b.amount, force: b.force === true && clean(b.forceReason, 300).length >= 10, by: req.actorName || '' });
  await A(req, 'training.payment.confirm', o._id, `${o.orderNo} #${no} ${b.amount}`); const l = await TrLearner.findById(o.learnerId); await S.notifyLearner(sid(req), l, 'Payment confirmed', `Your payment for ${o.title} was confirmed.`);
  res.json({ ok: true, receiptNo: r.receiptNo, status: r.order.status, entitlements: r.entitlements.length });
});
exports.rejectProof = run('tr.rejectProof', async (req, res) => {
  const o = await orderFor(req, res); if (!o) return; const no = E.int(req.params.no); const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Tell the learner why (at least 10 characters).');
  const ins = [...o.installments]; const i = ins.findIndex((x) => x.no === no); if (i < 0 || ins[i].status !== 'proof') return bad(res, 409, 'There is no proof waiting on that instalment.');
  ins[i] = { ...ins[i], status: 'due', proof: { ...ins[i].proof, rejected: { reason, at: new Date(), by: req.actorName || '' } } };
  if (!(await C.casOrder(o, { installments: ins }))) return bad(res, 409, 'This order just changed. Please try again.'); await A(req, 'training.payment.reject', o._id, reason); res.json({ ok: true });
});
exports.cancel = run('tr.cancel', async (req, res) => { const o = await orderFor(req, res); if (!o) return; const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Say why (at least 10 characters).'); await C.cancelOrder(sid(req), o, reason); await A(req, 'training.order.cancel', o._id, reason); res.json({ ok: true }); });
exports.refund = run('tr.refund', async (req, res) => {
  const o = await orderFor(req, res); if (!o) return; const b = req.body || {};
  const r = await C.refund(sid(req), o, { amount: b.amount, reason: b.reason, override: b.override === true, revoke: b.revoke === true, by: req.actorName || '' }); await A(req, 'training.order.refund', o._id, `${o.orderNo} ${r.refunded}`); res.json({ ok: true, ...r });
});

/* ───────── access ───────── */
exports.entitlements = run('tr.entitlements', async (req, res) => {
  const schoolId = sid(req); const { p, l } = pg(req.query); const q = { schoolId }; if (req.query.courseId) q.courseId = oid(req.query.courseId); if (req.query.status) q.status = String(req.query.status); if (req.query.completion) q.completion = String(req.query.completion);
  const rows = await TrEntitlement.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l); const ls = await TrLearner.find({ schoolId, _id: { $in: rows.map((r) => r.learnerId) } }).select('name'); const cs = await S.TrCourse.find({ schoolId, _id: { $in: rows.map((r) => r.courseId) } }).select('title');
  const lm = new Map(ls.map((x) => [String(x._id), x.name])); const cm = new Map(cs.map((x) => [String(x._id), x.title]));
  res.json({ entitlements: rows.map((e) => ({ ...plain(e), learnerName: lm.get(String(e.learnerId)) || '', courseTitle: cm.get(String(e.courseId)) || '', state: E.entState(e) })) });
});
// access without a payment is a written decision (a scholarship, a staff member, a make-good)
exports.grantComp = run('tr.grantComp', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const reason = clean(b.reason, 300); if (reason.length < 10) return bad(res, 422, 'Write why this access is free (at least 10 characters).');
  const learner = await TrLearner.findOne({ _id: oid(b.learnerId), schoolId }); if (!learner) return bad(res, 404, 'Learner not found.');
  const course = await S.TrCourse.findOne({ _id: oid(b.courseId), schoolId, status: 'published' }); if (!course) return bad(res, 404, 'That course is not published.');
  const ex = await S.bestEntitlement(schoolId, learner._id, course._id); if (ex && ['active', 'paused'].includes(E.entState(ex))) return bad(res, 409, 'This learner already has access.');
  let cohort = null; if (b.cohortId) { cohort = await S.TrCohort.findOne({ _id: oid(b.cohortId), schoolId, courseId: course._id }); if (!cohort) return bad(res, 404, 'That cohort is not on this course.'); if (!(await S.takeSeat(cohort))) return bad(res, 409, 'That cohort is full.'); }
  const g = await S.grant(schoolId, { learner, course, cohort, source: 'comp', by: req.actorName || '', reason, expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined });
  await A(req, 'training.access.comp', g.ent._id, reason); res.status(201).json(g.ent);
});
exports.revoke = run('tr.revoke', async (req, res) => {
  const schoolId = sid(req); const e = await TrEntitlement.findOne({ _id: oid(req.params.id), schoolId }); if (!e) return bad(res, 404, 'Access record not found.'); const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Write why access is ending (at least 10 characters). Progress and work already handed in are kept.');
  if (e.status === 'revoked') return bad(res, 409, 'Already revoked.'); await TrEntitlement.updateOne({ _id: e._id }, { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason, revokedByName: req.actorName || '' } }); if (e.cohortId) await S.freeSeat(e.cohortId);
  await A(req, 'training.access.revoke', e._id, reason); res.json({ ok: true });
});
exports.restore = run('tr.restore', async (req, res) => {
  const schoolId = sid(req); const e = await TrEntitlement.findOne({ _id: oid(req.params.id), schoolId }); if (!e) return bad(res, 404, 'Access record not found.'); if (e.status === 'active') return bad(res, 409, 'Already active.');
  const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Write why access is coming back (at least 10 characters).');
  if (e.orderId) { const o = await TrOrder.findById(e.orderId); if (o && ['refunded', 'cancelled'].includes(o.status)) return bad(res, 409, 'The order was refunded or cancelled. Make a new order or a written grant.'); }
  const set = { status: 'active', revokedReason: '', reason: `${e.reason ? `${e.reason} | ` : ''}Restored: ${reason}` }; if (req.body?.expiresAt) set.expiresAt = new Date(req.body.expiresAt);
  await TrEntitlement.updateOne({ _id: e._id }, { $set: set }); await A(req, 'training.access.restore', e._id, reason); res.json({ ok: true });
});

/* ───────── sponsors ───────── */
exports.sponsors = run('tr.sponsors', async (req, res) => { const schoolId = sid(req); const rows = await TrSponsor.find({ schoolId }).select('-reportKeyHash').sort({ name: 1 }); const sp = await TrSponsorship.find({ schoolId }).select('sponsorId status total seats'); res.json({ sponsors: rows.map((r) => ({ ...plain(r), invoices: sp.filter((x) => String(x.sponsorId) === String(r._id)).length, unpaid: sp.filter((x) => String(x.sponsorId) === String(r._id) && x.status === 'invoiced').reduce((s, x) => s + x.total, 0) })) }); });
exports.createSponsor = run('tr.createSponsor', async (req, res) => { const schoolId = sid(req); const b = req.body || {}; const name = clean(b.name, 140); if (!name) return bad(res, 400, 'Give the organisation a name.'); const row = await TrSponsor.create({ schoolId, name, contactName: clean(b.contactName, 120), email: clean(b.email, 160), phone: clean(b.phone, 40), authority: clean(b.authority, 200) }); await A(req, 'training.sponsor.create', row._id, name); res.status(201).json({ ...plain(row), reportKeyHash: undefined }); });
exports.updateSponsor = run('tr.updateSponsor', async (req, res) => {
  const schoolId = sid(req); const row = await TrSponsor.findOne({ _id: oid(req.params.id), schoolId }); if (!row) return bad(res, 404, 'Sponsor not found.'); const b = req.body || {}; const set = {};
  for (const [k, n] of [['name', 140], ['contactName', 120], ['email', 160], ['phone', 40], ['authority', 200]]) if (b[k] !== undefined) set[k] = clean(b[k], n);
  if (b.status !== undefined) { if (!['approved', 'suspended', 'pending'].includes(b.status)) return bad(res, 400, 'Choose approved, suspended or pending.'); if (b.status === 'approved' && !(set.authority ?? row.authority)) return bad(res, 422, 'Record the contract or purchase-order reference before approving billing.'); set.status = b.status; if (b.status === 'approved') { set.approvedBy = req.actorName || ''; set.approvedAt = new Date(); } }
  await TrSponsor.updateOne({ _id: row._id }, { $set: set }); await A(req, 'training.sponsor.update', row._id, Object.keys(set).join(',')); res.json({ ok: true });
});
exports.sponsorLink = run('tr.sponsorLink', async (req, res) => { const schoolId = sid(req); const row = await TrSponsor.findOne({ _id: oid(req.params.id), schoolId }); if (!row) return bad(res, 404, 'Sponsor not found.'); const key = E.keyOf('sp_'); await TrSponsor.updateOne({ _id: row._id }, { $set: { reportKeyHash: S.hashKey(key) } }); await A(req, 'training.sponsor.link', row._id, row.name); res.json({ key }); });
exports.sponsorships = run('tr.sponsorships', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; if (req.query.sponsorId) q.sponsorId = oid(req.query.sponsorId); if (req.query.status) q.status = String(req.query.status);
  const rows = await TrSponsorship.find(q).sort({ createdAt: -1 }).limit(200); const sp = await TrSponsor.find({ schoolId, _id: { $in: rows.map((r) => r.sponsorId) } }).select('name'); const sm = new Map(sp.map((s) => [String(s._id), s.name]));
  res.json({ sponsorships: rows.map((r) => ({ ...plain(r), sponsorName: sm.get(String(r.sponsorId)) || '' })) });
});
exports.createSponsorship = run('tr.createSponsorship', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const sponsor = await TrSponsor.findOne({ _id: oid(b.sponsorId), schoolId }); if (!sponsor) return bad(res, 404, 'Sponsor not found.');
  if (sponsor.status !== 'approved') return bad(res, 409, 'Billing this organisation needs an approved contract or purchase order first.');
  const course = await S.TrCourse.findOne({ _id: oid(b.courseId), schoolId, status: 'published' }); if (!course) return bad(res, 404, 'That course is not published.');
  const cohort = b.cohortId ? await S.TrCohort.findOne({ _id: oid(b.cohortId), schoolId, courseId: course._id }) : null; if (b.cohortId && !cohort) return bad(res, 404, 'That cohort is not on this course.');
  const rows = (Array.isArray(b.learners) ? b.learners : []).slice(0, 200).map((x) => ({ name: clean(x.name, 120), email: clean(x.email, 160).toLowerCase(), phone: clean(x.phone, 40) }));
  if (!rows.length) return bad(res, 400, 'Add at least one learner.'); const bad1 = rows.findIndex((x) => !x.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)); if (bad1 >= 0) return bad(res, 422, `Row ${bad1 + 1} needs a name and a valid email.`);
  if (new Set(rows.map((x) => x.email)).size !== rows.length) return bad(res, 422, 'The same email appears twice.');
  const price = b.pricePerSeat === undefined || b.pricePerSeat === '' ? course.price : Math.max(0, E.int(b.pricePerSeat)); const note = clean(b.discountNote, 200); if (price !== course.price && note.length < 10) return bad(res, 422, 'A different price per seat needs a reason (at least 10 characters).');
  const st = await S.getSettings(schoolId); const pol = st.policies[st.policies.length - 1]; const p = E.priceOrder({ list: price * rows.length, taxPercent: pol.taxPercent });
  // learners (new ones get a link, shown once) and who already has access
  const learners = []; const keys = []; const skipped = [];
  for (const r of rows) { const m = await S.makeLearner(schoolId, { ...r, consent: false, source: 'sponsor' }); learners.push(m.learner); if (m.key) keys.push({ name: r.name, email: r.email, key: m.key }); const ex = await S.bestEntitlement(schoolId, m.learner._id, course._id); if (ex && ['active', 'paused'].includes(E.entState(ex))) skipped.push(r.email); }
  if (skipped.length) return bad(res, 409, `${skipped.length} learner(s) already have access: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}. Remove them and try again.`);
  let taken = 0; if (cohort) { for (let i = 0; i < rows.length; i += 1) { if (await S.takeSeat(cohort)) taken += 1; else break; } if (taken < rows.length) { for (let i = 0; i < taken; i += 1) await S.freeSeat(cohort._id); return bad(res, 409, `The cohort has room for ${taken} more, not ${rows.length}.`); } }
  const inv = await S.numbered(TrSponsorship, schoolId, 'invoiceNo', 'SP', { sponsorId: sponsor._id, courseId: course._id, cohortId: cohort?._id || null, courseTitle: course.title, learnerIds: learners.map((l) => l._id), seats: rows.length, pricePerSeat: price, discountNote: note, net: p.net, tax: p.tax, total: p.total, policyVersion: pol.version, createdByName: req.actorName || '' });
  await A(req, 'training.sponsorship.create', inv._id, `${inv.invoiceNo} ${rows.length} seats`); res.status(201).json({ invoice: inv, keys });
});
exports.confirmSponsorship = run('tr.confirmSponsorship', async (req, res) => {
  const schoolId = sid(req); const inv = await TrSponsorship.findOne({ _id: oid(req.params.id), schoolId }); if (!inv) return bad(res, 404, 'Invoice not found.'); const b = req.body || {};
  if (inv.status !== 'invoiced') return bad(res, 409, inv.status === 'paid' ? 'This invoice is already paid.' : 'This invoice was cancelled.');
  const ref = clean(b.reference, 80); if (ref.length < 3) return bad(res, 422, 'Write the payment reference you checked.'); if (E.int(b.amount, -1) !== inv.total) return bad(res, 422, `The invoice total is ${inv.total}. Confirm the exact amount received.`);
  const done = await TrSponsorship.updateOne({ _id: inv._id, status: 'invoiced' }, { $set: { status: 'paid', paidAt: new Date(), reference: ref, confirmedBy: req.actorName || '' } }); if (!done.matchedCount) return bad(res, 409, 'This invoice was just changed. Reload.');
  const course = await S.TrCourse.findOne({ _id: inv.courseId, schoolId }); const cohort = inv.cohortId ? await S.TrCohort.findOne({ _id: inv.cohortId, schoolId }) : null; let granted = 0;
  for (const lid of inv.learnerIds) { const l = await TrLearner.findById(lid); if (!l) continue; const g = await S.grant(schoolId, { learner: l, course, cohort, sponsorshipId: inv._id, source: 'sponsor', by: req.actorName || '' }); if (g.created) granted += 1; await S.notifyLearner(schoolId, l, 'You have been enrolled', `${course.title} was paid for by your organisation.`); }
  await A(req, 'training.sponsorship.confirm', inv._id, `${inv.invoiceNo} ${inv.total}`); res.json({ ok: true, granted });
});
exports.cancelSponsorship = run('tr.cancelSponsorship', async (req, res) => {
  const schoolId = sid(req); const inv = await TrSponsorship.findOne({ _id: oid(req.params.id), schoolId }); if (!inv) return bad(res, 404, 'Invoice not found.'); if (inv.status !== 'invoiced') return bad(res, 409, 'Only an unpaid invoice can be cancelled. Revoke access for a paid one.');
  const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Say why (at least 10 characters).');
  const r = await TrSponsorship.updateOne({ _id: inv._id, status: 'invoiced' }, { $set: { status: 'cancelled', discountNote: `${inv.discountNote ? `${inv.discountNote} | ` : ''}Cancelled: ${reason}` } }); if (!r.matchedCount) return bad(res, 409, 'This invoice was just changed. Reload.');
  for (let i = 0; i < inv.seats && inv.cohortId; i += 1) await S.freeSeat(inv.cohortId); await A(req, 'training.sponsorship.cancel', inv._id, reason); res.json({ ok: true });
});

/* ───────── reports ───────── */
exports.reports = run('tr.reports', async (req, res) => {
  const schoolId = sid(req); const days = Math.min(365, Math.max(7, E.int(req.query.days, 90))); const since = new Date(Date.now() - days * E.DAY);
  const orders = await TrOrder.find({ schoolId, createdAt: { $gte: since } }).limit(5000); const sps = await TrSponsorship.find({ schoolId, createdAt: { $gte: since } }).limit(2000);
  const by = new Map(); const get = (k, t) => { if (!by.has(k)) by.set(k, { key: k, title: t, orders: 0, paid: 0, refunded: 0, net: 0, discount: 0, tax: 0 }); return by.get(k); };
  let created = 0; let paidCount = 0;
  for (const o of orders) { created += 1; const r = get(String(o.courseId || o.bundleId), o.title); r.orders += 1; r.discount += o.discount; if (o.status !== 'cancelled') { const paid = o.installments.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0); if (paid > 0 || o.total === 0) paidCount += 1; r.paid += paid; r.refunded += o.refunded || 0; } }
  for (const s of sps) if (s.status === 'paid') { const r = get(String(s.courseId), s.courseTitle); r.paid += s.total; r.orders += s.seats; }
  const rows = [...by.values()].map((r) => ({ ...r, net: r.paid - r.refunded })).sort((a, b) => b.net - a.net);
  const attrib = new Map(); for (const o of orders) if (o.coupon?.code && o.status !== 'cancelled') { const k = o.coupon.attribution || o.coupon.code; const a = attrib.get(k) || { source: k, orders: 0, discount: 0 }; a.orders += 1; a.discount += o.discount; attrib.set(k, a); }
  const ents = await TrEntitlement.find({ schoolId, createdAt: { $gte: since } }).select('completion status courseId'); const done = ents.filter((e) => e.completion === 'complete').length;
  const refunds = orders.filter((o) => (o.refunded || 0) > 0).length;
  res.json({ days, orders: created, paidOrders: paidCount, conversion: created ? Math.round((paidCount * 100) / created) : 0, refundRate: paidCount ? Math.round((refunds * 100) / paidCount) : 0, completionRate: ents.length ? Math.round((done * 100) / ents.length) : 0, byCourse: rows, bySource: [...attrib.values()], totals: { paid: rows.reduce((s, r) => s + r.paid, 0), refunded: rows.reduce((s, r) => s + r.refunded, 0), net: rows.reduce((s, r) => s + r.net, 0), discount: rows.reduce((s, r) => s + r.discount, 0) } });
});
