const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { driverLimiter } = require('../middleware/rateLimit');
const S = require('../utils/transport/service');
const C = require('../controllers/transportController');
const CS = require('../utils/campus');

/* ── the driver's page: no school sign-in, the driver's own key ── */
router.get('/driver/me', driverLimiter, S.driverAuth, C.driverMe);
router.get('/driver/trips/:id', driverLimiter, S.driverAuth, C.driverTrip);
router.post('/driver/trips/:id/op', driverLimiter, S.driverAuth, C.driverOp);
router.post('/driver/sync', driverLimiter, S.driverAuth, C.driverSync);

router.use(authenticate);

/* ── families: a parent for a linked child, a student for themselves ── */
const family = authorize('parent', 'student');
router.get('/me/children', family, C.myChildren);
router.get('/me', family, C.myView); router.get('/me/live', family, C.myLive);
router.post('/me/skip', family, C.mySkip); router.delete('/me/skip/:id', family, C.myUnskip); router.post('/me/concern', family, C.myConcern);

/* ── staff ── */
const admin = authorize('admin');
const wide = async (req, res, next) => { try { if (req.user.role === 'admin' && await CS.scopeOf(req.user)) return res.status(403).json({ message: 'Transport is school-wide. Ask a school-wide administrator.' }); next(); } catch (e) { next(e); } };
router.use(authorize('admin', 'teacher'), wide);
router.get('/access', C.access);

// the dispatcher's day
const D = S.onDispatch; const M = S.onManage;
router.get('/overview', D, C.overview);
router.get('/trips', D, C.trips); router.post('/trips/generate', D, C.generate); router.get('/trips/:id', D, C.trip);
router.post('/trips/:id/op', D, C.op); router.post('/trips/:id/cancel', D, C.cancelTrip); router.post('/trips/:id/reassign', D, C.reassign); router.post('/trips/:id/add-rider', D, C.addRider);
router.get('/exceptions', D, C.exceptions); router.post('/exceptions/:id/resolve', D, C.resolveException);
router.get('/incidents', D, C.incidents); router.post('/incidents', D, C.reportIncident); router.post('/incidents/:id', D, C.updateIncident);
router.get('/vehicles', D, C.vehicles); router.get('/drivers', D, C.drivers); router.get('/routes', D, C.routes); router.get('/riders', D, C.riders); router.get('/students', D, C.students);
router.get('/reports/:name', D, C.report);

// planning, fleet and inspections
router.post('/vehicles', M, C.createVehicle); router.patch('/vehicles/:id', M, C.updateVehicle);
router.post('/drivers', M, C.createDriver); router.patch('/drivers/:id', M, C.updateDriver); router.post('/drivers/:id/key', M, C.driverKey);
router.post('/routes', M, C.createRoute); router.put('/routes/:id/stops', M, C.saveStops); router.put('/plans', M, C.savePlan);
router.post('/riders/assign', M, C.assignRiders); router.patch('/riders/:studentId', M, C.updateRider); router.delete('/riders/:studentId', M, C.removeRider);
router.get('/inspections', M, C.inspections); router.post('/inspections', M, C.createInspection);
router.get('/settings', M, C.settings); router.put('/settings', admin, C.saveSettings);
router.post('/sweep', admin, C.sweepNow);

module.exports = router;
