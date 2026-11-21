const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/aiController');
const A = require('../utils/ai/service');

// staff only (administrators and teachers). Parents and students never reach the assistant.
router.use(authenticate, authorize('admin', 'teacher'), A.staff);

router.get('/me', c.me);
router.get('/policy', A.adminOnly, c.policy);
router.put('/policy', A.adminOnly, c.propose);
router.post('/policy/decide', A.adminOnly, c.decidePolicy);
router.post('/policy/test', A.adminOnly, c.testModel);
router.get('/glossary', c.glossary);
router.put('/glossary', A.adminOnly, c.saveGlossary);

router.get('/sources', c.sources);
router.get('/sources/:id', c.source);
router.post('/sources', c.addSource);
router.post('/sources/:id/decide', A.reviewer, c.decideSource);
router.post('/sources/:id/retire', c.retireSource);
router.get('/search', c.search);

router.get('/drafts', c.drafts);
router.post('/drafts', c.create);
router.get('/drafts/:id', c.draft);
router.put('/drafts/:id', c.edit);
router.post('/drafts/:id/submit', c.submit);
router.post('/drafts/:id/decide', c.decide);
router.post('/drafts/:id/withdraw', c.withdraw);
router.post('/drafts/:id/publish', c.publish);

router.get('/audit', c.audit);
router.get('/report', A.adminOnly, c.report);
router.get('/fee-checks', A.adminOnly, c.feeChecks);
router.post('/fee-checks/:key/checked', A.adminOnly, c.feeChecked);

module.exports = router;
