const mongoose = require('../lib/pgdoc');

// Partner agent (marketer / services seller). Not tied to any school: they only ever see schools that carry their id.
const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, unique: true, trim: true },
    phone: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['agent'], default: 'agent' },
    // Public code printed on sign-up links, e.g. AG-7K2Q
    referralCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    // Applies to schools linked from now on; every school keeps the percentage frozen when it was linked.
    commissionPercent: { type: Number, required: true, min: 0, max: 100, default: 10 },
    isActive: { type: Boolean, default: true, index: true },
    payout: {
      method: { type: String, enum: ['', 'bank', 'jazzcash', 'easypaisa'], default: '' },
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
    },
    notes: { type: String, default: '' },
    avatar: { type: String, default: null },
    lastLogin: Date,
    passwordChangedAt: Date,
    refreshTokens: [{ token: String, createdAt: { type: Date, default: Date.now, expires: 2592000 } }],
  },
  { timestamps: true }
);
agentSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Agent', agentSchema);
