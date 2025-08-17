// routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { validateTask, validateTaskUpdate } = require('../middleware/validation');

// Get all tasks
router.get('/', taskController.getAllTasks);

// Get task by ID
router.get('/:id', taskController.getTaskById);

// Create new task
router.post('/', validateTask, taskController.createTask);

// Update task
router.put('/:id', validateTaskUpdate, taskController.updateTask);

// Delete task
router.delete('/:id', taskController.deleteTask);

// Get tasks by status (for analytics)
router.get('/by-status/:status', taskController.getTasksByStatus);

// Get tasks by assignee
router.get('/by-assignee/:assignee', taskController.getTasksByAssignee);

module.exports = router;