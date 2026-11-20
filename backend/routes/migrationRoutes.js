const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const M = require('../controllers/migrationController');

router.use(authenticate, authorize('admin'));
router.get('/overview', M.overview);
router.get('/template/:kind', M.template);

router.get('/import', M.importList);
router.post('/import/preview', M.importPreview);
router.get('/import/:id', M.importGet);
router.get('/import/:id/issues.csv', M.importIssues);
router.post('/import/:id/decisions', M.importDecisions);
router.post('/import/:id/commit', M.importCommit);
router.post('/import/:id/rollback', M.importRollback);
router.post('/import/:id/cancel', M.importCancel);

router.get('/rollover', M.rolloverList);
router.post('/rollover', M.rolloverCreate);
router.get('/rollover/:id', M.rolloverGet);
router.patch('/rollover/:id/config', M.rolloverConfig);
router.post('/rollover/:id/preview', M.rolloverPreview);
router.post('/rollover/:id/freeze', M.rolloverFreeze);
router.post('/rollover/:id/unfreeze', M.rolloverUnfreeze);
router.post('/rollover/:id/review', M.rolloverReview);
router.post('/rollover/:id/commit', M.rolloverCommit);
router.post('/rollover/:id/rollback', M.rolloverRollback);
router.post('/rollover/:id/cancel', M.rolloverCancel);

module.exports = router;
