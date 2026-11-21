const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const S = require('../utils/analytics/service');
const C = require('../controllers/analyticsController');

router.use(authenticate, authorize('admin', 'teacher'));
const read = S.onRead; const adm = S.onAdmin; const wide = S.onWide;

router.get('/access', read, C.access);
router.get('/catalog', read, C.catalog);
router.get('/overview', read, C.overview);
router.get('/measures/:key', read, C.measure);

router.get('/definitions', wide, C.definitions);
router.post('/definitions', wide, C.createCustom);
router.put('/definitions/:key', wide, C.proposeDefinition);
router.post('/definitions/:key/decide', wide, C.decideDefinition);
router.post('/definitions/:key/retire', wide, C.retire);

router.get('/progress', read, C.progress);
router.get('/ageing', adm, C.ageing);
router.get('/funnel', adm, C.funnel);
router.get('/health', wide, C.health);

router.get('/runs', read, C.runs);
router.post('/runs', read, C.saveRun);
router.get('/runs/:id', read, C.run);
router.get('/runs/:id/file/:fmt(csv|pdf)', read, C.runFile);

router.get('/schedules', wide, C.schedules);
router.post('/schedules', wide, C.createSchedule);
router.patch('/schedules/:id', wide, C.updateSchedule);
router.post('/schedules/:id/run', wide, C.runSchedule);
router.post('/sweep', wide, C.sweep);

router.get('/people', adm, C.people);
router.get('/jobs', read, C.jobs);
router.post('/jobs', adm, C.createJob);
router.post('/jobs/:id/done', read, C.doneJob);
router.post('/jobs/:id/drop', adm, C.dropJob);
router.post('/jobs/:id/reassign', adm, C.reassignJob);

router.get('/pulse/me', C.pulseMe);
router.post('/pulse/join', C.pulseJoin);
router.post('/pulse/leave', C.pulseLeave);
router.put('/pulse/entry', C.pulseEntry);
router.get('/pulse/report', wide, C.pulseReport);

module.exports = router;
