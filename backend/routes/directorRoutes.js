const express = require('express');
const router = express.Router();
const c = require('../controllers/directorController');
const { authenticate, authorize } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

router.post('/login', loginLimiter, c.login);

// Everything below is the director's own portal: their group only, counts only.
router.use(authenticate, authorize('director'), c.requireActiveDirector);

router.get('/me', c.me);
router.post('/me/password', c.changePassword);

router.get('/institution-types', c.institutionTypes);
router.get('/overview', c.overview);
router.post('/schools', c.mayCreate, c.createSchool);
// money across the group: totals and expenses, never a named child's fee record
router.get('/finance', c.finance);
router.get('/schools/:id/finance', c.schoolFinance);
router.get('/schools/:id', c.getSchool);
router.patch('/schools/:id', c.updateSchool);
router.post('/schools/:id/open', c.setSchoolOpen);
router.post('/schools/:id/admins', c.mayAppoint, c.addAdmin);
router.post('/schools/:id/admins/:userId/reset', c.mayAppoint, c.resetAdminPassword);
router.post('/schools/:id/admins/:userId/active', c.mayAppoint, c.setAdminActive);

module.exports = router;
