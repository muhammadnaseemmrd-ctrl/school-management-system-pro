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
    motto: { type: String, default: '' },
    academicYear: { type: String, default: '' },
    // Shown to parents/students on the fee screen so they know where to send money
    paymentInfo: {
      bankName: { type: String, default: '' },
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      iban: { type: String, default: '' },
      jazzcash: { type: String, default: '' },
      easypaisa: { type: String, default: '' },
      instructions: { type: String, default: '' },
    },
    // Offer the platform owner applied to this school
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', default: null },
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
    // slug of a Plan managed by the Super Admin (see models/Plan.js)
    plan: {
      type: String,
      default: 'free',
      lowercase: true,
      trim: true,
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
