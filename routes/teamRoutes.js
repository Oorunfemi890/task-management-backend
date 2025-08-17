// routes/teamRoutes.js
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// Get all team members
router.get('/members', teamController.getAllMembers);

// Get team member by ID
router.get('/members/:id', teamController.getMemberById);

module.exports = router;