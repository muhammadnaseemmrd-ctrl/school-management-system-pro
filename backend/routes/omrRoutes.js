const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const F = require('../controllers/omrFormController');
const X = require('../controllers/omrScanController');

const staff = authorize('admin', 'teacher'); const admin = authorize('admin');
router.use(authenticate);

// answer sheets, printing and keys
router.get('/forms', staff, F.list); router.post('/forms', staff, F.create);
router.get('/forms/:id', staff, F.get); router.put('/forms/:id', staff, F.update); router.post('/forms/:id/archive', staff, F.archive); router.post('/forms/:id/candidates', staff, F.syncCandidates);
router.get('/forms/:id/sheet', staff, F.sheet); router.get('/forms/:id/layout', staff, F.layout);
router.post('/forms/:id/key', staff, F.setKey); router.get('/forms/:id/key/history', staff, F.keyHistory);
router.post('/forms/:formId/batches', staff, X.createBatch);

// batches: photographs, grading, moderation, publishing
router.get('/batches', staff, X.batches); router.get('/batches/:id', staff, X.batch);
router.get('/batches/:id/scans', staff, X.scans); router.post('/batches/:id/scans', staff, X.upload);
router.post('/batches/:id/grade', staff, X.grade); router.post('/batches/:id/submit', staff, X.submit); router.get('/batches/:id/moderation', staff, X.moderation); router.post('/batches/:id/note', staff, X.note);
router.post('/batches/:id/approve', admin, X.approve); router.post('/batches/:id/reopen', admin, X.reopen); router.post('/batches/:id/publish', admin, X.publish); router.post('/batches/:id/regrade-published', admin, X.regradePublished);
router.get('/batches/:id/export', staff, X.exportCsv);

// one sheet
router.get('/scans/:id', staff, X.scan); router.get('/scans/:id/image', staff, X.image); router.post('/scans/:id/review', staff, X.review); router.post('/scans/:id/reject', staff, X.reject);
module.exports = router;
