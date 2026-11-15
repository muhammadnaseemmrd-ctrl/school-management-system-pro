const mongoose = require('mongoose');

// Parent / guardian account. One parent can be linked to many children
// (students) of the same school and gets a read-only dashboard.
const parentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
    password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
    phone: { type: String, default: null },
    role: { type: String, enum: ['parent'], default: 'parent', required: true },
    relationship: { type: String, enum: ['Father', 'Mother', 'Guardian'], default: 'Guardian' },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
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
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  { timestamps: true }
);

parentSchema.index({ email: 1, schoolId: 1 }, { unique: true });
parentSchema.index({ schoolId: 1, children: 1 });

module.exports = mongoose.model('Parent', parentSchema);
