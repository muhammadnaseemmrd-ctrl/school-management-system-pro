const express = require('express');
const router = express.Router();
const c = require('../controllers/parentController');
const { authenticate, authorize } = require('../middleware/auth');

// ── Parent portal (read-only) ──
router.get('/me/children', authenticate, authorize('parent'), c.getMyChildren);
router.get('/me/children/:studentId/attendance', authenticate, authorize('parent'), c.getChildAttendance);

// ── School admin: manage parent accounts ──
router.get('/', authenticate, authorize('admin'), c.adminList);
router.post('/', authenticate, authorize('admin'), c.adminCreate);
router.put('/:id', authenticate, authorize('admin'), c.adminUpdate);
router.delete('/:id', authenticate, authorize('admin'), c.adminDelete);

module.exports = router;
