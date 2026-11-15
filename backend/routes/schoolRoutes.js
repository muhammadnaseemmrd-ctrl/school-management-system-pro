const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const { authenticate, authorize } = require('../middleware/auth');
const { signupLimiter } = require('../middleware/rateLimit');

// Public self-service sign-up (Free plan, rate-limited)
router.post('/', signupLimiter, schoolController.createSchool);

// List all schools (Super Admin only – previously public)
router.get('/', authenticate, authorize('superadmin'), schoolController.getAllSchools);

// The school's current plan + enabled features (any signed-in school user)
router.get('/my-plan', authenticate, schoolController.getMyPlan);

// Get My School (For Admin)
router.get('/my', authenticate, authorize('admin'), schoolController.getMySchool);

// Get School Statistics
router.get('/stats', authenticate, authorize('admin'), schoolController.getSchoolStats);

// Get School by ID
router.get('/:id', authenticate, authorize('admin'), schoolController.getSchoolById);

// Update School
router.put('/:id', authenticate, authorize('admin'), schoolController.updateSchool);

module.exports = router;
