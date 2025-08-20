// routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validateTask, validateTaskUpdate } = require('../middleware/validation');

// All task routes require authentication
router.use(authenticate);

// Get all tasks (accessible to all authenticated users)
router.get('/', taskController.getAllTasks);

// Get task by ID (accessible to all authenticated users)
router.get('/:id', taskController.getTaskById);

// Create new task (accessible to all authenticated users)
router.post('/', validateTask, taskController.createTask);

// Update task (accessible to all authenticated users, but with business logic restrictions in controller)
router.put('/:id', validateTaskUpdate, taskController.updateTask);

// Delete task (managers and admins only, or task creator)
router.delete('/:id', taskController.deleteTask);

// Get tasks by status (for analytics - accessible to all authenticated users)
router.get('/by-status/:status', taskController.getTasksByStatus);

// Get tasks by assignee (accessible to all authenticated users)
router.get('/by-assignee/:assignee', taskController.getTasksByAssignee);

module.exports = router;