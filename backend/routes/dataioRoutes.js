const express = require('express');
const multer = require('multer');
const router = express.Router();
const c = require('../controllers/dataioController');
const { authenticate, authorize } = require('../middleware/auth');
const { MAX_BYTES } = require('../utils/dataio/workbook');

// The upload is held in memory for one request and never written to disk, so a large file costs
// the server nothing once the reply has gone out.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname || '')
      || /spreadsheetml|excel/i.test(file.mimetype || '');
    if (!ok) return cb(Object.assign(new Error('Upload the .xlsx file you filled in.'), { status: 400 }));
    cb(null, true);
  },
});

router.use(authenticate, authorize('admin'));

router.get('/modules', c.modules);

// the whole school in one workbook; the writing goes back through the per-module endpoints
router.get('/whole-school/plan', c.wholePlan);
router.get('/whole-school/template', c.wholeTemplate);
router.post('/whole-school/preview', upload.single('file'), c.wholePreview);
router.get('/:module/template', c.template);
router.get('/:module/export', c.export);
router.post('/:module/preview', upload.single('file'), c.preview);
router.post('/:module/commit', c.commit);

// multer's own refusals, said in words a person can act on
router.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: `The file is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Split it into a few smaller files.` });
  if (err.status) return res.status(err.status).json({ message: err.message });
  return res.status(400).json({ message: 'That file could not be read.' });
});

module.exports = router;
