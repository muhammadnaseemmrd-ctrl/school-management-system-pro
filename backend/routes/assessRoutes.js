const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const B = require('../controllers/assessBankController');
const Q = require('../controllers/assessQuizController');
const T = require('../controllers/assessTakeController');
const M = require('../controllers/assessGradeController');

const staff = authorize('admin', 'teacher'); const student = authorize('student'); const family = authorize('parent'); const admin = authorize('admin');
router.use(authenticate);

// question bank and rubrics
router.get('/bank/meta', staff, B.meta); router.get('/bank/export', staff, B.exportItems); router.post('/bank/import', staff, B.importItems); router.post('/bank/notation', staff, B.notationPreview);
router.get('/bank', staff, B.list); router.post('/bank', staff, B.create);
router.get('/bank/:id', staff, B.get); router.put('/bank/:id', staff, B.update); router.delete('/bank/:id', staff, B.remove);
router.post('/bank/:id/activate', staff, B.activate); router.post('/bank/:id/retire', staff, B.retire); router.post('/bank/:id/share', staff, B.share); router.post('/bank/:id/duplicate', staff, B.duplicate);
router.get('/rubrics', staff, B.rubrics); router.post('/rubrics', staff, B.createRubric); router.put('/rubrics/:id', staff, B.updateRubric); router.post('/rubrics/:id/archive', staff, B.archiveRubric);

// student and family (before the :id routes so "take" is not read as an id)
router.get('/take/available', student, T.available); router.get('/take/results', student, T.results); router.get('/take/family', family, T.family);
router.post('/take/:id/start', student, T.start);
router.get('/take/attempts/:id', student, T.get); router.put('/take/attempts/:id/save', student, T.save); router.post('/take/attempts/:id/submit', student, T.submit);
router.get('/take/attempts/:id/result', student, T.result); router.post('/take/attempts/:id/appeal', student, T.appeal);

// marking, appeals, access
router.get('/grading/queue', staff, M.queue); router.get('/grading/attempts/:id', staff, M.grader); router.post('/grading/attempts/:id/items/:ref/mark', staff, M.mark);
router.post('/grading/attempts/:id/incidents', staff, M.incident); router.post('/grading/attempts/:id/void', admin, M.voidAttempt);
router.get('/appeals', staff, M.appeals); router.post('/appeals/:id/decide', staff, M.decideAppeal);
router.get('/access', staff, M.accessList); router.post('/access', staff, M.accessCreate); router.post('/access/:id/decide', admin, M.accessDecide); router.post('/access/:id/revoke', admin, M.accessRevoke);

// quizzes and exams
router.get('/quizzes', staff, Q.list); router.post('/quizzes', staff, Q.create);
router.get('/quizzes/:id', staff, Q.get); router.put('/quizzes/:id', staff, Q.update); router.delete('/quizzes/:id', staff, Q.remove);
router.post('/quizzes/:id/blueprint/preview', staff, Q.blueprintPreview); router.post('/quizzes/:id/blueprint/apply', staff, Q.blueprintApply);
router.post('/quizzes/:id/submit-review', staff, Q.submitReview); router.post('/quizzes/:id/publish', staff, Q.publish); router.post('/quizzes/:id/approve', admin, Q.approve); router.post('/quizzes/:id/reject', admin, Q.reject);
router.post('/quizzes/:id/close', staff, Q.close); router.post('/quizzes/:id/archive', staff, Q.archive); router.post('/quizzes/:id/extend', staff, Q.extend);
router.get('/quizzes/:id/paper', staff, Q.paper); router.post('/quizzes/:id/authorize-key', admin, Q.authorizeKey); router.get('/quizzes/:id/invigilator-code', staff, Q.invigilatorCode);
router.get('/quizzes/:id/roster', staff, Q.roster); router.post('/quizzes/:id/release', staff, Q.release); router.get('/quizzes/:id/analysis', staff, Q.analysis); router.post('/quizzes/:id/analysis/apply', staff, Q.applyAnalysis);
module.exports = router;
