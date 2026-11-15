// Usage: SUPERADMIN_EMAIL=you@x.com SUPERADMIN_PASSWORD='Str0ng!Pass' node scripts/seedSuperAdmin.js
require('dotenv').config();
const mongoose = require('../lib/pgdoc');
const { seedSuperAdmin } = require('../utils/seedSuperAdmin');

(async () => {
  await mongoose.connect();
  await seedSuperAdmin();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
