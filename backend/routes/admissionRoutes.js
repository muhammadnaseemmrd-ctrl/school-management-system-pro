const express = require('express');
const router = express.Router();
const c = require('../controllers/admissionController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));
router.get('/summary', c.summary);
router.get('/capacity', c.capacity);
router.put('/capacity', c.setCapacity);
router.get('/inquiries', c.listInquiries);
router.post('/inquiries', c.createInquiry);
router.put('/inquiries/:id', c.updateInquiry);
router.get('/applications', c.listApplications);
router.post('/applications', c.createApplication);
router.get('/applications/:id', c.getApplication);
router.put('/applications/:id', c.updateApplication);
router.post('/applications/:id/stage', c.changeStage);
router.post('/applications/:id/checklist/:key', c.checklist);
router.post('/applications/:id/duplicates', c.resolveDuplicate);
router.post('/applications/:id/enroll', c.enroll);

module.exports = router;
