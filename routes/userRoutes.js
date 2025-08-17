// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { validateUser, validateUserUpdate, validateLogin } = require('../middleware/validation');

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Get current user (for auth/me endpoint) - MUST be before /:id
router.get('/me', userController.getCurrentUser);

// Login user
router.post('/login', validateLogin, userController.loginUser);

// Create new user (register)
router.post('/register', validateUser, userController.createUser);

// Get all users
router.get('/', userController.getAllUsers);

// Get user by ID (MUST be after /me route)
router.get('/:id', userController.getUserById);

// Update user
router.put('/:id', validateUserUpdate, userController.updateUser);

// Delete user
router.delete('/:id', userController.deleteUser);

module.exports = router;