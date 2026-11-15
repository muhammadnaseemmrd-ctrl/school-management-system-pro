const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userRole: { type: String, enum: ['admin', 'teacher', 'student', 'parent'], required: true },
    type: { type: String, default: 'general' }, // notice, fee, homework, attendance, message, complaint, offer
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' }, // in-app path, e.g. /parent/dashboard#/fees
    key: { type: String, default: '' },  // de-duplication key
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, expires: 60 * 24 * 3600 }, // auto-delete after 60 days
  },
  { versionKey: false }
);
notificationSchema.index({ userId: 1, userRole: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, key: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
