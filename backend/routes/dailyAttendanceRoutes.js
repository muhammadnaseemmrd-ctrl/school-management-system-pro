const express = require('express');
const router = express.Router();
const c = require('../controllers/dailyAttendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// Head master: my class, then the class sheet for a date
router.get('/my-class', authenticate, authorize('teacher'), c.getMyClass);
router.get('/class/:classId', authenticate, authorize('teacher', 'admin'), c.getClassSheet);
router.post('/class/:classId', authenticate, authorize('teacher', 'admin'), c.saveClassSheet);

// Admin: today at a glance, one student's records, single-day correction
router.get('/overview', authenticate, authorize('admin'), c.getOverview);
router.get('/student/:studentId', authenticate, authorize('admin'), c.getStudentRecords);
router.put('/student-day', authenticate, authorize('admin'), c.adminSetStudentDay);

// Student: own attendance
router.get('/student/my/report', authenticate, authorize('student'), c.getMyReport);

module.exports = router;
