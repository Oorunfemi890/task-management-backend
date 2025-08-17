// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { validateUser, validateUserUpdate, validateLogin } = require('../middleware/validation');

// Get all users
router.get('/', userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);
// Login user
router.post('/login', validateLogin, userController.loginUser);

// Create new user
router.post('/register', validateUser, userController.createUser);

// Update user
router.put('/:id', validateUserUpdate, userController.updateUser);

// Delete user
router.delete('/:id', userController.deleteUser);

module.exports = router;