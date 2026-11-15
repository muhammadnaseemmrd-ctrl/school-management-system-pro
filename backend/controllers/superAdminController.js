const mongoose = require('mongoose');
const crypto = require('crypto');
const SuperAdmin = require('../models/SuperAdmin');
const School = require('../models/School');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const Class = require('../models/Class');
const DailyAttendance = require('../models/DailyAttendance');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const Plan = require('../models/Plan');
const { FEATURES, FEATURE_KEYS, getPlansMap, invalidatePlans, clearSchoolPlanCache } = require('../utils/plans');
const { isValidTz } = require('../utils/time');
const { invalidateSchoolStatus } = require('../middleware/auth');

const strongTempPassword = () => {
  const base = crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, 'x');
  return `${base}A9!`; // guarantees capital, number, special
};

/* ───────────────────────── AUTH ───────────────────────── */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const admin = await SuperAdmin.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    if (!admin || !(await comparePassword(password, admin.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!admin.isActive) return res.status(403).json({ message: 'Account disabled' });

    const accessToken = generateAccessToken(admin._id, null, 'superadmin');
    const refreshToken = generateRefreshToken(admin._id, null, 'superadmin');
    admin.refreshTokens.push({ token: refreshToken });
    admin.lastLogin = new Date();
    await admin.save();
    admin.password = undefined;
    admin.refreshTokens = undefined;

    res.json({ message: 'Login successful', user: admin, school: null, accessToken, refreshToken });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/* ─────────────────────── PLATFORM STATS ─────────────────────── */
exports.getStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      totalSchools, activeSchools, newSchools30d, totalStudents, totalTeachers, totalParents,
      totalClasses, attendanceToday, planAgg, signupsAgg, expiringSoon,
    ] = await Promise.all([
      School.countDocuments(),
      School.countDocuments({ isActive: true }),
      School.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Student.countDocuments(),
      Teacher.countDocuments(),
      Parent.countDocuments(),
      Class.countDocuments(),
      DailyAttendance.countDocuments({ date: { $gte: startOfToday } }),
      School.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
      School.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
      School.countDocuments({
        subscriptionExpiresAt: { $gte: new Date(), $lte: new Date(Date.now() + 14 * 24 * 3600 * 1000) },
      }),
    ]);

    const PLANS = await getPlansMap();
    const planDistribution = {};
    Object.keys(PLANS).forEach((k) => { planDistribution[k] = 0; });
    planAgg.forEach((p) => { planDistribution[p._id] = p.count; });

    // Estimated monthly recurring revenue (PKR)
    const mrr = Object.entries(planDistribution).reduce((sum, [k, v]) => sum + (PLANS[k]?.pricePKR || 0) * v, 0);

    const signups = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const hit = signupsAgg.find((x) => x._id.y === y && x._id.m === m);
      signups.push({ month: d.toLocaleString('en', { month: 'short', year: '2-digit' }), count: hit ? hit.count : 0 });
    }

    res.json({
      stats: {
        totalSchools, activeSchools, suspendedSchools: totalSchools - activeSchools, newSchools30d,
        totalStudents, totalTeachers, totalParents, totalClasses, attendanceToday,
        planDistribution, mrr, expiringSoon, signups,
      },
      plans: PLANS,
      features: FEATURES,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/* ─────────────────────── SCHOOLS ─────────────────────── */
const withCounts = async (school) => {
  const [students, teachers, parents, classes] = await Promise.all([
    Student.countDocuments({ schoolId: school._id }),
    Teacher.countDocuments({ schoolId: school._id }),
    Parent.countDocuments({ schoolId: school._id }),
    Class.countDocuments({ schoolId: school._id }),
  ]);
  return { ...school.toObject(), counts: { students, teachers, parents, classes } };
};

exports.listSchools = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, plan } = req.query;
    const query = {};
    if (search) {
      const rx = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [{ name: rx }, { code: rx }, { email: rx }];
    }
    if (status === 'active') query.isActive = true;
    if (status === 'suspended') query.isActive = false;
    if (plan) query.plan = plan;

    const lim = Math.min(parseInt(limit) || 10, 100);
    const schools = await School.find(query)
      .populate('adminId', 'name email lastLogin')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * lim)
      .limit(lim);
    const total = await School.countDocuments(query);

    res.json({
      schools: await Promise.all(schools.map(withCounts)),
      pagination: { total, pages: Math.ceil(total / lim), currentPage: parseInt(page) },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id).populate('adminId', 'name email phone lastLogin');
    if (!school) return res.status(404).json({ message: 'School not found' });
    res.json({ school: await withCounts(school) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.createSchool = async (req, res) => {
  try {
    const { name, code, email, phone, address, adminName, adminEmail, adminPassword, plan = 'free', subscriptionExpiresAt, timezone } = req.body;
    if (!name || !code || !email || !phone || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: 'name, code, email, phone, adminName, adminEmail and adminPassword are required' });
    }
    const PLANS = await getPlansMap();
    if (!PLANS[plan]) return res.status(400).json({ message: 'Invalid plan' });
    if (timezone && !isValidTz(timezone)) return res.status(400).json({ message: 'Invalid time zone (use an IANA name like Asia/Karachi)' });
    if (!validatePasswordStrength(adminPassword)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }
    const cleanCode = String(code).trim().toUpperCase();
    if (await School.findOne({ code: cleanCode })) return res.status(400).json({ message: 'School with this code already exists' });
    if (await School.findOne({ email: String(email).toLowerCase() })) return res.status(400).json({ message: 'A school with this email already exists' });

    const adminId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    const p = PLANS[plan];

    const school = await School.create({
      _id: schoolId, name, code: cleanCode, adminId, email: String(email).toLowerCase(), phone, address,
      principalName: adminName, principalEmail: adminEmail, isActive: true,
      plan, studentLimit: p.studentLimit, teacherLimit: p.teacherLimit,
      subscriptionExpiresAt: subscriptionExpiresAt || null, createdVia: 'superadmin',
      ...(timezone ? { timezone } : {}),
    });
    await User.create({
      _id: adminId, name: adminName, email: adminEmail, password: await hashPassword(adminPassword),
      phone, role: 'admin', schoolId,
    });

    res.status(201).json({ message: 'School created', school, admin: { id: adminId, email: adminEmail, name: adminName } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateSchool = async (req, res) => {
  try {
    const allowed = ['name', 'email', 'phone', 'address', 'principalName', 'principalEmail', 'website',
      'plan', 'studentLimit', 'teacherLimit', 'subscriptionExpiresAt', 'timezone'];
    const patch = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });

    // Picking a plan applies its default limits unless explicit limits are sent too
    if (patch.plan) {
      const PLANS = await getPlansMap();
      if (!PLANS[patch.plan]) return res.status(400).json({ message: 'Invalid plan' });
      if (patch.studentLimit === undefined) patch.studentLimit = PLANS[patch.plan].studentLimit;
      if (patch.teacherLimit === undefined) patch.teacherLimit = PLANS[patch.plan].teacherLimit;
    }
    if (patch.timezone && !isValidTz(patch.timezone)) return res.status(400).json({ message: 'Invalid time zone (use an IANA name like Asia/Karachi)' });
    if (patch.subscriptionExpiresAt === '') patch.subscriptionExpiresAt = null;

    clearSchoolPlanCache();
    const school = await School.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true })
      .populate('adminId', 'name email lastLogin');
    if (!school) return res.status(404).json({ message: 'School not found' });
    invalidateSchoolStatus(school._id);
    res.json({ message: 'School updated', school: await withCounts(school) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.setSchoolStatus = async (req, res) => {
  try {
    const { isActive, reason = '' } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'isActive (boolean) is required' });
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { isActive, suspendedReason: isActive ? '' : reason },
      { new: true }
    ).populate('adminId', 'name email lastLogin');
    if (!school) return res.status(404).json({ message: 'School not found' });
    invalidateSchoolStatus(school._id);
    res.json({ message: isActive ? 'School activated' : 'School suspended', school: await withCounts(school) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.resetAdminPassword = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });
    const admin = await User.findById(school.adminId);
    if (!admin) return res.status(404).json({ message: 'School admin account not found' });

    const temp = req.body.newPassword || strongTempPassword();
    if (!validatePasswordStrength(temp)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }
    admin.password = await hashPassword(temp);
    admin.refreshTokens = [];
    admin.passwordChangedAt = new Date();
    await admin.save();
    res.json({ message: 'Admin password reset', adminEmail: admin.email, temporaryPassword: temp });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Permanently removes a school and ALL of its data. Requires typing the school code.
exports.deleteSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });
    if (String(req.body.confirmCode || '').trim().toUpperCase() !== school.code.toUpperCase()) {
      return res.status(400).json({ message: 'Confirmation code does not match the school code' });
    }
    const removed = {};
    for (const name of mongoose.modelNames()) {
      const Model = mongoose.model(name);
      if (name !== 'School' && Model.schema.path('schoolId')) {
        const r = await Model.deleteMany({ schoolId: school._id });
        removed[name] = r.deletedCount;
      }
    }
    await School.findByIdAndDelete(school._id);
    invalidateSchoolStatus(school._id);
    res.json({ message: 'School and all related data deleted', removed });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getPlans = async (req, res) => {
  try { res.json({ plans: await getPlansMap(), features: FEATURES }); } catch (e) { res.status(500).json({ message: e.message }); }
};

/* ─────────────────────── PLAN MANAGEMENT ─────────────────────── */
const cleanFeatures = (input) => Object.fromEntries(FEATURE_KEYS.map((k) => [k, !!(input && input[k])]));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : d; };

exports.createPlan = async (req, res) => {
  try {
    const { label, description = '', pricePKR, yearlyPricePKR, studentLimit, teacherLimit, features, isActive = true } = req.body;
    if (!label || !String(label).trim()) return res.status(400).json({ message: 'Plan name is required' });
    const slug = String(req.body.slug || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return res.status(400).json({ message: 'Invalid plan name' });
    if (await Plan.findOne({ slug })) return res.status(400).json({ message: 'A plan with this name already exists' });
    const last = await Plan.findOne().sort({ sortOrder: -1 });
    const plan = await Plan.create({
      slug, label: String(label).trim(), description, pricePKR: num(pricePKR), yearlyPricePKR: num(yearlyPricePKR),
      studentLimit: num(studentLimit), teacherLimit: num(teacherLimit), features: cleanFeatures(features),
      isActive: !!isActive, sortOrder: (last?.sortOrder || 0) + 1,
    });
    invalidatePlans();
    res.status(201).json({ message: 'Plan created', plan });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const plan = await Plan.findOne({ slug: req.params.slug });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    const b = req.body;
    if (b.label !== undefined) plan.label = String(b.label).trim() || plan.label;
    if (b.description !== undefined) plan.description = b.description;
    if (b.pricePKR !== undefined) plan.pricePKR = num(b.pricePKR);
    if (b.yearlyPricePKR !== undefined) plan.yearlyPricePKR = num(b.yearlyPricePKR);
    if (b.studentLimit !== undefined) plan.studentLimit = num(b.studentLimit);
    if (b.teacherLimit !== undefined) plan.teacherLimit = num(b.teacherLimit);
    if (b.features !== undefined) plan.features = cleanFeatures(b.features);
    if (b.isActive !== undefined) plan.isActive = !!b.isActive;
    await plan.save();

    // Schools on this plan follow its limits (features are read live from the plan)
    let updated = 0;
    if (b.applyLimitsToSchools !== false && (b.studentLimit !== undefined || b.teacherLimit !== undefined)) {
      const r = await School.updateMany({ plan: plan.slug }, { studentLimit: plan.studentLimit, teacherLimit: plan.teacherLimit });
      updated = r.modifiedCount || 0;
    }
    invalidatePlans();
    clearSchoolPlanCache();
    res.json({ message: 'Plan updated', plan, schoolsUpdated: updated });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const inUse = await School.countDocuments({ plan: req.params.slug });
    if (inUse) return res.status(400).json({ message: `${inUse} school(s) are on this plan. Move them to another plan first, or just deactivate the plan.` });
    const r = await Plan.deleteOne({ slug: req.params.slug });
    if (!r.deletedCount) return res.status(404).json({ message: 'Plan not found' });
    invalidatePlans();
    res.json({ message: 'Plan deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
