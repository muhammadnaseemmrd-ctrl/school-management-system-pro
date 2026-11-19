const express = require('express'); const router = express.Router(); const c = require('../controllers/teacherTodayController'); const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate, authorize('teacher'));
router.get('/', c.today); router.get('/pack', c.pack);
module.exports = router;
