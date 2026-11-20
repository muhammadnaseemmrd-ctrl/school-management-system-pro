const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { featureGate } = require('../utils/plans');
const K = require('../controllers/themeController');
const L = require('../controllers/i18nController');

const admin = authorize('admin'); const any = authorize('admin', 'teacher', 'student', 'parent');
router.use(authenticate);
router.get('/current', any, K.current);
router.get('/', admin, K.overview); router.post('/check', admin, K.check);
router.post('/draft', admin, K.createDraft); router.put('/draft', admin, K.saveDraft); router.delete('/draft', admin, K.discardDraft); router.post('/draft/publish', admin, K.publish);
router.post('/versions/:id/rollback', admin, K.rollback);
router.get('/domains', admin, K.domains); router.post('/domains', admin, featureGate('whiteLabel'), K.addDomain); router.post('/domains/:id/verify', admin, K.verifyDomain); router.post('/domains/:id/activate', admin, K.activateDomain); router.delete('/domains/:id', admin, K.removeDomain);
// wording
router.get('/i18n/overrides', any, L.overrides); router.post('/i18n/missing', any, L.reportMissing);
router.get('/i18n', admin, L.manage); router.put('/i18n/overrides', admin, L.putOverride); router.delete('/i18n/overrides/:id', admin, L.deleteOverride); router.post('/i18n/missing/:id/dismiss', admin, L.dismissMissing);
module.exports = router;
