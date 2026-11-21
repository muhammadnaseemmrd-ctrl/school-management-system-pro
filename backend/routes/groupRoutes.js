const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/groupController');

// administrators only; a campus administrator sees and changes only their own campuses, and the group's own rules are for the whole school
router.use(authenticate, authorize('admin'));

router.get('/access', c.access);
router.get('/rollup', c.rollup);
router.get('/rollup/:campusId', c.campusDetail);

router.get('/policies/catalog', c.catalog);
router.get('/policies', c.policies);
router.get('/policies/group', c.groupRules);
router.get('/policies/pending', c.pending);
router.get('/policies/history', c.history);
router.get('/effective', c.effective);
router.put('/policies/group/:key', c.wideOnly, c.proposeGroup);
router.put('/policies/campus/:campusId/:key', c.proposeCampus);
router.post('/policies/:id/decide', c.wideOnly, c.decide);

module.exports = router;
