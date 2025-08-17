// routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

// Get all projects
router.get('/', projectController.getAllProjects);

// Get project by ID
router.get('/:id', projectController.getProjectById);

// Create new project
router.post('/', projectController.createProject);

// Update project
router.put('/:id', projectController.updateProject);

// Delete project
router.delete('/:id', projectController.deleteProject);

// Get project tasks
router.get('/:id/tasks', projectController.getProjectTasks);

// Get project statistics
router.get('/:id/stats', projectController.getProjectStats);

module.exports = router;