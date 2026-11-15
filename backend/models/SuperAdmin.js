const mongoose = require('../lib/pgdoc');

// Platform-level owner account (SaaS operator). Not tied to any school.
const superAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, unique: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['superadmin'], default: 'superadmin' },
    avatar: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    refreshTokens: [
      {
        token: String,
        createdAt: { type: Date, default: Date.now, expires: 2592000 },
      },
    ],
    passwordChangedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('SuperAdmin', superAdminSchema);
