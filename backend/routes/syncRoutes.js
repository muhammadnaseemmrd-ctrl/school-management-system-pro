const express = require('express'); const router = express.Router(); const c = require('../controllers/syncController'); const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);
const staff = authorize('admin', 'teacher'); const admin = authorize('admin'); const teacher = authorize('teacher');
router.post('/push', staff, c.push); router.get('/pull', staff, c.pull); router.get('/mutations', staff, c.mutations);
router.get('/drafts', teacher, c.listDrafts); router.post('/drafts/:localId/publish', teacher, c.publishDraft); router.post('/drafts/:localId/discard', teacher, c.discardDraft);
router.get('/conflicts', staff, c.listConflicts); router.post('/conflicts/:id/resolve', staff, c.resolve); router.post('/conflicts/:id/delegate', staff, c.delegate);
router.get('/overview', admin, c.overview); router.get('/rejections', admin, c.recentRejections);
module.exports = router;
