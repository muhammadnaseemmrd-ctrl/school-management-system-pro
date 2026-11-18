// Partner agent portal. Every query is filtered by the agent id in the token and returns named fields only:
// an agent never sees students, fees, marks, admin emails or anything else inside a school.
const mongoose = require('../lib/pgdoc');
const Agent = require('../models/Agent');
const School = require('../models/School');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const Commission = require('../models/Commission');
const AgentPayout = require('../models/AgentPayout');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const billing = require('../utils/billing');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const page = (q, def = 25) => {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 100);
  const p = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, skip: (p - 1) * limit, page: p };
};

const publicAgent = (a) => ({
  id: a._id, name: a.name, email: a.email, phone: a.phone, city: a.city, role: 'agent',
  referralCode: a.referralCode, commissionPercent: a.commissionPercent, isActive: a.isActive,
  payout: a.payout || {}, lastLogin: a.lastLogin, createdAt: a.createdAt,
});

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const agent = await Agent.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    if (!agent || !(await comparePassword(password, agent.password))) return res.status(401).json({ message: 'Invalid credentials' });
    if (!agent.isActive) return res.status(403).json({ message: 'This agent account is suspended. Please contact the platform owner.' });
    const accessToken = generateAccessToken(agent._id, null, 'agent');
    const refreshToken = generateRefreshToken(agent._id, null, 'agent');
    agent.refreshTokens.push({ token: refreshToken });
    agent.lastLogin = new Date();
    await agent.save();
    res.json({ message: 'Login successful', user: publicAgent(agent), school: null, accessToken, refreshToken });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// Loads the agent for every portal call and stops a suspended agent mid-session.
exports.requireActiveAgent = async (req, res, next) => {
  try {
    const agent = await Agent.findById(req.user.userId);
    if (!agent) return res.status(401).json({ message: 'Agent not found' });
    if (!agent.isActive) return res.status(423).json({ message: 'This agent account is suspended.', code: 'AGENT_SUSPENDED' });
    req.agent = agent;
    next();
  } catch (e) { next(e); }
};

exports.me = async (req, res) => res.json({ agent: publicAgent(req.agent) });

exports.updateMe = async (req, res) => {
  try {
    const { name, phone, city, payout } = req.body || {};
    const patch = {};
    if (name !== undefined) { if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty' }); patch.name = String(name).trim().slice(0, 80); }
    if (phone !== undefined) patch.phone = String(phone).trim().slice(0, 30);
    if (city !== undefined) patch.city = String(city).trim().slice(0, 60);
    if (payout && typeof payout === 'object') {
      if (payout.method !== undefined && !['', 'bank', 'jazzcash', 'easypaisa'].includes(payout.method)) return res.status(400).json({ message: 'Choose bank, JazzCash or Easypaisa' });
      patch.payout = {
        method: payout.method ?? req.agent.payout?.method ?? '',
        accountTitle: String(payout.accountTitle ?? req.agent.payout?.accountTitle ?? '').slice(0, 80),
        accountNumber: String(payout.accountNumber ?? req.agent.payout?.accountNumber ?? '').slice(0, 40),
      };
    }
    // commission percentage, referral code and status are owner-only and are never read from this request
    const agent = await Agent.findByIdAndUpdate(req.agent._id, patch, { new: true });
    res.json({ message: 'Profile updated', agent: publicAgent(agent) });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const agent = await Agent.findById(req.agent._id).select('+password');
    if (!currentPassword || !(await comparePassword(currentPassword, agent.password))) return res.status(400).json({ message: 'Current password is incorrect' });
    if (!validatePasswordStrength(newPassword)) return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    agent.password = await hashPassword(newPassword);
    agent.passwordChangedAt = new Date();
    agent.refreshTokens = [];
    await agent.save();
    res.json({ message: 'Password changed' });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const schoolStatus = (s, now = new Date()) => {
  if (!s.isActive) return 'Suspended';
  if (s.subscriptionExpiresAt && s.subscriptionExpiresAt < now) return 'Expired';
  if (s.plan === 'free') return 'Free';
  return 'Paying';
};

const sums = async (Model, match, groupField, sumField = 'amountPKR') => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${groupField}`, total: { $sum: `$${sumField}` } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.total]));
};

exports.summary = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const [schools, paid, pending, approved, paidOut, expiring] = await Promise.all([
      School.find({ agentId }).select('isActive plan subscriptionExpiresAt'),
      SubscriptionPayment.aggregate([{ $match: { agentId, status: 'Confirmed' } }, { $group: { _id: null, total: { $sum: '$amountPKR' }, count: { $sum: 1 } } }]),
      Commission.aggregate([{ $match: { agentId, status: 'Pending' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
      Commission.aggregate([{ $match: { agentId, status: 'Approved' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
      Commission.aggregate([{ $match: { agentId, status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
      School.find({ agentId, isActive: true, subscriptionExpiresAt: { $gte: now, $lte: soon } }).sort({ subscriptionExpiresAt: 1 }).limit(5).select('name code subscriptionExpiresAt plan'),
    ]);
    const by = { Paying: 0, Free: 0, Expired: 0, Suspended: 0 };
    schools.forEach((s) => { by[schoolStatus(s, now)] += 1; });
    res.json({
      agent: publicAgent(req.agent),
      schools: { total: schools.length, ...by },
      payments: { count: paid[0]?.count || 0, totalPKR: paid[0]?.total || 0 },
      commission: { pendingPKR: pending[0]?.total || 0, approvedPKR: approved[0]?.total || 0, paidPKR: paidOut[0]?.total || 0, earnedPKR: (pending[0]?.total || 0) + (approved[0]?.total || 0) + (paidOut[0]?.total || 0) },
      expiringSoon: expiring.map((s) => ({ id: s._id, name: s.name, code: s.code, plan: s.plan, subscriptionExpiresAt: s.subscriptionExpiresAt })),
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.schools = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { limit, skip, page: p } = page(req.query);
    const filter = { agentId };
    if (req.query.search) { const rx = { $regex: escapeRx(String(req.query.search).slice(0, 60)), $options: 'i' }; filter.$or = [{ name: rx }, { code: rx }]; }
    const [rows, total, paidBy, earnedBy] = await Promise.all([
      School.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('name code address.city address.province plan isActive subscriptionExpiresAt createdAt referredAt principalName phone agentCommissionPercent'),
      School.countDocuments(filter),
      sums(SubscriptionPayment, { agentId, status: 'Confirmed' }, 'schoolId'),
      sums(Commission, { agentId, status: { $in: ['Pending', 'Approved', 'Paid'] } }, 'schoolId'),
    ]);
    const now = new Date();
    res.json({
      schools: rows.map((s) => ({
        id: s._id, name: s.name, code: s.code, city: s.address?.city || '', province: s.address?.province || '',
        plan: s.plan, status: schoolStatus(s, now), subscriptionExpiresAt: s.subscriptionExpiresAt, joinedAt: s.referredAt || s.createdAt,
        contactName: s.principalName || '', contactPhone: s.phone || '', commissionPercent: s.agentCommissionPercent,
        totalPaidPKR: paidBy[String(s._id)] || 0, commissionPKR: earnedBy[String(s._id)] || 0,
      })),
      pagination: { total, pages: Math.ceil(total / limit), currentPage: p },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.payments = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { limit, skip, page: p } = page(req.query);
    const filter = { agentId };
    if (req.query.schoolId && mongoose.isValidObjectId(req.query.schoolId)) filter.schoolId = oid(req.query.schoolId);
    const [rows, total] = await Promise.all([
      SubscriptionPayment.find(filter).sort({ paidAt: -1 }).skip(skip).limit(limit)
        .select('schoolId schoolName planSlug billingPeriod amountPKR method paidAt status commissionPercent coversFrom coversTo'),
      SubscriptionPayment.countDocuments(filter),
    ]);
    const comms = rows.length ? await Commission.find({ agentId, paymentId: { $in: rows.map((r) => r._id) }, kind: 'accrual' }).select('paymentId amountPKR status') : [];
    const byPay = Object.fromEntries(comms.map((c) => [String(c.paymentId), c]));
    res.json({
      payments: rows.map((r) => ({
        id: r._id, schoolId: r.schoolId, schoolName: r.schoolName, plan: r.planSlug, billingPeriod: r.billingPeriod, amountPKR: r.amountPKR,
        method: r.method, paidAt: r.paidAt, status: r.status, coversFrom: r.coversFrom, coversTo: r.coversTo,
        commissionPercent: r.commissionPercent, commissionPKR: byPay[String(r._id)]?.amountPKR || 0, commissionStatus: byPay[String(r._id)]?.status,
      })),
      pagination: { total, pages: Math.ceil(total / limit), currentPage: p },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.commissions = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { limit, skip, page: p } = page(req.query);
    const filter = { agentId };
    if (['Pending', 'Approved', 'Paid', 'Void'].includes(req.query.status)) filter.status = req.query.status;
    const [rows, total, pending, approved, paid] = await Promise.all([
      Commission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Commission.countDocuments(filter),
      Commission.aggregate([{ $match: { agentId, status: 'Pending' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
      Commission.aggregate([{ $match: { agentId, status: 'Approved' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
      Commission.aggregate([{ $match: { agentId, status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$amountPKR' } } }]),
    ]);
    res.json({
      commissions: rows.map((c) => ({
        id: c._id, schoolName: c.schoolName, kind: c.kind, baseAmountPKR: c.baseAmountPKR, percent: c.percent, amountPKR: c.amountPKR,
        status: c.status, eligibleAt: c.eligibleAt, approvedAt: c.approvedAt, payoutId: c.payoutId, voidReason: c.voidReason, createdAt: c.createdAt,
      })),
      balance: { pendingPKR: pending[0]?.total || 0, approvedPKR: approved[0]?.total || 0, paidPKR: paid[0]?.total || 0 },
      pagination: { total, pages: Math.ceil(total / limit), currentPage: p },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.payouts = async (req, res) => {
  try {
    const { limit, skip, page: p } = page(req.query);
    const filter = { agentId: req.agent._id };
    const [rows, total] = await Promise.all([
      AgentPayout.find(filter).sort({ paidAt: -1 }).skip(skip).limit(limit).select('amountPKR method reference paidAt note commissionIds'),
      AgentPayout.countDocuments(filter),
    ]);
    res.json({
      payouts: rows.map((r) => ({ id: r._id, amountPKR: r.amountPKR, method: r.method, reference: r.reference, paidAt: r.paidAt, note: r.note, items: (r.commissionIds || []).length })),
      pagination: { total, pages: Math.ceil(total / limit), currentPage: p },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.policy = async (req, res) => {
  try { res.json({ policy: await billing.getPolicy() }); } catch (e) { res.status(500).json({ message: e.message }); }
};
