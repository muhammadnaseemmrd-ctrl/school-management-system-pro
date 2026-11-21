const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const C = require('../controllers/securityController');
const K = require('../utils/security/service');

// families: what was recorded about their child, and a way to challenge it
router.get('/my-signals', authenticate, authorize('student', 'parent'), C.mySignals);
router.get('/my-appeals', authenticate, authorize('student', 'parent'), C.myAppeals);
router.post('/my-appeals', authenticate, authorize('student', 'parent'), C.myAppeal);

router.use(authenticate, authorize('admin', 'teacher'));
router.get('/me', C.me);
const lead = K.guard('lead'); const dpo = K.guard('dpo'); const either = K.guard('lead', 'dpo'); const operate = K.guard('operate', 'lead', 'dpo');

router.get('/overview', operate, C.overview);
router.get('/pilots', operate, C.pilots); router.post('/pilots', lead, C.addPilot); router.put('/pilots/:id', lead, C.editPilot); router.post('/pilots/:id/ask', lead, C.askPilot);
router.post('/pilots/:id/approve', either, C.approvePilot); router.post('/pilots/:id/pause', either, C.pausePilot); router.post('/pilots/:id/resume', dpo, C.resumePilot); router.post('/pilots/:id/end', either, C.endPilot);
router.get('/devices', operate, C.devices); router.post('/devices', lead, C.addDevice); router.post('/devices/:id/rotate-key', lead, C.rotateKey); router.post('/devices/:id/status', lead, C.deviceStatus);
router.get('/events', operate, C.events); router.post('/events/:id/decide', operate, C.decideEvent);

router.get('/incidents', either, C.incidents); router.post('/incidents', either, C.addIncident); router.get('/incidents/:id', either, C.incident); router.get('/incidents/:id/access', either, C.access);
router.put('/incidents/:id/viewers', either, C.setViewers); router.post('/incidents/:id/items', either, C.addItem); router.post('/incidents/:id/close', either, C.closeIncident);
router.post('/incidents/:id/hold', either, C.hold); router.post('/incidents/:id/release', dpo, C.release); router.post('/incidents/:id/exports', either, C.askExport);
router.get('/exports', either, C.exportsList); router.post('/exports/:id/decide', either, C.decideExport); router.post('/exports/:id/fulfil', either, C.fulfilExport);
router.get('/appeals', either, C.appeals); router.post('/appeals', either, C.addAppeal); router.post('/appeals/:id/decide', either, C.decideAppeal);

module.exports = router;
