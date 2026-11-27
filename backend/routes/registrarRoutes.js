const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const CS = require('../utils/campus');
const C = require('../controllers/regCatalogController');
const St = require('../controllers/regStudentController');
const G = require('../controllers/regGradeController');

const admin = authorize('admin');
const staff = authorize('admin', 'teacher');
const student = authorize('student');
const anyone = authorize('admin', 'teacher', 'student');
// The registrar covers the whole school, so an administrator limited to one campus is kept out (PRD E01 scope).
const wide = async (req, res, next) => { try { if (await CS.scopeOf(req.user)) return res.status(403).json({ message: 'The registrar is school-wide. Ask a school-wide administrator.' }); next(); } catch (e) { next(e); } };
router.use(authenticate);
// a kind of institution that does not use this part is refused here, not merely in the menu
router.use(require('../middleware/institution').needsScreen('registrar'));

router.get('/overview', admin, wide, G.overview);
router.get('/settings', admin, wide, C.settings); router.put('/settings', admin, wide, C.saveSettings);

router.get('/courses', staff, C.courses); router.post('/courses', admin, wide, C.createCourse); router.patch('/courses/:id', admin, wide, C.updateCourse); router.post('/courses/:id/status', admin, wide, C.setCourseStatus);
router.get('/programs', staff, C.programs); router.post('/programs', admin, wide, C.createProgram); router.patch('/programs/:id', admin, wide, C.updateProgram); router.post('/programs/:id/versions', admin, wide, C.createVersion);
router.patch('/versions/:id', admin, wide, C.updateVersion); router.get('/versions/:id/checks', admin, wide, C.versionChecks); router.post('/versions/:id/submit', admin, wide, C.submitVersion); router.post('/versions/:id/decide', admin, wide, C.decideVersion); router.post('/versions/:id/retire', admin, wide, C.retireVersion);
router.get('/terms', staff, C.terms); router.post('/terms', admin, wide, C.createTerm); router.patch('/terms/:id', admin, wide, C.updateTerm); router.post('/terms/:id/:step', admin, wide, C.termStep);
router.get('/sections', staff, C.sections); router.post('/sections', admin, wide, C.createSection); router.patch('/sections/:id', admin, wide, C.updateSection); router.post('/sections/:id/cancel', admin, wide, C.cancelSection);
router.get('/teachers', admin, wide, C.teachers);

router.get('/people', admin, wide, St.people);
router.post('/students/:studentId/program', admin, wide, St.place); router.patch('/students/:studentId/advisor', admin, wide, St.setAdvisor);
router.get('/students/:studentId/record', staff, St.record); router.get('/students/:studentId/what-if', staff, St.whatIf);
router.get('/students/:studentId/catalog', staff, St.catalog); router.post('/students/:studentId/enroll', staff, St.enroll); router.post('/students/:studentId/enrollments/:id/drop', staff, St.drop);
router.get('/candidates', admin, wide, St.candidates); router.post('/students/:studentId/graduate', admin, wide, St.graduate);
router.post('/students/:studentId/transcripts', admin, wide, St.issueTranscript);
router.get('/transcripts/:id', anyone, St.transcript); router.get('/transcripts/:id/pdf', anyone, St.transcriptPdf); router.post('/transcripts/:id/revoke', admin, wide, St.revokeTranscript);

router.get('/sections/:id/roster', staff, G.roster); router.put('/sections/:id/grades', staff, G.saveGrades); router.post('/sections/:id/submit', staff, G.submitGrades); router.post('/sections/:id/reopen', admin, wide, G.reopenGrades);
router.get('/grade-changes', staff, G.changes); router.post('/grade-changes', staff, G.requestChange); router.post('/grade-changes/:id/decide', admin, wide, G.decideChange);
router.get('/appeals', staff, G.appeals); router.post('/appeals/:id/assign', admin, wide, G.assignAppeal); router.post('/appeals/:id/note', staff, G.appealNote); router.post('/appeals/:id/decide', admin, wide, G.decideAppeal);
router.get('/exceptions', staff, G.exceptions); router.post('/exceptions', staff, G.requestException); router.post('/exceptions/:id/decide', admin, wide, G.decideException); router.post('/exceptions/:id/withdraw', staff, G.withdrawException);

router.get('/my/sections', authorize('teacher'), G.mySections); router.get('/my/advisees', authorize('teacher'), G.myAdvisees);
router.get('/me', student, St.meRecord); router.get('/me/catalog', student, St.meCatalog); router.post('/me/enroll', student, St.meEnroll); router.post('/me/enrollments/:id/drop', student, St.meDrop);
router.post('/me/appeals', student, G.fileAppeal); router.post('/me/appeals/:id/withdraw', student, G.withdrawAppeal); router.post('/me/transcript-request', student, St.transcriptRequest);

module.exports = router;
