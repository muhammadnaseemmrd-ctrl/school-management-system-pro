const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const { authenticate, authorize } = require('../middleware/auth');

// Get All Classes
router.get('/', authenticate, authorize('admin', 'teacher'), classController.getAllClasses);

// Get Class by ID
router.get('/:id', authenticate, authorize('admin', 'teacher'), classController.getClassById);

// Create Class
router.post('/', authenticate, authorize('admin'), classController.createClass);
router.post('/bulk-setup', authenticate, authorize('admin'), classController.bulkSetupClasses);

// Update Class
router.put('/:id', authenticate, authorize('admin'), classController.updateClass);

// Assign / remove the head master (one per class)
router.put('/:id/head-master', authenticate, authorize('admin'), classController.setHeadMaster);

// Delete Standard (All divisions)
router.delete('/standard/:standardName', authenticate, authorize('admin'), classController.deleteStandard);

// Delete Class
router.delete('/:id', authenticate, authorize('admin'), classController.deleteClass);

// Get Class Students
router.get('/:id/students', authenticate, authorize('admin', 'teacher'), classController.getClassStudents);

module.exports = router;
