const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userRole: { type: String, required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: String, auth: String },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
