// Subscription plans are stored in the database and edited by the Super Admin.
// This module seeds sensible defaults, caches lookups and exposes feature flags.
const Plan = require('../models/Plan');

// Every feature the platform owner can switch on/off per plan.
const FEATURES = [
  { key: 'attendance', label: 'Daily attendance', desc: 'Head master attendance, half day, reports' },
  { key: 'parentPortal', label: 'Parent portal', desc: 'Parent logins to see attendance, notices and fees' },
  { key: 'fees', label: 'Fees & payment proofs', desc: 'Tuition plans, other fees, payment screenshot review' },
  { key: 'transport', label: 'Transport fees', desc: 'Routes, monthly transport fee for students' },
  { key: 'homework', label: 'Homework', desc: 'Homework assignment and submission' },
  { key: 'marks', label: 'Exams & marks', desc: 'Exams, marks and results' },
  { key: 'timetable', label: 'Timetable', desc: 'Class and teacher timetable' },
  { key: 'notices', label: 'Notices', desc: 'School notices and announcements' },
  { key: 'events', label: 'Events', desc: 'School events calendar' },
  { key: 'messages', label: 'Messages', desc: 'Messaging between users' },
  { key: 'complaints', label: 'Grievances', desc: 'Complaints / grievance desk' },
  { key: 'fileUploads', label: 'File uploads', desc: 'Attach files and images' },
];
const FEATURE_KEYS = FEATURES.map((f) => f.key);
const allOn = () => Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
const only = (keys) => Object.fromEntries(FEATURE_KEYS.map((k) => [k, keys.includes(k)]));

const DEFAULT_PLANS = [
  { slug: 'free', label: 'Free', description: 'Get started with the basics', pricePKR: 0, yearlyPricePKR: 0, studentLimit: 100, teacherLimit: 10, sortOrder: 1,
    features: only(['attendance', 'notices', 'homework', 'marks', 'timetable', 'events']) },
  { slug: 'standard', label: 'Standard', description: 'Parents and fee management', pricePKR: 4999, yearlyPricePKR: 49990, studentLimit: 500, teacherLimit: 50, sortOrder: 2,
    features: only(['attendance', 'parentPortal', 'fees', 'homework', 'marks', 'timetable', 'notices', 'events', 'messages', 'complaints', 'fileUploads']) },
  { slug: 'premium', label: 'Premium', description: 'Everything, unlimited', pricePKR: 12999, yearlyPricePKR: 129990, studentLimit: 0, teacherLimit: 0, sortOrder: 3,
    features: allOn() },
];

let cache = { map: null, ts: 0 };
const TTL = 30 * 1000;
const invalidatePlans = () => { cache = { map: null, ts: 0 }; };

const ensurePlans = async () => {
  if ((await Plan.countDocuments()) === 0) {
    await Plan.insertMany(DEFAULT_PLANS);
  }
};

const shape = (p) => ({
  slug: p.slug,
  label: p.label,
  description: p.description,
  pricePKR: p.pricePKR,
  yearlyPricePKR: p.yearlyPricePKR,
  studentLimit: p.studentLimit,
  teacherLimit: p.teacherLimit,
  isActive: p.isActive,
  sortOrder: p.sortOrder,
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, (p.features instanceof Map ? p.features.get(k) : p.features?.[k]) === true])),
});

// { slug: {label, pricePKR, studentLimit, ...} } sorted by sortOrder
const getPlansMap = async () => {
  if (cache.map && Date.now() - cache.ts < TTL) return cache.map;
  await ensurePlans();
  const list = await Plan.find().sort({ sortOrder: 1, createdAt: 1 });
  const map = {};
  list.forEach((p) => { map[p.slug] = shape(p); });
  cache = { map, ts: Date.now() };
  return map;
};

const getPlan = async (slug) => (await getPlansMap())[slug] || null;

// Throws-free helper: returns { ok, message }
const checkLimit = async (schoolId, kind, adding = 1) => {
  const School = require('../models/School');
  const school = await School.findById(schoolId);
  if (!school) return { ok: false, message: 'School not found' };
  const Model = kind === 'student' ? require('../models/Student') : require('../models/Teacher');
  const limit = kind === 'student' ? school.studentLimit : school.teacherLimit;
  if (!limit) return { ok: true };
  const current = await Model.countDocuments({ schoolId });
  if (current + adding > limit) {
    const plan = await getPlan(school.plan);
    return {
      ok: false,
      message: `Your ${plan?.label || school.plan} plan allows up to ${limit} ${kind}s (currently ${current}). Please contact the platform owner to upgrade.`,
    };
  }
  return { ok: true };
};

// ── Feature gate middleware (use after `authenticate`) ──
const schoolPlanCache = new Map(); // schoolId -> { slug, ts }
const planOfSchool = async (schoolId) => {
  const key = String(schoolId);
  const hit = schoolPlanCache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.slug;
  const School = require('../models/School');
  const s = await School.findById(schoolId).select('plan');
  const slug = s ? s.plan : null;
  schoolPlanCache.set(key, { slug, ts: Date.now() });
  return slug;
};
const clearSchoolPlanCache = () => schoolPlanCache.clear();

const featuresForSchool = async (schoolId) => {
  const slug = await planOfSchool(schoolId);
  const plan = slug ? await getPlan(slug) : null;
  return { slug, plan, features: plan ? plan.features : Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) };
};

const featureGate = (key) => async (req, res, next) => {
  try {
    if (!req.user || req.user.role === 'superadmin' || !req.user.schoolId) return next();
    const { plan, features } = await featuresForSchool(req.user.schoolId);
    if (features[key]) return next();
    return res.status(403).json({
      message: `${(FEATURES.find((f) => f.key === key) || {}).label || key} is not included in your school's ${plan?.label || ''} plan. Please ask the platform owner to upgrade.`,
      code: 'FEATURE_LOCKED',
      feature: key,
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  FEATURES, FEATURE_KEYS, DEFAULT_PLANS, ensurePlans, getPlansMap, getPlan, invalidatePlans,
  checkLimit, featureGate, featuresForSchool, clearSchoolPlanCache,
};
