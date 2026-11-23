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

// The people who run a group. A director signs in on their own portal and may open schools in
// this group and appoint the people who run them; they never read inside a school.
const d = require('../controllers/directorController');
router.get('/:id/directors', d.ownerList);
router.post('/:id/directors', d.ownerCreate);
router.patch('/:id/directors/:directorId', d.ownerUpdate);
router.post('/:id/directors/:directorId/reset', d.ownerReset);

module.exports = router;
