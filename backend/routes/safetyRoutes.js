const express = require('express');
const router = express.Router();
const gate = require('../controllers/safetyGateController');
const dis = require('../controllers/safetyDismissalController');
const drill = require('../controllers/safetyDrillController');
const field = require('../controllers/attendanceFieldController');
const { authenticate, authorize } = require('../middleware/auth');
const { can } = require('../utils/permissions');

// A gate reader signs in with its own key, like the attendance readers
router.post('/device/scan', field.deviceAuth, gate.deviceScan);

router.use(authenticate);
const office = authorize('admin'); const staff = authorize('admin', 'teacher'); const anyone = authorize('admin', 'teacher', 'parent', 'student');
// Gate duty belongs to administrators and to teachers an administrator has given a time-limited gate-duty grant
const onDuty = async (req, res, next) => { try { if ((await can(req.user, 'safety.gate.operate')).allowed) return next(); return res.status(403).json({ message: 'You are not on gate duty.' }); } catch (e) { return res.status(500).json({ message: e.message }); } };
const family = authorize('parent', 'student');

router.get('/settings', office, gate.getSettings); router.put('/settings', office, gate.putSettings);
router.get('/overview', onDuty, drill.overview);
router.get('/duty-staff', onDuty, gate.dutyStaff);

// Visitors: staff and parents ask, hosts approve, the desk admits
router.get('/visits', authorize('admin', 'teacher', 'parent'), gate.listVisits); router.post('/visits', authorize('admin', 'teacher', 'parent'), gate.createVisit);
router.get('/visits/:id', authorize('admin', 'teacher', 'parent'), gate.getVisit);
router.post('/visits/:id/decide', staff, gate.decideVisit); router.post('/visits/:id/invite', authorize('admin', 'teacher', 'parent'), gate.invite); router.post('/visits/:id/cancel', authorize('admin', 'teacher', 'parent'), gate.cancelVisit);
router.post('/visits/:id/check-in', onDuty, gate.checkIn); router.post('/visits/:id/check-out', onDuty, gate.checkOut); router.get('/visits/:id/badge', onDuty, gate.badge);
router.post('/scan/lookup', onDuty, gate.lookup);

// Contractors
router.get('/contractors', office, gate.listPasses); router.post('/contractors', office, gate.createPass);
router.post('/contractors/:id/decide', office, gate.decidePass); router.post('/contractors/:id/credential', office, gate.passCredential); router.post('/contractors/:id/revoke', office, gate.revokePass);
router.post('/contractors/:id/move', onDuty, gate.passMove);

// Gate log, guard logbook, handover
router.get('/gate-log', onDuty, gate.gateLog); router.post('/gate-log', onDuty, gate.manualEntry);
router.get('/logbook', onDuty, gate.listLogItems); router.post('/logbook', onDuty, gate.addLogItem); router.post('/logbook/:id/resolve', onDuty, gate.resolveLogItem);
router.get('/handovers', onDuty, gate.listHandovers); router.post('/handovers', onDuty, gate.startHandover); router.post('/handovers/:id/decide', onDuty, gate.decideHandover);

// Dismissal and pickup
router.get('/dismissal/classes', staff, dis.myClasses); router.get('/dismissal/search', staff, dis.search); router.get('/dismissal/roster', staff, dis.roster);
router.post('/dismissal/check', staff, dis.check); router.post('/dismissal/release', staff, dis.release);
router.post('/dismissal/exceptions', staff, dis.requestException); router.post('/dismissal/exceptions/:id/decide', office, dis.decideException);
router.post('/dismissal/override', office, dis.override); router.post('/dismissal/events/:id/review', office, dis.review);
router.get('/dismissal/events', staff, dis.listEvents); router.get('/dismissal/mine', family, dis.myEvents);
router.get('/dismissal/authorizations', authorize('admin', 'teacher', 'parent'), dis.listAuthorizations); router.post('/dismissal/authorizations', authorize('admin', 'parent'), dis.createAuthorization);
router.post('/dismissal/authorizations/:id/revoke', authorize('admin', 'parent'), dis.revokeAuthorization);

// Drills and emergency assembly
router.get('/drills', office, drill.list); router.get('/drills/current', staff, drill.current); router.post('/drills', office, drill.start);
router.get('/drills/:id', office, drill.get); router.get('/drills/:id/roster', staff, drill.classRoster); router.post('/drills/:id/muster', staff, drill.muster);
router.post('/drills/:id/others/:lineId', onDuty, drill.markOther); router.post('/drills/:id/notify-families', office, drill.notifyFamilies); router.get('/drills/:id/fallback', office, drill.fallback);
router.post('/drills/:id/close', office, drill.close); router.post('/drills/:id/sign', office, drill.sign);
router.post('/drills/:id/actions', office, drill.addAction); router.post('/drills/:id/actions/:index/done', office, drill.completeAction);

module.exports = router;
