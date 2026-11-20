const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const K = require('../controllers/careCaseController');
const H = require('../controllers/careHealthController');
const U = require('../controllers/careSupportController');
const P = require('../controllers/carePrivacyController');

const staff = authorize('admin', 'teacher'); const admin = authorize('admin'); const fam = authorize('parent', 'student'); const parent = authorize('parent'); const all = authorize('admin', 'teacher', 'parent', 'student');
router.use(authenticate);

router.get('/me', all, K.me);
router.get('/settings', staff, K.getSettings); router.put('/settings', admin, K.putSettings);
router.get('/overview', staff, K.overview); router.get('/students', staff, K.students); router.get('/staff', staff, K.myStaffList);

// cases and break-glass
router.get('/cases', staff, K.listCases); router.post('/cases', staff, K.openCase);
router.get('/cases/:id', staff, K.getCase); router.patch('/cases/:id', staff, K.updateCase); router.post('/cases/:id/status', staff, K.setStatus);
router.post('/cases/:id/notes', staff, K.addNote); router.post('/cases/:id/actions', staff, K.addAction); router.post('/cases/:id/actions/:aid', staff, K.setAction);
router.post('/cases/:id/referrals', staff, K.addReferral); router.post('/cases/:id/referrals/:rid', staff, K.setReferral);
router.post('/cases/:id/circle', staff, K.addCircle); router.delete('/cases/:id/circle/:pid', staff, K.removeCircle);
router.post('/cases/:id/close', staff, K.closeCase); router.post('/cases/:id/close/approve', staff, K.approveClose); router.post('/cases/:id/reopen', staff, K.reopenCase);
router.post('/cases/:id/access-request', staff, K.requestAccess);
router.get('/access-requests', staff, K.listAccess); router.get('/access-requests/mine', staff, K.myAccess); router.post('/access-requests/:id/decide', staff, K.decideAccess); router.post('/access-requests/:id/revoke', staff, K.revokeAccess);
router.get('/access-log', staff, K.accessLog);

// concerns
router.post('/reports', all, K.submitReport); router.get('/reports/status', all, K.reportStatus);
router.get('/reports', staff, K.listReports); router.get('/reports/:id', staff, K.getReport); router.post('/reports/:id/reply', staff, K.replyReport);
router.post('/reports/:id/dismiss', staff, K.dismissReport); router.post('/reports/:id/convert', staff, K.convertReport);

// health
router.get('/health/summary', staff, H.summary); router.get('/health/alerts', staff, H.alerts); router.get('/health/proposals', staff, H.proposals);
router.get('/health/plan/:studentId', staff, H.getPlan); router.put('/health/plan/:studentId', staff, H.putPlan);
router.post('/health/plan/:studentId/medications', staff, H.addMed); router.put('/health/plan/:studentId/medications/:mid', staff, H.setMed);
router.post('/health/plan/:studentId/proposal', staff, H.decideProposal);
router.get('/health/medication/today', staff, H.today); router.post('/health/medication/log', staff, H.logDose); router.get('/health/medication/log', staff, H.doseLog);
router.get('/health/incidents', staff, H.incidents); router.post('/health/incidents', staff, H.addIncident);
router.get('/family/health', fam, H.family); router.post('/family/health/proposal', parent, H.propose); router.post('/family/medication-consent', parent, H.consent);
router.get('/family/support', fam, U.familySupport);

// special needs and support
router.get('/accommodations', staff, U.listAccommodations); router.post('/accommodations', staff, U.proposeAccommodation);
router.post('/accommodations/:id/decide', staff, U.decideAccommodation); router.post('/accommodations/:id/end', staff, U.endAccommodation);
router.get('/accommodations/class/:classId', staff, U.forClass); router.get('/class/:classId', staff, U.classView);
router.get('/goals', all, U.listGoals); router.post('/goals', authorize('admin', 'teacher', 'student'), U.addGoal); router.post('/goals/:id/review', authorize('admin', 'teacher', 'student'), U.reviewGoal);
router.get('/appointments', all, U.listAppointments); router.post('/appointments', all, U.requestAppointment); router.post('/appointments/:id/schedule', staff, U.scheduleAppointment); router.post('/appointments/:id/status', all, U.setAppointment);
router.get('/mentors', all, U.listMentors); router.post('/mentors', staff, U.addMentor); router.post('/mentors/:id/meeting', staff, U.mentorMeeting); router.post('/mentors/:id/end', staff, U.endMentor);
router.get('/careers/pathways', all, U.pathways); router.get('/careers/:studentId', all, U.getCareer); router.put('/careers/:studentId', authorize('admin', 'teacher', 'student'), U.putCareer);
router.get('/training', staff, U.trainingRegister); router.post('/training', staff, U.addTraining);

// privacy
router.get('/privacy', all, P.list); router.post('/privacy', fam, P.create); router.post('/privacy/:id/decide', staff, P.decide); router.get('/privacy/:id/export', all, P.exportData);

module.exports = router;
