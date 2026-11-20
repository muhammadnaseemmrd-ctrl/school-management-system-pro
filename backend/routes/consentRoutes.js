const express = require('express');
const router = express.Router();
const c = require('../controllers/consentController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/purposes', c.purposes);
// parents answer for their children and themselves; a student can look but not answer
router.get('/mine', authorize('parent', 'student'), c.mine);
router.post('/mine', authorize('parent'), c.mineGrant);
router.post('/mine/withdraw', authorize('parent'), c.mineWithdraw);
// the school office
router.get('/', authorize('admin'), c.list);
router.get('/summary', authorize('admin'), c.summary);
router.get('/pending', authorize('admin'), c.pending);
router.get('/history', authorize('admin'), c.history);
router.get('/check', authorize('admin'), c.check);
router.post('/', authorize('admin'), c.record);
router.post('/withdraw', authorize('admin'), c.withdraw);

module.exports = router;
