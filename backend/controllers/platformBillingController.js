// Platform owner: agents, what schools paid, commission approval/payouts, ledger and reconciliation.
const mongoose = require('../lib/pgdoc');
const crypto = require('crypto');
const Agent = require('../models/Agent');
const School = require('../models/School');
const SuperAdmin = require('../models/SuperAdmin');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const Commission = require('../models/Commission');
const AgentPayout = require('../models/AgentPayout');
const AuditLog = require('../models/AuditLog');
const billing = require('../utils/billing');
const ledger = require('../utils/ledger');
const { audit } = require('../utils/audit');
const { hashPassword, validatePasswordStrength, strongTempPassword } = require('../utils/password');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const validId = (v) => mongoose.isValidObjectId(v);
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const paging = (q, def = 25) => {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 100);
  const p = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, skip: (p - 1) * limit, page: p };
};
const fail = (res, e) => res.status(e.status || 500).json({ message: e.message, ...(e.expectedAmount !== undefined ? { expectedAmount: e.expectedAmount } : {}) });
const actorOf = async (req) => {
  const a = await SuperAdmin.findById(req.user.userId).select('name');
  req.actorName = a?.name || 'Owner';
  return { userId: req.user.userId, name: req.actorName };
};
const sums = async (Model, match, groupField, sumField = 'amountPKR') => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${groupField}`, total: { $sum: `$${sumField}` } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.total]));
};

/* ───────────────────────── agents ───────────────────────── */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newReferralCode = async () => {
  for (let i = 0; i < 20; i++) {
    const code = `AG-${Array.from(crypto.randomBytes(4)).map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('')}`;
    if (!(await Agent.findOne({ referralCode: code }).select('_id'))) return code;
  }
  throw new Error('Could not generate a referral code');
};
const parsePercent = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
};
const shapeAgent = (a, extra = {}) => ({
  id: a._id, name: a.name, email: a.email, phone: a.phone, city: a.city, referralCode: a.referralCode,
  commissionPercent: a.commissionPercent, isActive: a.isActive, payout: a.payout || {}, notes: a.notes || '', lastLogin: a.lastLogin, createdAt: a.createdAt, ...extra,
});

exports.listAgents = async (req, res) => {
  try {
    const { limit, skip, page: p } = paging(req.query, 50);
    const filter = {};
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'suspended') filter.isActive = false;
    if (req.query.search) { const rx = { $regex: escapeRx(String(req.query.search).slice(0, 60)), $options: 'i' }; filter.$or = [{ name: rx }, { email: rx }, { referralCode: rx }]; }
    const [agents, total, schoolCount, paid, pending, approved, paidOut] = await Promise.all([
      Agent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Agent.countDocuments(filter),
      School.aggregate([{ $match: { agentId: { $ne: null } } }, { $group: { _id: '$agentId', total: { $count: {} } } }]),
      sums(SubscriptionPayment, { status: 'Confirmed', agentId: { $ne: null } }, 'agentId'),
      sums(Commission, { status: 'Pending' }, 'agentId'),
      sums(Commission, { status: 'Approved' }, 'agentId'),
      sums(Commission, { status: 'Paid' }, 'agentId'),
    ]);
    const sc = Object.fromEntries(schoolCount.map((r) => [String(r._id), r.total]));
    res.json({
      agents: agents.map((a) => shapeAgent(a, {
        schools: sc[String(a._id)] || 0, totalPaidPKR: paid[String(a._id)] || 0,
        commission: { pendingPKR: pending[String(a._id)] || 0, approvedPKR: approved[String(a._id)] || 0, paidPKR: paidOut[String(a._id)] || 0 },
      })),
      pagination: { total, pages: Math.ceil(total / limit), currentPage: p },
    });
  } catch (e) { fail(res, e); }
};

exports.createAgent = async (req, res) => {
  try {
    const { name, email, phone = '', city = '', notes = '' } = req.body || {};
    if (!name || !String(name).trim() || !email) return res.status(400).json({ message: 'Name and email are required' });
    if (!/^\S+@\S+\.\S+$/.test(String(email))) return res.status(400).json({ message: 'Enter a valid email address' });
    const percent = parsePercent(req.body.commissionPercent ?? 10);
    if (percent === null) return res.status(400).json({ message: 'Commission must be a number from 0 to 100' });
    const mail = String(email).toLowerCase().trim();
    if (await Agent.findOne({ email: mail })) return res.status(400).json({ message: 'An agent with this email already exists' });
    const temp = req.body.password || strongTempPassword();
    if (!validatePasswordStrength(temp)) return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    const agent = await Agent.create({
      name: String(name).trim().slice(0, 80), email: mail, phone: String(phone).slice(0, 30), city: String(city).slice(0, 60), notes: String(notes).slice(0, 500),
      password: await hashPassword(temp), referralCode: await newReferralCode(), commissionPercent: percent,
    });
    await actorOf(req);
    await audit(req, { action: 'agent.create', entityType: 'Agent', entityId: agent._id, agentId: agent._id, detail: { commissionPercent: percent } });
    res.status(201).json({ message: 'Agent created', agent: shapeAgent(agent), temporaryPassword: temp });
  } catch (e) { fail(res, e); }
};

exports.updateAgent = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid agent id' });
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const b = req.body || {};
    const patch = {};
    ['name', 'phone', 'city', 'notes'].forEach((k) => { if (b[k] !== undefined) patch[k] = String(b[k]).trim().slice(0, k === 'notes' ? 500 : 80); });
    if (patch.name === '') return res.status(400).json({ message: 'Name cannot be empty' });
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    if (b.commissionPercent !== undefined) {
      const pct = parsePercent(b.commissionPercent);
      if (pct === null) return res.status(400).json({ message: 'Commission must be a number from 0 to 100' });
      patch.commissionPercent = pct;
    }
    const before = { commissionPercent: agent.commissionPercent, isActive: agent.isActive };
    const updated = await Agent.findByIdAndUpdate(agent._id, patch, { new: true });
    await actorOf(req);
    await audit(req, { action: 'agent.update', entityType: 'Agent', entityId: agent._id, agentId: agent._id, detail: { before, after: { commissionPercent: updated.commissionPercent, isActive: updated.isActive }, note: 'Percentage changes apply only to schools linked from now on' } });
    res.json({ message: 'Agent updated', agent: shapeAgent(updated) });
  } catch (e) { fail(res, e); }
};

exports.resetAgentPassword = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid agent id' });
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const temp = req.body?.newPassword || strongTempPassword();
    if (!validatePasswordStrength(temp)) return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    await Agent.updateOne({ _id: agent._id }, { $set: { password: await hashPassword(temp), refreshTokens: [], passwordChangedAt: new Date() } });
    await actorOf(req);
    await audit(req, { action: 'agent.reset-password', entityType: 'Agent', entityId: agent._id, agentId: agent._id });
    res.json({ message: 'Agent password reset', email: agent.email, temporaryPassword: temp });
  } catch (e) { fail(res, e); }
};

exports.getAgent = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid agent id' });
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const id = agent._id;
    const [schools, paidBy, earnedBy, pending, approved, paid] = await Promise.all([
      School.find({ agentId: id }).sort({ createdAt: -1 }).limit(200).select('name code plan isActive subscriptionExpiresAt agentCommissionPercent referredAt referralSource createdAt'),
      sums(SubscriptionPayment, { agentId: id, status: 'Confirmed' }, 'schoolId'),
      sums(Commission, { agentId: id, status: { $in: ['Pending', 'Approved', 'Paid'] } }, 'schoolId'),
      sums(Commission, { agentId: id, status: 'Pending' }, 'agentId'),
      sums(Commission, { agentId: id, status: 'Approved' }, 'agentId'),
      sums(Commission, { agentId: id, status: 'Paid' }, 'agentId'),
    ]);
    res.json({
      agent: shapeAgent(agent, { commission: { pendingPKR: pending[String(id)] || 0, approvedPKR: approved[String(id)] || 0, paidPKR: paid[String(id)] || 0 } }),
      schools: schools.map((s) => ({
        id: s._id, name: s.name, code: s.code, plan: s.plan, isActive: s.isActive, subscriptionExpiresAt: s.subscriptionExpiresAt,
        commissionPercent: s.agentCommissionPercent, referredAt: s.referredAt, referralSource: s.referralSource,
        totalPaidPKR: paidBy[String(s._id)] || 0, commissionPKR: earnedBy[String(s._id)] || 0,
      })),
    });
  } catch (e) { fail(res, e); }
};

/* ───────── link a school to an agent (or unlink) ───────── */
exports.setSchoolAgent = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid school id' });
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });
    const { agentId, commissionPercent, reason = '' } = req.body || {};
    const before = { agentId: school.agentId || null, commissionPercent: school.agentCommissionPercent || 0 };
    let patch;
    if (!agentId) {
      patch = { agentId: null, agentCommissionPercent: 0, referredAt: null, referralSource: '' };
    } else {
      if (!validId(agentId)) return res.status(400).json({ message: 'Invalid agent id' });
      const agent = await Agent.findById(agentId);
      if (!agent) return res.status(404).json({ message: 'Agent not found' });
      let pct = agent.commissionPercent;
      if (commissionPercent !== undefined && commissionPercent !== null && commissionPercent !== '') {
        pct = parsePercent(commissionPercent);
        if (pct === null) return res.status(400).json({ message: 'Commission must be a number from 0 to 100' });
      }
      const mails = [school.email, school.principalEmail].filter(Boolean).map((m) => String(m).toLowerCase());
      const adminMail = (await require('../models/User').findById(school.adminId).select('email'))?.email;
      if (adminMail) mails.push(String(adminMail).toLowerCase());
      if (mails.includes(agent.email)) return res.status(422).json({ message: 'An agent cannot be linked to a school that uses their own email address' });
      const same = String(school.agentId || '') === String(agent._id);
      patch = { agentId: agent._id, agentCommissionPercent: pct, referredAt: same && school.referredAt ? school.referredAt : new Date(), referralSource: 'superadmin' };
    }
    const updated = await School.findByIdAndUpdate(school._id, patch, { new: true });
    await actorOf(req);
    await audit(req, { action: 'school.agent-link', entityType: 'School', entityId: school._id, schoolId: school._id, agentId: patch.agentId || before.agentId,
      detail: { before, after: { agentId: patch.agentId, commissionPercent: patch.agentCommissionPercent }, reason: String(reason).slice(0, 200), note: 'Earlier payments keep their original agent' } });
    res.json({ message: agentId ? 'School linked to agent' : 'School unlinked from agent', school: { id: updated._id, agentId: updated.agentId, agentCommissionPercent: updated.agentCommissionPercent, referredAt: updated.referredAt } });
  } catch (e) { fail(res, e); }
};

/* ───────────────────────── school payments ───────────────────────── */
const shapePayment = (p) => ({
  id: p._id, schoolId: p.schoolId, schoolName: p.schoolName, schoolCode: p.schoolCode, plan: p.planSlug, billingPeriod: p.billingPeriod,
  amountPKR: p.amountPKR, method: p.method, reference: p.reference, paidAt: p.paidAt, coversFrom: p.coversFrom, coversTo: p.coversTo,
  status: p.status, refundedAt: p.refundedAt, refundReason: p.refundReason, agentId: p.agentId, commissionPercent: p.commissionPercent,
  settled: !!p.settledAt, note: p.note, recordedByName: p.recordedByName, createdAt: p.createdAt,
});

exports.listPayments = async (req, res) => {
  try {
    const { limit, skip, page: p } = paging(req.query);
    const filter = {};
    if (req.query.schoolId && validId(req.query.schoolId)) filter.schoolId = oid(req.query.schoolId);
    if (req.query.agentId && validId(req.query.agentId)) filter.agentId = oid(req.query.agentId);
    if (['Confirmed', 'Refunded'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.paidAt = {};
      if (req.query.from) filter.paidAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.paidAt.$lte = new Date(req.query.to);
    }
    const [rows, total, totals] = await Promise.all([
      SubscriptionPayment.find(filter).sort({ paidAt: -1 }).skip(skip).limit(limit),
      SubscriptionPayment.countDocuments(filter),
      SubscriptionPayment.aggregate([{ $match: { ...filter, status: 'Confirmed' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
    ]);
    res.json({ payments: rows.map(shapePayment), confirmedTotalPKR: totals[0]?.total || 0, pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
  } catch (e) { fail(res, e); }
};

exports.recordPayment = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.schoolId || !validId(b.schoolId)) return res.status(400).json({ message: 'Choose a school' });
    const actor = await actorOf(req);
    const idem = req.get('Idempotency-Key') || b.idempotencyKey;
    const { payment, duplicate } = await billing.recordPayment({ ...b, idempotencyKey: idem }, actor);
    if (!duplicate) await audit(req, { action: 'payment.record', entityType: 'SubscriptionPayment', entityId: payment._id, schoolId: payment.schoolId, agentId: payment.agentId,
      detail: { amountPKR: payment.amountPKR, plan: payment.planSlug, period: payment.billingPeriod, method: payment.method } });
    const school = await School.findById(payment.schoolId).select('plan subscriptionExpiresAt studentLimit teacherLimit isActive');
    res.status(duplicate ? 200 : 201).json({ message: duplicate ? 'This payment was already recorded' : 'Payment recorded and subscription extended', duplicate, payment: shapePayment(payment),
      school: { plan: school.plan, subscriptionExpiresAt: school.subscriptionExpiresAt, studentLimit: school.studentLimit, teacherLimit: school.teacherLimit, isActive: school.isActive } });
  } catch (e) { fail(res, e); }
};

exports.refundPayment = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid payment id' });
    const actor = await actorOf(req);
    const r = await billing.refundPayment(req.params.id, req.body?.reason, actor);
    await audit(req, { action: 'payment.refund', entityType: 'SubscriptionPayment', entityId: r.payment._id, schoolId: r.payment.schoolId, agentId: r.payment.agentId,
      detail: { reason: r.payment.refundReason, commission: r.commission ? 'reversed after payout' : 'voided if unpaid', subscription: r.subscription } });
    res.json({ message: 'Payment refunded', payment: shapePayment(r.payment), subscription: r.subscription, commissionReversal: !!r.commission });
  } catch (e) { fail(res, e); }
};

/* ───────────────────────── commissions and payouts ───────────────────────── */
const shapeCommission = (c) => ({
  id: c._id, agentId: c.agentId, schoolId: c.schoolId, schoolName: c.schoolName, paymentId: c.paymentId, kind: c.kind,
  baseAmountPKR: c.baseAmountPKR, percent: c.percent, amountPKR: c.amountPKR, status: c.status, eligibleAt: c.eligibleAt,
  approvedAt: c.approvedAt, approvedByName: c.approvedByName, payoutId: c.payoutId, voidReason: c.voidReason, createdAt: c.createdAt,
});

exports.listCommissions = async (req, res) => {
  try {
    const { limit, skip, page: p } = paging(req.query);
    const filter = {};
    if (req.query.agentId && validId(req.query.agentId)) filter.agentId = oid(req.query.agentId);
    if (['Pending', 'Approved', 'Paid', 'Void'].includes(req.query.status)) filter.status = req.query.status;
    const [rows, total] = await Promise.all([
      Commission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Commission.countDocuments(filter),
    ]);
    const agents = rows.length ? await Agent.find({ _id: { $in: [...new Set(rows.map((r) => String(r.agentId)))].map(oid) } }).select('name referralCode') : [];
    const nm = Object.fromEntries(agents.map((a) => [String(a._id), a.name]));
    res.json({ commissions: rows.map((c) => ({ ...shapeCommission(c), agentName: nm[String(c.agentId)] || '' })), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
  } catch (e) { fail(res, e); }
};

exports.approveCommissions = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(validId) : [];
    if (!ids.length) return res.status(400).json({ message: 'Choose at least one commission' });
    const actor = await actorOf(req);
    const r = await billing.approveCommissions(ids, actor, { force: !!req.body.force });
    await audit(req, { action: 'commission.approve', entityType: 'Commission', entityId: r.approved.join(','), detail: { approved: r.approved.length, skipped: r.skipped.length, forced: !!req.body.force } });
    res.json({ message: `${r.approved.length} approved`, ...r });
  } catch (e) { fail(res, e); }
};

exports.voidCommission = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid commission id' });
    const row = await billing.voidCommission(req.params.id, req.body?.reason);
    await actorOf(req);
    await audit(req, { action: 'commission.void', entityType: 'Commission', entityId: row._id, agentId: row.agentId, detail: { reason: row.voidReason } });
    res.json({ message: 'Commission voided', commission: shapeCommission(row) });
  } catch (e) { fail(res, e); }
};

exports.listPayouts = async (req, res) => {
  try {
    const { limit, skip, page: p } = paging(req.query);
    const filter = {};
    if (req.query.agentId && validId(req.query.agentId)) filter.agentId = oid(req.query.agentId);
    const [rows, total] = await Promise.all([AgentPayout.find(filter).sort({ paidAt: -1 }).skip(skip).limit(limit), AgentPayout.countDocuments(filter)]);
    res.json({ payouts: rows.map((r) => ({ id: r._id, agentId: r.agentId, agentName: r.agentName, amountPKR: r.amountPKR, method: r.method, reference: r.reference, paidAt: r.paidAt, note: r.note, items: (r.commissionIds || []).length, recordedByName: r.recordedByName })), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
  } catch (e) { fail(res, e); }
};

exports.recordPayout = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid agent id' });
    const actor = await actorOf(req);
    const r = await billing.recordPayout(req.params.id, req.body || {}, actor);
    await audit(req, { action: 'payout.record', entityType: 'AgentPayout', entityId: r.payout._id, agentId: r.payout.agentId, detail: { amountPKR: r.payout.amountPKR, items: r.rows, method: r.payout.method } });
    res.status(201).json({ message: 'Payout recorded', payout: { id: r.payout._id, amountPKR: r.payout.amountPKR, method: r.payout.method, reference: r.payout.reference, paidAt: r.payout.paidAt, items: r.rows } });
  } catch (e) { fail(res, e); }
};

/* ───────────────────────── policy, ledger, audit ───────────────────────── */
exports.getPolicy = async (req, res) => { try { res.json({ policy: await billing.getPolicy() }); } catch (e) { fail(res, e); } };
exports.setPolicy = async (req, res) => {
  try {
    const policy = await billing.setPolicy(req.body || {});
    await actorOf(req);
    await audit(req, { action: 'policy.update', entityType: 'AppSetting', entityId: 'agent_policy', detail: policy });
    res.json({ message: 'Commission rules saved', policy });
  } catch (e) { fail(res, e); }
};

exports.ledger = async (req, res) => {
  try { res.json(await billing.reconcile({ fix: false })); } catch (e) { fail(res, e); }
};
exports.reconcile = async (req, res) => {
  try {
    const r = await billing.reconcile({ fix: true });
    await actorOf(req);
    await audit(req, { action: 'ledger.reconcile', entityType: 'Ledger', detail: { ok: r.ok, fixed: r.fixed } });
    res.json(r);
  } catch (e) { fail(res, e); }
};

exports.auditLog = async (req, res) => {
  try {
    const { limit, skip, page: p } = paging(req.query, 50);
    const filter = {};
    if (req.query.entityType) filter.entityType = String(req.query.entityType).slice(0, 40);
    if (req.query.agentId && validId(req.query.agentId)) filter.agentId = oid(req.query.agentId);
    if (req.query.schoolId && validId(req.query.schoolId)) filter.schoolId = oid(req.query.schoolId);
    const [rows, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), AuditLog.countDocuments(filter)]);
    res.json({ entries: rows, pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
  } catch (e) { fail(res, e); }
};

// Real money numbers for the Super Admin overview (collected, not estimated)
exports.revenueSummary = async () => {
  const now = new Date();
  const monthStart = (back) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  const total = (m) => SubscriptionPayment.aggregate([{ $match: m }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]);
  const months = [5, 4, 3, 2, 1, 0];
  const [all, refunded, last30, byMonth, payable, unsettled, agents, activeAgents] = await Promise.all([
    total({ status: 'Confirmed' }),
    total({ status: 'Refunded' }),
    total({ status: 'Confirmed', paidAt: { $gte: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } }),
    Promise.all(months.map((b) => total({ status: 'Confirmed', paidAt: { $gte: monthStart(b), $lt: monthStart(b - 1) } }))),
    Commission.aggregate([{ $match: { status: { $in: ['Pending', 'Approved'] } } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
    SubscriptionPayment.countDocuments({ status: 'Confirmed', settledAt: null }),
    Agent.countDocuments(),
    Agent.countDocuments({ isActive: true }),
  ]);
  return {
    collectedTotalPKR: all[0]?.total || 0, refundedTotalPKR: refunded[0]?.total || 0, collected30dPKR: last30[0]?.total || 0,
    byMonth: months.map((b, i) => ({ month: monthStart(b).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }), totalPKR: byMonth[i][0]?.total || 0 })),
    commissionPayablePKR: payable[0]?.total || 0, unsettledPayments: unsettled, agents: { total: agents, active: activeAgents },
  };
};
