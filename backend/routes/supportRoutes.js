const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const K = require('../controllers/supportController');
// Help from Aulensia: school administrators only (PRD E28)
router.use(authenticate, authorize('admin'));
router.get('/cases', K.schoolList); router.post('/cases', K.schoolOpen); router.get('/cases/:id', K.schoolGet);
router.post('/cases/:id/reply', K.schoolReply); router.post('/cases/:id/resolve', K.schoolResolve); router.post('/cases/:id/rate', K.schoolRate);
router.get('/invoices', K.schoolInvoices);
module.exports = router;
