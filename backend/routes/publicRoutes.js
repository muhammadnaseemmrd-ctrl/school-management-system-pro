const express = require('express');
const router = express.Router();
const Offer = require('../models/Offer');
const { FEATURES, getPlansMap } = require('../utils/plans');

// Public, read-only data for the marketing page: active plans and running offers.
// No school data and no offer codes are exposed here.
router.get('/plans', async (req, res) => {
  try {
    const map = await getPlansMap();
    const plans = Object.values(map)
      .filter((p) => p.isActive)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((p) => ({
        slug: p.slug, label: p.label, description: p.description,
        pricePKR: p.pricePKR, yearlyPricePKR: p.yearlyPricePKR,
        studentLimit: p.studentLimit, teacherLimit: p.teacherLimit,
        features: FEATURES.filter((f) => p.features[f.key]).map((f) => f.label),
      }));
    const now = new Date();
    const offers = (await Offer.find({ isActive: true }).sort({ createdAt: -1 }))
      .filter((o) => (!o.validFrom || o.validFrom <= now) && (!o.validUntil || o.validUntil >= now))
      .map((o) => ({
        title: o.title, description: o.description, discountType: o.discountType,
        discountValue: o.discountValue, planSlugs: o.planSlugs || [], validUntil: o.validUntil || null,
      }));
    res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.json({ plans, offers });
  } catch (e) { res.status(500).json({ message: 'Could not load plans' }); }
});

module.exports = router;
