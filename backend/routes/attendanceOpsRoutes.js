const express = require('express');
const router = express.Router();
const ops = require('../controllers/attendanceOpsController');
const field = require('../controllers/attendanceFieldController');
const period = require('../controllers/attendancePeriodController');
const replayGuard = require('../middleware/replayGuard');
const { authenticate, authorize } = require('../middleware/auth');

// Readers and scanners sign in with their own device key, not a person's login
router.post('/device/heartbeat', field.deviceAuth, field.heartbeat);
router.post('/device/events', field.deviceAuth, field.deviceEvents);

router.use(authenticate);
const staff = authorize('admin', 'teacher'); const office = authorize('admin'); const family = authorize('parent', 'student');
const anyone = authorize('admin', 'teacher', 'parent', 'student');

// A parent or student: what was I told, and did I answer
router.get('/me/alerts', family, ops.myAlerts);
router.post('/me/alerts/:id/ack', family, ops.acknowledge);

router.get('/settings', office, ops.getSettings); router.put('/settings', office, ops.putSettings);
router.get('/overview', office, ops.overview);

router.get('/alerts', staff, ops.listAlerts); router.post('/alerts/dispatch', office, ops.dispatch);
router.get('/alerts/:id', staff, ops.getAlert); router.post('/alerts/:id/verify', staff, ops.verifyAlert); router.post('/alerts/:id/cancel', staff, ops.cancelAlert);

router.get('/leave', anyone, ops.listLeave); router.post('/leave', anyone, ops.requestLeave);
router.post('/leave/:id/decide', staff, ops.decideLeave); router.post('/leave/:id/cancel', anyone, ops.cancelLeave);

router.get('/corrections', anyone, ops.listCorrections); router.post('/corrections', anyone, ops.requestCorrection);
router.post('/corrections/:id/decide', staff, ops.decideCorrection);
router.get('/history/:studentId', staff, ops.history);

router.get('/cases', staff, ops.listCases); router.post('/cases/scan', office, ops.scanCases);
router.get('/cases/:id', staff, ops.getCase); router.post('/cases/:id/notes', staff, ops.addCaseNote); router.post('/cases/:id/status', staff, ops.setCaseStatus);

router.get('/anomalies', staff, ops.listAnomalies); router.post('/anomalies/scan', office, ops.scanAnomalies); router.post('/anomalies/:id/review', office, ops.reviewAnomaly);

router.get('/consent/:studentId', authorize('admin', 'parent', 'student'), ops.getConsent); router.put('/consent/:studentId', authorize('admin', 'parent', 'student'), ops.putConsent);

// Period register: every scheduled lesson, with queued offline saves applied once
router.get('/period/today', authorize('teacher'), period.today); router.get('/period/roster', staff, period.roster);
router.post('/period', staff, replayGuard, period.mark); router.get('/period/report', staff, period.report);

// Classroom check-in
router.get('/sessions', authorize('admin', 'teacher', 'student'), field.listSessions);
router.post('/sessions', staff, field.openSession);
router.post('/check-in', authorize('student'), field.checkIn);
router.get('/sessions/:id', staff, field.getSession); router.get('/sessions/:id/code', staff, field.sessionCode); router.post('/sessions/:id/close', staff, field.closeSession);
router.post('/sessions/:id/approve-clean', staff, field.approveClean); router.post('/sessions/:id/evidence/:eid/decide', staff, field.decideEvidence);

// Devices and gate evidence
router.get('/devices', office, field.listDevices); router.post('/devices', office, field.createDevice);
router.post('/devices/:id/rotate-key', office, field.rotateKey); router.post('/devices/:id/status', office, field.setDeviceStatus);
router.put('/badges/:studentId', office, field.setBadge); router.get('/gate', office, field.gateLog);

module.exports = router;
