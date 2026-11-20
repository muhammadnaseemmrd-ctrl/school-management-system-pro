const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const S = require('../utils/training/service');
const Ca = require('../controllers/trCatalogController');
const Co = require('../controllers/trCommerceController');
const Rv = require('../controllers/trReviewController');

const admin = authorize('admin');
const staff = authorize('admin', 'teacher');
// Training is school-wide, so an administrator limited to one campus is kept out (PRD E01 scope).
const CS = require('../utils/campus');
const wide = async (req, res, next) => { try { if (req.user.role === 'admin' && await CS.scopeOf(req.user)) return res.status(403).json({ message: 'Training is school-wide. Ask a school-wide administrator.' }); next(); } catch (e) { next(e); } };

/* ── what a learner uses: a private link or a student account ── */
const learn = express.Router();
learn.use(S.learnerAuth);
const L = require('../controllers/trLearnController');
learn.get('/me', L.me); learn.get('/catalog', L.catalog); learn.post('/checkout', L.checkout);
learn.post('/orders/:id/proof', L.proof); learn.post('/orders/:id/cancel', L.cancelOrder);
learn.get('/courses/:id', L.course); learn.get('/courses/:id/lessons/:lid', L.lesson);
learn.post('/courses/:id/lessons/:lid/beat', L.beat); learn.post('/courses/:id/lessons/:lid/position', L.position); learn.post('/courses/:id/lessons/:lid/answer', L.answer); learn.post('/courses/:id/lessons/:lid/complete', L.complete); learn.post('/courses/:id/lessons/:lid/submit', L.submit);
learn.get('/courses/:id/discussion', L.discussion); learn.post('/courses/:id/discussion', L.post); learn.post('/posts/:id/report', L.report);
learn.get('/courses/:id/slots', L.slots); learn.post('/slots/:id/book', L.bookSlot); learn.post('/slots/:id/cancel', L.cancelSlot);
learn.get('/credentials/:id/pdf', L.credentialPdf); learn.get('/credentials/:id/export', L.credentialExport);

/* ── staff ── */
const staffRouter = express.Router();
staffRouter.use(authenticate, staff, wide);
staffRouter.get('/overview', admin, Ca.overview);
staffRouter.get('/settings', admin, Ca.settings); staffRouter.put('/settings', admin, Ca.saveSettings);
staffRouter.get('/instructors', staff, Ca.instructors); staffRouter.post('/instructors', admin, Ca.createInstructor); staffRouter.patch('/instructors/:id', admin, Ca.updateInstructor); staffRouter.post('/instructors/:id/verify', admin, Ca.verifyInstructor); staffRouter.get('/teachers', admin, Ca.teachers);
staffRouter.get('/courses', staff, Ca.courses); staffRouter.post('/courses', admin, Ca.createCourse); staffRouter.get('/courses/:id', staff, Ca.course); staffRouter.patch('/courses/:id', staff, Ca.updateCourse); staffRouter.get('/courses/:id/checks', staff, Ca.courseChecks);
staffRouter.post('/courses/:id/submit', staff, Ca.submitCourse); staffRouter.post('/courses/:id/decide', admin, Ca.decideCourse); staffRouter.post('/courses/:id/archive', admin, Ca.archiveCourse);
staffRouter.get('/cohorts', staff, Ca.cohorts); staffRouter.post('/cohorts', admin, Ca.createCohort); staffRouter.get('/cohorts/:id', staff, Ca.cohort); staffRouter.patch('/cohorts/:id', admin, Ca.updateCohort); staffRouter.post('/cohorts/:id/status', admin, Ca.cohortStatus);
staffRouter.post('/cohorts/:id/sessions', staff, Ca.saveSession); staffRouter.patch('/cohorts/:id/sessions/:sid', staff, Ca.saveSession); staffRouter.delete('/cohorts/:id/sessions/:sid', staff, Ca.removeSession); staffRouter.post('/cohorts/:id/sessions/:sid/attendance', staff, Ca.attendance);
staffRouter.get('/bundles', admin, Ca.bundles); staffRouter.post('/bundles', admin, Ca.createBundle); staffRouter.patch('/bundles/:id', admin, Ca.updateBundle);
staffRouter.get('/coupons', admin, Ca.coupons); staffRouter.post('/coupons', admin, Ca.createCoupon); staffRouter.patch('/coupons/:id', admin, Ca.updateCoupon);

staffRouter.get('/learners', admin, Co.learners); staffRouter.post('/learners', admin, Co.createLearner); staffRouter.post('/learners/from-student', admin, Co.learnerFromStudent); staffRouter.get('/learners/:id', admin, Co.learner); staffRouter.patch('/learners/:id', admin, Co.updateLearner); staffRouter.post('/learners/:id/reset-key', admin, Co.resetKey);
staffRouter.get('/orders', admin, Co.orders); staffRouter.post('/orders', admin, Co.createOrder); staffRouter.get('/orders/:id', admin, Co.order);
staffRouter.post('/orders/:id/installments/:no/confirm', admin, Co.confirm); staffRouter.post('/orders/:id/installments/:no/reject-proof', admin, Co.rejectProof); staffRouter.post('/orders/:id/cancel', admin, Co.cancel); staffRouter.post('/orders/:id/refund', admin, Co.refund);
staffRouter.get('/entitlements', admin, Co.entitlements); staffRouter.post('/entitlements', admin, Co.grantComp); staffRouter.post('/entitlements/:id/revoke', admin, Co.revoke); staffRouter.post('/entitlements/:id/restore', admin, Co.restore);
staffRouter.get('/sponsors', admin, Co.sponsors); staffRouter.post('/sponsors', admin, Co.createSponsor); staffRouter.patch('/sponsors/:id', admin, Co.updateSponsor); staffRouter.post('/sponsors/:id/report-link', admin, Co.sponsorLink);
staffRouter.get('/sponsorships', admin, Co.sponsorships); staffRouter.post('/sponsorships', admin, Co.createSponsorship); staffRouter.post('/sponsorships/:id/confirm', admin, Co.confirmSponsorship); staffRouter.post('/sponsorships/:id/cancel', admin, Co.cancelSponsorship);
staffRouter.get('/reports', admin, Co.reports);

staffRouter.get('/submissions', staff, Rv.submissions); staffRouter.post('/submissions/:id/review', staff, Rv.reviewSubmission); staffRouter.post('/submissions/:id/attempts', staff, Rv.moreAttempts);
staffRouter.get('/completions', staff, Rv.completions); staffRouter.post('/completions/:id/decide', staff, Rv.decideCompletion);
staffRouter.get('/credentials', staff, Rv.credentials); staffRouter.get('/credentials/:id/pdf', staff, Rv.credentialPdf); staffRouter.post('/credentials/specialization', admin, Rv.specialization); staffRouter.post('/credentials/:id/revoke', admin, Rv.revokeCredential); staffRouter.post('/credentials/:id/keep', admin, Rv.clearFlag);
staffRouter.get('/posts', staff, Rv.posts); staffRouter.post('/posts/:id/decide', staff, Rv.decidePost); staffRouter.post('/courses/:id/posts', staff, Rv.staffPost);
staffRouter.get('/slots', staff, Rv.slots); staffRouter.post('/slots', staff, Rv.createSlots); staffRouter.post('/slots/:id/cancel', staff, Rv.cancelSlot); staffRouter.post('/slots/:id/outcome', staff, Rv.slotOutcome);

// the learner's routes come first: they use the learner link or a student token, never the staff gate
router.use('/learn', learn);
router.use('/', staffRouter);
module.exports = router;
