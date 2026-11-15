const express = require('express');
const router = express.Router();
const c = require('../controllers/backupController').forAdmin;
const { authenticate, authorize } = require('../middleware/auth');

// School admin: manage and download their own school's backups
router.use(authenticate, authorize('admin'));
router.get('/', c.list);
router.post('/', c.create);
router.get('/download', c.download);
router.get('/:bid/download', c.downloadSnapshot);
router.delete('/:bid', c.remove);

module.exports = router;
