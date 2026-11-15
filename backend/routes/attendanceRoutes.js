const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// Attendance is now taken once a day by the class head master: see /api/daily-attendance

// ─── Admin: Student full profile (att + fees + marks) ──────────
router.get('/admin/student/:studentId', authenticate, authorize('admin'), attendanceController.getAdminStudentProfile);

// ─── Legacy routes (kept for compatibility) ─────────────────────
router.post('/mark', authenticate, authorize('admin'), attendanceController.markAttendance);
router.post('/mark-class', authenticate, authorize('admin'), attendanceController.markClassAttendance);
router.get('/user/:userId', authenticate, attendanceController.getUserAttendance);
router.get('/class/report', authenticate, authorize('admin', 'teacher'), attendanceController.getClassAttendanceReport);

module.exports = router;
