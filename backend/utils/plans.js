// Subscription plan catalogue. 0 = unlimited.
const PLANS = {
  free:     { label: 'Free',     studentLimit: 100, teacherLimit: 10, priceUSD: 0 },
  standard: { label: 'Standard', studentLimit: 500, teacherLimit: 50, priceUSD: 29 },
  premium:  { label: 'Premium',  studentLimit: 0,   teacherLimit: 0,  priceUSD: 79 },
};

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
    return {
      ok: false,
      message: `Your ${PLANS[school.plan]?.label || school.plan} plan allows up to ${limit} ${kind}s (currently ${current}). Please contact the platform owner to upgrade.`,
    };
  }
  return { ok: true };
};

module.exports = { PLANS, checkLimit };
