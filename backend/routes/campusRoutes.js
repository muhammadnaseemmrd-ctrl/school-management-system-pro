const express = require('express');
const router = express.Router();
const c = require('../controllers/campusController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));
router.get('/', c.overview);
router.post('/', c.create);
router.get('/classes', c.classes);
router.get('/staff', c.staff);
router.get('/members', c.members);
router.post('/members', c.addMember);
router.delete('/members/:mid', c.removeMember);
router.patch('/:id', c.update);
router.post('/:id/classes', c.assignClasses);
router.post('/:id/staff', c.assignStaff);

module.exports = router;
