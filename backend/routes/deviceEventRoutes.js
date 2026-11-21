const express = require('express');
const router = express.Router();
const { makeLimiter } = require('../middleware/rateLimit');
const C = require('../controllers/securityController');

// Devices send metadata only. They sign in with their own key, not a person's account (PRD E34).
const limit = makeLimiter({ windowMs: 60 * 1000, max: 300, message: 'Too many requests from this device. Wait a moment.' });
router.post('/heartbeat', limit, C.deviceAuth, C.heartbeat);
router.post('/', limit, C.deviceAuth, C.ingest);
module.exports = router;
