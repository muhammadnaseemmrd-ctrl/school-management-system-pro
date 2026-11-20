const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const M = require('../controllers/commsController');
const H = require('../controllers/commsHelpController');
const P = require('../controllers/commsPtmController');

const staff = authorize('admin', 'teacher'); const admin = authorize('admin'); const family = authorize('parent'); const anyone = authorize('admin', 'teacher', 'parent');
router.use(authenticate);

router.get('/settings', staff, M.getSettings); router.put('/settings', admin, M.putSettings);
router.get('/prefs', anyone, M.getPrefs); router.put('/prefs', anyone, M.putPrefs);
router.get('/overview', anyone, M.overview); router.post('/sweep', admin, M.runSweep);

// messages
router.get('/family/children', family, M.myChildren); router.get('/contacts', family, M.contacts); router.get('/students', staff, M.students);
router.get('/threads', anyone, M.listThreads); router.post('/threads', anyone, M.startThread);
router.get('/threads/:id', anyone, M.getThread); router.post('/threads/:id/messages', anyone, M.sendMessage); router.post('/threads/:id/read', anyone, M.readThread);
router.post('/threads/:id/close', anyone, M.closeThread); router.post('/threads/:id/reopen', anyone, M.reopenThread);
router.post('/threads/:id/messages/:mid/remove', admin, M.removeMessage); router.get('/threads/:id/deliveries', admin, M.deliveries);

// helpdesk
router.get('/tickets', authorize('admin', 'parent'), H.list); router.post('/tickets', family, H.create);
router.get('/tickets/:id', authorize('admin', 'parent'), H.get); router.post('/tickets/:id/comments', authorize('admin', 'parent'), H.comment); router.post('/tickets/:id/status', authorize('admin', 'parent'), H.setStatus);
router.post('/tickets/:id/assign', admin, H.assign); router.post('/tickets/:id/priority', admin, H.setPriority); router.post('/tickets/:id/rate', family, H.rate);
router.get('/canned', admin, H.canned); router.post('/canned', admin, H.cannedSave); router.put('/canned/:id', admin, H.cannedSave); router.delete('/canned/:id', admin, H.cannedDelete);
router.get('/helpdesk/report', admin, H.report); router.get('/helpdesk/admins', admin, H.admins);

// meetings
router.get('/ptm/family', family, P.familyList); router.get('/ptm/family/:id/slots', family, P.familySlots);
router.post('/ptm/slots/:sid/book', family, P.book); router.post('/ptm/slots/:sid/cancel', anyone, P.cancel);
router.post('/ptm/slots/:sid/block', staff, P.block); router.post('/ptm/slots/:sid/unblock', staff, P.block);
router.post('/ptm/slots/:sid/done', staff, P.done); router.post('/ptm/slots/:sid/noshow', staff, P.noshow);
router.get('/ptm', staff, P.list); router.post('/ptm', admin, P.create);
router.get('/ptm/:id', staff, P.get); router.put('/ptm/:id', admin, P.update); router.get('/ptm/:id/slots', staff, P.slots);
router.post('/ptm/:id/publish', admin, P.publish); router.post('/ptm/:id/close', admin, P.close); router.post('/ptm/:id/cancel', admin, P.cancelDay);
router.get('/ptm/:id/unbooked', admin, P.unbooked); router.post('/ptm/:id/nudge', admin, P.nudge);

module.exports = router;
