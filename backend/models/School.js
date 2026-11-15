const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'School code is required'],
      unique: true,
      trim: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    email: {
      type: String,
      required: [true, 'School email is required'],
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    logo: {
      type: String,
      default: null,
    },
    website: String,
    principalName: String,
    principalEmail: String,
    studentCount: {
      type: Number,
      default: 0,
    },
    teacherCount: {
      type: Number,
      default: 0,
    },
    classCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // IANA time zone used for period windows & "today" (e.g. Asia/Karachi)
    timezone: { type: String, default: () => process.env.DEFAULT_TIMEZONE || 'UTC' },
    // ── SaaS subscription fields ──
    plan: {
      type: String,
      enum: ['free', 'standard', 'premium'],
      default: 'free',
    },
    // 0 = unlimited
    studentLimit: { type: Number, default: 100 },
    teacherLimit: { type: Number, default: 10 },
    subscriptionExpiresAt: { type: Date, default: null },
    suspendedReason: { type: String, default: '' },
    createdVia: { type: String, enum: ['self-signup', 'superadmin', 'seed'], default: 'self-signup' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('School', schoolSchema);
