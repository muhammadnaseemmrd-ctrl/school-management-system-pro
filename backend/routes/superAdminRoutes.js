const express = require('express');
const router = express.Router();
const c = require('../controllers/superAdminController');
const { authenticate, authorize } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

// Public (rate-limited) login for the platform owner
router.post('/login', loginLimiter, c.login);

// Everything below requires a Super Admin token
router.use(authenticate, authorize('superadmin'));

router.get('/stats', c.getStats);
router.get('/plans', c.getPlans);
router.post('/plans', c.createPlan);
router.put('/plans/:slug', c.updatePlan);
router.delete('/plans/:slug', c.deletePlan);
router.get('/schools', c.listSchools);
router.post('/schools', c.createSchool);
router.get('/schools/:id', c.getSchool);
router.put('/schools/:id', c.updateSchool);
router.patch('/schools/:id/status', c.setSchoolStatus);
router.post('/schools/:id/reset-admin-password', c.resetAdminPassword);
router.delete('/schools/:id', c.deleteSchool);

module.exports = router;
