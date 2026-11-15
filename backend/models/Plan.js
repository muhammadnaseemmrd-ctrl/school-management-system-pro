const mongoose = require('mongoose');

// Subscription plans are managed by the platform owner (Super Admin).
const planSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    pricePKR: { type: Number, default: 0, min: 0 },         // per month
    yearlyPricePKR: { type: Number, default: 0, min: 0 },   // optional, 0 = not offered
    studentLimit: { type: Number, default: 0, min: 0 },     // 0 = unlimited
    teacherLimit: { type: Number, default: 0, min: 0 },     // 0 = unlimited
    features: { type: Map, of: Boolean, default: {} },
    isActive: { type: Boolean, default: true },             // inactive plans can't be newly assigned
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
