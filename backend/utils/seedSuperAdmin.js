const SuperAdmin = require('../models/SuperAdmin');
const { hashPassword, validatePasswordStrength } = require('./password');

// Creates the platform owner from env vars the first time the server boots.
//   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME (optional)
//   SUPERADMIN_FORCE_RESET=true  -> re-apply the env password on boot (recovery)
const seedSuperAdmin = async () => {
  const email = (process.env.SUPERADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    const count = await SuperAdmin.countDocuments();
    if (count === 0) {
      console.warn('[superadmin] No Super Admin exists. Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD and restart.');
    }
    return null;
  }
  if (!validatePasswordStrength(password)) {
    console.error('[superadmin] SUPERADMIN_PASSWORD is too weak (min 6 chars, 1 capital, 1 number, 1 special). Not seeding.');
    return null;
  }
  let admin = await SuperAdmin.findOne({ email }).select('+password');
  if (!admin) {
    admin = await SuperAdmin.create({
      name: process.env.SUPERADMIN_NAME || 'Platform Owner',
      email,
      password: await hashPassword(password),
    });
    console.log(`[superadmin] Created platform owner account: ${email}`);
  } else if (process.env.SUPERADMIN_FORCE_RESET === 'true') {
    admin.password = await hashPassword(password);
    admin.refreshTokens = [];
    admin.passwordChangedAt = new Date();
    await admin.save();
    console.log(`[superadmin] Password reset for: ${email}`);
  }
  return admin;
};

module.exports = { seedSuperAdmin };
