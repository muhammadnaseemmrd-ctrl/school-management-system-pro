const express = require('express');
const router = express.Router();
const feeController = require('../controllers/feeController');
const center = require('../controllers/feeCenterController');
const { authenticate, authorize } = require('../middleware/auth');
const { featureGate } = require('../utils/plans');

// Whole module is a plan feature ("fees"); transport has its own switch
router.use(authenticate, featureGate('fees'));
const transport = featureGate('transport');

/* ── Tuition plans (admin) ── */
router.get('/structures', feeController.getFeeStructures);
router.post('/structures', authorize('admin'), feeController.setFeeStructure);
router.delete('/structures/:standard', authorize('admin'), feeController.deleteFeeStructure);
router.get('/students/:standard', authorize('admin', 'teacher'), feeController.getStudentFeesByStandard);
router.put('/students/:studentFeeId/toggle', authorize('admin'), feeController.toggleQuarterPaymentStatus);

// Student: read own tuition record (read-only – paying is done by sending a screenshot)
router.get('/my-fee', authorize('student'), feeController.getStudentOwnFee);

/* ── Payment proofs: students/parents SUBMIT, only the school admin decides ── */
router.get('/summary', authorize('student'), center.getSummary);                       // student: own
router.get('/summary/:studentId', authorize('admin', 'student', 'parent'), center.getSummary);
router.post('/proofs', authorize('student', 'parent'), center.submitProof);
router.get('/proofs', authorize('admin'), center.listProofs);
router.put('/proofs/:id/review', authorize('admin'), center.reviewProof);

/* ── Other fees: uniform, books, admission, exam... (admin) ── */
router.get('/overview', authorize('admin'), center.overview);
router.get('/charges', authorize('admin'), center.listCharges);
router.post('/charges', authorize('admin'), center.createCharges);
router.put('/charges/:id/mark', authorize('admin'), center.markCharge);
router.delete('/charges/:id', authorize('admin'), center.deleteCharge);

/* ── Transport (admin) ── */
router.get('/transport/routes', authorize('admin'), transport, center.listRoutes);
router.post('/transport/routes', authorize('admin'), transport, center.saveRoute);
router.put('/transport/routes/:id', authorize('admin'), transport, center.saveRoute);
router.delete('/transport/routes/:id', authorize('admin'), transport, center.deleteRoute);
router.get('/transport/assignments', authorize('admin'), transport, center.listAssignments);
router.post('/transport/assign', authorize('admin'), transport, center.assignTransport);
router.post('/transport/generate', authorize('admin'), transport, center.generateTransport);

module.exports = router;
