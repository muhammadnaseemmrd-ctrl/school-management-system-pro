const express = require('express');
const router = express.Router();
const c = require('../controllers/organizationController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('superadmin'));
router.get('/', c.list);
router.post('/', c.create);
router.get('/unassigned-schools', c.unassigned);
router.get('/:id', c.get);
router.patch('/:id', c.update);
router.post('/:id/schools', c.attach);
router.delete('/:id/schools/:schoolId', c.detach);

module.exports = router;
