// Usage: SUPERADMIN_EMAIL=you@x.com SUPERADMIN_PASSWORD='Str0ng!Pass' node scripts/seedSuperAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const { seedSuperAdmin } = require('../utils/seedSuperAdmin');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await seedSuperAdmin();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
