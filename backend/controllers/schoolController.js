const School = require('../models/School');
const User = require('../models/User');
const mongoose = require('../lib/pgdoc');
const Agent = require('../models/Agent');
const { hashPassword, validatePasswordStrength } = require('../utils/password');

// Keeps the school's Urdu name available to the screen translator: the English name is the
// source label, the Urdu name its text. Clearing the Urdu name removes the override again.
async function syncNameOverride(schoolId, before, after) {
  if (!after) return;
  const TranslationOverride = require('../models/TranslationOverride');
  const oldName = String(before.name || '').trim();
  const name = String(after.name || '').trim();
  const ur = String(after.nameUr || '').trim();
  if (oldName && oldName !== name) await TranslationOverride.deleteMany({ schoolId, lang: 'ur', source: oldName });
  if (!name) return;
  if (ur) await TranslationOverride.updateOne({ schoolId, lang: 'ur', source: name }, { $set: { text: ur, note: 'School name', updatedByName: 'School settings' } }, { upsert: true });
  else await TranslationOverride.deleteMany({ schoolId, lang: 'ur', source: name });
  try { require('./i18nController').forgetOverrides(schoolId); } catch (e) { /* the wording map simply refreshes a moment later */ }
}
exports._syncNameOverride = syncNameOverride;

// What kinds of place there are, and what this one is. The browser filters its menu from the
// `hide` list, so a screen can never appear in a menu the server would refuse to serve.
exports.institutionTypes = async (req, res) => {
  try {
    const IT = require('../utils/institutionTypes');
    let mine = null;
    if (req.user?.schoolId) {
      const sc = await School.findById(req.user.schoolId).select('institutionType');
      mine = IT.shapeFor(sc?.institutionType);
    }
    res.json({ types: IT.catalogue(), mine, switchable: IT.SWITCHABLE });
  } catch (e) {
    res.status(500).json({ message: 'Could not load the kinds of institution.' });
  }
};

// Public self-service school sign-up (always starts on the Free plan).
// Platform owners create schools on any plan via /api/superadmin/schools.
exports.createSchool = async (req, res) => {
  try {
    const { name, email, phone, address, principalName, principalEmail, adminName, adminEmail, adminPassword } = req.body;
    let code = String(req.body.code || '').trim().toUpperCase();

    if (!name || !email || !phone || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: 'School name, email, phone, admin name, admin email and password are required' });
    }
    if (!validatePasswordStrength(adminPassword)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }

    // The code is an internal id now: people sign in with e-mail. Make one from the name unless the caller supplied it.
    if (!code) {
      const stem = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SCHOOL';
      for (let i = 0; i < 8 && !code; i += 1) {
        const tryCode = `${stem}${Math.floor(1000 + Math.random() * 9000)}`;
        if (!(await School.findOne({ code: tryCode }))) code = tryCode;
      }
      if (!code) return res.status(500).json({ message: 'Could not create the school. Please try again.' });
    }
    const schoolExists = await School.findOne({ code });
    if (schoolExists) {
      return res.status(400).json({ message: 'School with this code already exists' });
    }
    if (await School.findOne({ email: String(email).toLowerCase() })) {
      return res.status(400).json({ message: 'A school with this email already exists' });
    }

    // Optional partner referral (?ref=AG-XXXX). It never blocks sign-up: a bad or own-email code is simply not linked.
    let agentFields = {}; let referral = { linked: false };
    const refCode = String(req.body.referralCode || '').trim().toUpperCase();
    if (refCode) {
      const agent = await Agent.findOne({ referralCode: refCode, isActive: true });
      if (!agent) referral = { linked: false, reason: 'unknown-code' };
      else if ([email, principalEmail, adminEmail].some((m) => String(m || '').toLowerCase() === agent.email)) referral = { linked: false, reason: 'same-email' };
      else {
        agentFields = { agentId: agent._id, agentCommissionPercent: agent.commissionPercent, referredAt: new Date(), referralSource: req.body.referralSource === 'code' ? 'code' : 'link' };
        referral = { linked: true };
      }
    }

    const adminId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    const hashedPassword = await hashPassword(adminPassword);

    const school = await School.create({
      _id: schoolId,
      name,
      code,
      adminId,
      email,
      phone,
      address,
      principalName,
      principalEmail,
      isActive: true,
      plan: 'free',
      studentLimit: 100,
      teacherLimit: 10,
      createdVia: 'self-signup',
      ...agentFields,
    });

    const admin = await User.create({
      _id: adminId,
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      phone,
      role: 'admin',
      schoolId: school._id,
    });

    res.status(201).json({
      message: 'School created successfully',
      referral,
      school: { ...school.toObject(), agentId: undefined, agentCommissionPercent: undefined, referredAt: undefined, referralSource: undefined },
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Schools (Super Admin Only)
exports.getAllSchools = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const schools = await School.find(query)
      .populate('adminId', 'name email')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await School.countDocuments(query);

    res.json({
      schools,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get School by ID
exports.getSchoolById = async (req, res) => {
  try {
    if (req.params.id !== req.user.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const school = await School.findById(req.params.id)
      .populate('adminId', 'name email phone');

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json({ school });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get My School (For Admin)
exports.getMySchool = async (req, res) => {
  try {
    const school = await School.findById(req.user.schoolId)
      .populate('adminId', 'name email phone');

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json({ school });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update School
exports.updateSchool = async (req, res) => {
  try {
    if (req.params.id !== req.user.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Admins may only edit profile fields – never plan, limits, status or ownership
    const allowed = ['name', 'nameUr', 'institutionType', 'phone', 'address', 'logo', 'website', 'principalName', 'principalEmail', 'motto', 'academicYear', 'paymentInfo', 'timezone'];
    if (req.body.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en', { timeZone: req.body.timezone }); } catch (e) { return res.status(400).json({ message: 'Invalid time zone (use a name like Asia/Karachi)' }); }
    }
    if (req.body.name !== undefined && !String(req.body.name).trim()) return res.status(400).json({ message: 'School name cannot be empty' });
    if (req.body.institutionType !== undefined) {
      const IT = require('../utils/institutionTypes');
      if (!IT.keys.includes(String(req.body.institutionType))) return res.status(400).json({ message: `Choose one of: ${IT.keys.join(', ')}.` });
    }
    if (req.body.nameUr !== undefined) {
      const un = String(req.body.nameUr).trim();
      if (un.length > 160) return res.status(400).json({ message: 'The Urdu name can be up to 160 characters.' });
      if (/[<>]/.test(un)) return res.status(400).json({ message: 'Plain text only: no < or >.' });
      req.body.nameUr = un;
    }
    if (req.body.logo && !/^(https?:\/\/|\/api\/files\/stored\/)/.test(req.body.logo)) return res.status(400).json({ message: 'Invalid logo' });
    if (req.body.paymentInfo) {
      const pi = {};
      ['bankName', 'accountTitle', 'accountNumber', 'iban', 'jazzcash', 'easypaisa', 'instructions'].forEach((k) => { pi[k] = String(req.body.paymentInfo[k] || '').slice(0, 300); });
      req.body.paymentInfo = pi;
    }
    const patch = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });

    const before = (patch.name !== undefined || patch.nameUr !== undefined)
      ? await School.findById(req.params.id).select('name nameUr')
      : null;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      patch,
      { new: true, runValidators: true }
    ).populate('adminId', 'name email');

    // The Urdu name is kept as a wording override too, so every screen that shows the
    // English name picks it up through the usual translation layer.
    if (before) await syncNameOverride(req.user.schoolId, before, school).catch((e) => console.error('nameUr sync:', e.message));
    if (patch.institutionType !== undefined) require('../middleware/institution').forget(req.params.id);

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json({
      message: 'School updated successfully',
      school,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get School Statistics
exports.getSchoolStats = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    const Student = require('../models/Student');
    const Teacher = require('../models/Teacher');
    const Class = require('../models/Class');
    const Subject = require('../models/Subject');
    const Attendance = require('../models/Attendance');
    const Complaint = require('../models/Complaint');

    const totalStudents = await Student.countDocuments({ schoolId });
    const totalTeachers = await Teacher.countDocuments({ schoolId });
    const totalClasses = await Class.countDocuments({ schoolId });
    const totalSubjects = await Subject.countDocuments({ schoolId });
    const totalAttendance = await Attendance.countDocuments({ schoolId });
    const pendingComplaints = await Complaint.countDocuments({
      schoolId,
      status: 'Pending',
    });

    // Today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayAttendance = await Attendance.countDocuments({
      schoolId,
      date: { $gte: today },
    });

    res.json({
      stats: {
        totalStudents,
        totalTeachers,
        totalClasses,
        totalSubjects,
        totalAttendance,
        pendingComplaints,
        todayAttendance,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Current plan and which modules are switched on (used by the apps to hide locked tabs)
exports.getMyPlan = async (req, res) => {
  try {
    if (!req.user.schoolId) return res.json({ plan: null, features: {} });
    const { featuresForSchool } = require('../utils/plans');
    const School = require('../models/School');
    const [{ slug, plan, features }, school] = await Promise.all([
      featuresForSchool(req.user.schoolId),
      School.findById(req.user.schoolId).select('subscriptionExpiresAt studentLimit teacherLimit'),
    ]);
    res.json({
      plan: slug, label: plan?.label || slug, features,
      studentLimit: school?.studentLimit ?? 0, teacherLimit: school?.teacherLimit ?? 0,
      expiresAt: school?.subscriptionExpiresAt || null,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};


// Name, logo and payment details – shown in the app header and on the fee screen (any signed-in school user)
exports.getBranding = async (req, res) => {
  try {
    if (!req.user.schoolId) return res.json({ branding: null });
    const s = await School.findById(req.user.schoolId).select('name nameUr institutionType logo motto academicYear paymentInfo phone email website');
    res.json({ branding: s });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// Plan, usage and offers for the school admin
exports.getBilling = async (req, res) => {
  try {
    const Offer = require('../models/Offer');
    const Student = require('../models/Student');
    const Teacher = require('../models/Teacher');
    const { getPlansMap } = require('../utils/plans');
    const school = await School.findById(req.user.schoolId);
    const plans = await getPlansMap();
    const plan = plans[school.plan] || null;
    const now = new Date();
    const live = await Offer.find({ isActive: true, validFrom: { $lte: now }, $or: [{ validUntil: null }, { validUntil: { $gte: now } }] });
    const price = plan?.pricePKR || 0;
    const calc = (o, base) => Math.max(0, Math.round(o.discountType === 'percent' ? base * (1 - o.discountValue / 100) : base - o.discountValue));
    const shape = (o) => ({
      _id: o._id, title: o.title, description: o.description, code: o.code, discountType: o.discountType, discountValue: o.discountValue,
      validUntil: o.validUntil, planSlugs: o.planSlugs,
      prices: Object.fromEntries(Object.entries(plans).filter(([k, p]) => p.isActive !== false && (!o.planSlugs.length || o.planSlugs.includes(k))).map(([k, p]) => [k, { label: p.label, original: p.pricePKR, discounted: calc(o, p.pricePKR) }])),
    });
    const applied = school.offerId ? await Offer.findById(school.offerId) : null;
    const [students, teachers] = await Promise.all([Student.countDocuments({ schoolId: school._id }), Teacher.countDocuments({ schoolId: school._id })]);
    res.json({
      plan: { slug: school.plan, label: plan?.label || school.plan, pricePKR: price, yearlyPricePKR: plan?.yearlyPricePKR || 0, features: plan?.features || {} },
      pricePayablePKR: applied ? calc(applied, price) : price,
      appliedOffer: applied ? shape(applied) : null,
      offers: live.map(shape),
      usage: { students, teachers, studentLimit: school.studentLimit, teacherLimit: school.teacherLimit },
      expiresAt: school.subscriptionExpiresAt,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
