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
// Training: public course page, honest checkout, certificate check and sponsor report (PRD E17)
const trL = require('../controllers/trLearnController');
router.get('/training/credential/:key', lookupLimiter, trL.pubCredential);
router.get('/training/sponsor/:key', lookupLimiter, trL.pubSponsor);
router.get('/training/:code', lookupLimiter, trL.pubList);
router.get('/training/:code/course/:slug', lookupLimiter, trL.pubCourse);
router.post('/training/:code/quote', lookupLimiter, trL.pubQuote);
router.post('/training/:code/checkout', signupLimiter, trL.pubCheckout);
router.get('/registrar/verify/:key', lookupLimiter, require('../controllers/regStudentController').verify);
// Alumni, fundraising, service-hour confirmation and published annual reports (PRD E32). Private links and public codes only; nothing personal is returned.
const advL = require('../middleware/rateLimit').makeLimiter({ windowMs: 15 * 60 * 1000, max: 40, message: 'Too many requests. Please try again in a few minutes.' });
const advA = require('../controllers/advancementController'); const advQ = require('../controllers/qualityController');
router.get('/alumni/:token', lookupLimiter, advA.pubAlumnus); router.put('/alumni/:token/consent', advL, advA.pubConsent); router.post('/alumni/:token/employment', advL, advA.pubEmployment);
router.post('/alumni/:token/rsvp', advL, advA.pubRsvp); router.post('/alumni/:token/withdraw', advL, advA.pubWithdraw);
router.get('/campaigns/:code', lookupLimiter, advA.pubCampaign);
router.get('/service/:token', lookupLimiter, advQ.pubLog); router.post('/service/:token', advL, advQ.pubConfirm);
router.get('/annual/:code', lookupLimiter, advQ.pubReport);
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

// Website: ask for a demo or quote, view a quote by private link, show consented customer words (PRD E28)
const sales = require('../controllers/salesController');
router.post('/leads', signupLimiter, sales.publicLead);
router.get('/proposal/:token', lookupLimiter, sales.proposal);
router.post('/proposal/:token/accept', signupLimiter, sales.acceptProposal);
router.post('/proposal/:token/decline', signupLimiter, sales.declineProposal);
router.get('/proof', lookupLimiter, sales.publicProof);

module.exports = router;
