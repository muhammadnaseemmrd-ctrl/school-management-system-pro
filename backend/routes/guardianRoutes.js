const express = require('express');
const router = express.Router();
const c = require('../controllers/guardianController');
const { authenticate, authorize } = require('../middleware/auth');

// Rights and restrictions are managed by the school admin only. Teachers may run the pickup check at the gate.
router.get('/students/:studentId', authenticate, authorize('admin'), c.forStudent);
router.post('/students/:studentId/links', authenticate, authorize('admin'), c.createLink);
router.post('/students/:studentId/restrictions', authenticate, authorize('admin'), c.createRestriction);
router.post('/students/:studentId/pickup-verify', authenticate, authorize('admin', 'teacher'), c.verifyPickup);
router.put('/links/:id', authenticate, authorize('admin'), c.updateLink);
router.post('/links/:id/end', authenticate, authorize('admin'), c.endLink);
router.post('/restrictions/:id/end', authenticate, authorize('admin'), c.endRestriction);

module.exports = router;
