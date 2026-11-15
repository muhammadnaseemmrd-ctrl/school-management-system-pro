const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    phone: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student'],
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 2592000, // 30 days
        },
      },
    ],
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  { timestamps: true }
);

// Compound unique index: email + schoolId + role
userSchema.index({ email: 1, schoolId: 1, role: 1 }, { unique: true });

// Self-service profile (editable by the person) + uploaded documents
userSchema.add({
  profileExtra: {
    about: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    emergencyName: { type: String, default: '' },
    emergencyPhone: { type: String, default: '' },
  },
  uploadedDocuments: [{
    title: { type: String, required: true },
    category: { type: String, default: 'Other' },
    url: { type: String, required: true },
    fileName: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  }],
});


module.exports = mongoose.model('User', userSchema);
