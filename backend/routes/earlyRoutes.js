const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const R = require('../controllers/earlyRoomController');
const K = require('../controllers/earlyCareController');
const L = require('../controllers/earlyLearnController');
const P = require('../controllers/earlyPickupController');

const staff = authorize('admin', 'teacher'); const admin = authorize('admin'); const family = authorize('parent'); const anyone = authorize('admin', 'teacher', 'parent');
router.use(authenticate);
// a kind of institution that does not use this part is refused here, not merely in the menu
router.use(require('../middleware/institution').needsScreen('earlyYears'));

// settings and rooms
router.get('/settings', staff, R.getSettings); router.put('/settings', admin, R.putSettings);
router.get('/overview', staff, R.overview);
router.get('/rooms', staff, R.listRooms); router.post('/rooms', admin, R.createRoom); router.get('/rooms/:id', staff, R.getRoom);
router.put('/rooms/:id', admin, R.updateRoom); router.post('/rooms/:id/archive', admin, R.archiveRoom); router.post('/rooms/:id/children', admin, R.addChildren);
router.get('/children/search', staff, R.searchChildren); router.delete('/children/:id/placement', admin, R.removeChild);
router.get('/rooms/:id/safety-card', staff, K.safetyCard); router.get('/rooms/:id/coverage', staff, L.coverage);

// carers, ratios, arrival and departure
router.post('/rooms/:id/presence/in', staff, R.presenceIn); router.post('/rooms/:id/presence/out', staff, R.presenceOut);
router.get('/ratios', staff, R.ratios); router.get('/ratio-events', staff, R.ratioEvents); router.post('/ratio-events/:id/ack', staff, R.ackRatio);
router.get('/children/:id/collectors', staff, R.collectors); router.post('/check-in', staff, R.checkIn); router.post('/check-out', staff, R.checkOut); router.post('/absent', staff, R.markAbsent);

// care log
router.post('/care/bulk', staff, K.bulk); router.get('/care', staff, K.listCare); router.get('/children/:id/timeline', staff, K.timeline);
router.post('/care/:id/correct', staff, K.correct); router.post('/care/:id/void', staff, K.voidEntry); router.post('/care/:id/discussed', staff, K.discussed);

// safety profile and consent
router.get('/children/:id/profile', staff, K.getProfile); router.put('/children/:id/profile', staff, K.putProfile); router.post('/children/:id/profile/pending/:pid', staff, K.decidePending);
router.put('/children/:id/consent', staff, K.putConsent);

// photos
router.post('/media', staff, K.uploadMedia); router.get('/media', staff, K.listMedia); router.get('/media/:id/image', anyone, K.imageOf); router.delete('/media/:id', staff, K.deleteMedia);

// diary and portfolio
router.get('/posts', staff, K.listPosts); router.post('/posts', staff, K.createPost); router.post('/posts/generate', staff, K.generate); router.get('/posts/:id', staff, K.getPost); router.put('/posts/:id', staff, K.updatePost);
router.post('/posts/:id/submit', staff, K.submitPost); router.post('/posts/:id/review', staff, K.reviewPost); router.post('/posts/:id/retract', staff, K.retractPost);

// milestones and observations
router.get('/frameworks', staff, L.listFrameworks); router.get('/frameworks/:id', staff, L.getFramework); router.post('/frameworks/:id/copy', staff, L.copyFramework); router.put('/frameworks/:id', staff, L.updateFramework);
router.post('/frameworks/:id/publish', admin, L.publishFramework); router.post('/frameworks/:id/archive', admin, L.archiveFramework);
router.post('/observations', staff, L.observe); router.post('/observations/:id/void', staff, L.voidObs); router.get('/children/:id/progress', staff, L.progress);

// activity library, plans, routines, practice, printable sheets
router.get('/activities', staff, L.listActivities); router.post('/activities', staff, L.createActivity); router.post('/activities/copy', staff, L.copyActivity); router.get('/activities/:ref', staff, L.getActivity);
router.put('/activities/:id', staff, L.updateActivity); router.post('/activities/:id/publish', staff, L.publishActivity); router.post('/activities/:id/archive', staff, L.archiveActivity);
router.put('/activities/:id/audio', staff, L.putAudio); router.get('/activities/:id/audio', anyone, L.getAudio);
router.get('/plans', staff, L.listPlans); router.post('/plans', staff, L.createPlan); router.put('/plans/:id', staff, L.updatePlan); router.post('/plans/:id/done', staff, L.donePlan); router.post('/plans/:id/skip', staff, L.skipPlan);
router.get('/icons', staff, L.icons); router.get('/routines', staff, L.listRoutines); router.post('/routines', staff, L.saveRoutine); router.put('/routines/:id', staff, L.saveRoutine); router.delete('/routines/:id', staff, L.deleteRoutine);
router.post('/practice', staff, L.addPractice); router.get('/children/:id/practice', staff, L.listPractice);
router.get('/worksheets/tracing', staff, L.tracingSheet); router.get('/worksheets/observation', staff, L.observationSheet);

// pickup-person changes (staff side)
router.get('/pickup-changes', staff, P.list); router.post('/pickup-changes', staff, P.staffRequest); router.post('/pickup-changes/:id/verify', staff, P.verify); router.post('/pickup-changes/:id/apply', staff, P.apply); router.post('/pickup-changes/:id/decline', staff, P.decline);

// family
router.get('/family/children', family, K.familyChildren); router.get('/family/children/:id/feed', family, K.familyFeed); router.post('/family/posts/:id/read', family, K.familyRead);
router.get('/family/children/:id/profile', family, K.familyProfile); router.post('/family/children/:id/profile', family, K.familyPropose);
router.get('/family/children/:id/consent', family, K.familyConsent); router.put('/family/children/:id/consent', family, K.familySetConsent); router.get('/family/children/:id/routine', family, K.familyRoutine);
router.get('/family/children/:id/pickup', family, P.familyPeople); router.post('/family/children/:id/pickup', family, P.familyRequest); router.post('/family/pickup/:id/cancel', family, P.familyCancel);
module.exports = router;
