const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { can } = require('../utils/permissions');
const T = require('../controllers/studioController');
const I = require('../controllers/studioIssueController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const up = (field) => (req, res, next) => upload.single(field)(req, res, (err) => (err ? res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 2 MB.' : 'The file could not be read.' }) : next()));
// A permission is a role default or a time-limited grant (E01). Teachers and families have none unless an administrator grants one.
const need = (...actions) => async (req, res, next) => {
  try { for (const a of actions) if ((await can(req.user, a)).allowed) return next(); return res.status(403).json({ message: 'You do not have permission for this.' }); }
  catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};
const manage = need('documents.template.manage'); const issue = need('documents.issue'); const print = need('documents.print');
const anyStudio = need('documents.template.manage', 'documents.issue', 'documents.print');
const family = authorize('student', 'parent');

router.use(authenticate);
// Students and parents see only their own issued documents
router.get('/my/documents', family, I.mine); router.get('/my/documents/:id/pdf', family, I.minePdf);

router.get('/catalog', anyStudio, T.catalog); router.get('/overview', anyStudio, T.overview);
router.post('/validate', manage, T.check);

router.get('/templates', anyStudio, T.listTemplates); router.post('/templates', manage, T.createTemplate);
router.post('/templates/import', manage, up('file'), T.importPackage);
router.get('/templates/:id', anyStudio, T.getTemplate); router.post('/templates/:id/duplicate', manage, T.duplicate); router.post('/templates/:id/archive', manage, T.archive);
router.post('/templates/:id/versions', manage, T.newDraft);
router.get('/templates/:id/versions/:vid', anyStudio, T.getVersion); router.put('/templates/:id/versions/:vid', manage, T.saveDraft); router.delete('/templates/:id/versions/:vid', manage, T.discardDraft);
router.post('/templates/:id/versions/:vid/submit', manage, T.submit); router.post('/templates/:id/versions/:vid/approve', manage, T.approve); router.post('/templates/:id/versions/:vid/reject', manage, T.reject);
router.get('/templates/:id/versions/:vid/proof', need('documents.template.manage', 'documents.issue'), T.proof); router.get('/templates/:id/versions/:vid/export', manage, T.exportPackage);

router.get('/assets', anyStudio, T.listAssets); router.post('/assets', manage, up('file'), T.addAsset);
router.put('/assets/:id/license', manage, T.updateAssetLicense); router.post('/assets/:id/verify', manage, T.verifyAsset); router.post('/assets/:id/retire', manage, T.retireAsset);

router.get('/subjects', need('documents.issue', 'documents.template.manage'), T.subjects);
// what a school can hand one person, reached from that person's own record
router.get('/person/:kind/:id', need('documents.issue', 'documents.print', 'documents.template.manage'), I.forPerson);
router.post('/issue', issue, I.issue); router.get('/issuances', anyStudio, I.list); router.get('/issuances/:id', anyStudio, I.get);
router.get('/issuances/:id/pdf', need('documents.issue', 'documents.print'), I.pdf); router.get('/issuances/:id/snapshot', need('documents.issue', 'documents.print'), I.snapshot);
router.post('/issuances/:id/revoke', issue, I.revoke); router.post('/issuances/:id/replace', issue, I.replace);

router.get('/batches', print, I.listBatches); router.post('/batches', print, I.createBatch); router.get('/batches/:id', print, I.getBatch);
router.get('/batches/:id/pdf', print, I.batchPdf); router.post('/batches/:id/start', print, I.startBatch); router.post('/batches/:id/results', print, I.batchResults);
router.post('/batches/:id/retry', print, I.retryBatch); router.post('/batches/:id/items/:itemId/cancel', print, I.cancelItem); router.post('/batches/:id/cancel', print, I.cancelBatch);
module.exports = router;
