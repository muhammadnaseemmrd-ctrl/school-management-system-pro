const express = require('express');
const router = express.Router();
const Offer = require('../models/Offer');
const { FEATURES, getPlansMap } = require('../utils/plans');
const Agent = require('../models/Agent');
const { lookupLimiter, signupLimiter } = require('../middleware/rateLimit');
const admissions = require('../controllers/admissionController');
const studioIssue = require('../controllers/studioIssueController');

// Check a printed document by the reference in its QR code (PRD E12). Rate limited, no sign-in, nothing personal beyond a masked name.
router.get('/verify/:token', lookupLimiter, studioIssue.verify);
// Which school owns this web address (PRD E27 white-label sign-in). Name, code, logo and colours only.
router.get('/brand', lookupLimiter, require('../controllers/themeController').publicBrand);

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

// Is this referral code real? Used by the sign-up form so a typo is caught before sending. Only the first name is shown.
// Website admission form (creates an inquiry only)
router.post('/schools/:code/inquiry', signupLimiter, admissions.publicInquiry);

router.get('/referral/:code', lookupLimiter, async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase().slice(0, 20);
    const agent = /^AG-[A-Z0-9]{4,8}$/.test(code) ? await Agent.findOne({ referralCode: code, isActive: true }).select('name') : null;
    res.set('Cache-Control', 'no-store');
    if (!agent) return res.json({ valid: false });
    res.json({ valid: true, agentFirstName: String(agent.name).trim().split(/\s+/)[0] });
  } catch (e) { res.status(500).json({ message: 'Could not check the code' }); }
});

module.exports = router;
