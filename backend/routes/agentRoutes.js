const express = require('express');
const router = express.Router();
const c = require('../controllers/agentController');
const { authenticate, authorize } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

router.post('/login', loginLimiter, c.login);

// Everything below needs an active agent token
router.use(authenticate, authorize('agent'), c.requireActiveAgent);
router.get('/me', c.me);
router.put('/me', c.updateMe);
router.put('/password', c.changePassword);
router.get('/summary', c.summary);
router.get('/schools', c.schools);
router.get('/payments', c.payments);
router.get('/commissions', c.commissions);
router.get('/payouts', c.payouts);
router.get('/policy', c.policy);

module.exports = router;
