const express = require('express');
const router = express.Router();
const c = require('../controllers/permissionController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));
router.get('/matrix', c.matrix);
router.get('/people', c.people);
router.get('/grants', c.list);
router.post('/grants', c.create);
router.post('/grants/:id/revoke', c.revoke);
router.post('/break-glass', c.breakGlass);

module.exports = router;
