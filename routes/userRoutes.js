// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const settingsController = require('../controllers/settingsController');
const { validateUser, validateUserUpdate, validateLogin } = require('../middleware/validation');

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Get current user (for auth/me endpoint) - MUST be before /:id
router.get('/me', userController.getCurrentUser);

// Authentication routes
router.post('/login', validateLogin, userController.loginUser);
router.post('/register', validateUser, userController.createUser);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// Profile routes
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);

// Settings routes
router.get('/settings', settingsController.getUserSettings);
router.put('/settings', settingsController.updateUserSettings);
router.put('/settings/notifications', settingsController.updateNotificationSettings);
router.put('/settings/appearance', settingsController.updateAppearanceSettings);
router.put('/settings/privacy', settingsController.updatePrivacySettings);
router.get('/settings/export', settingsController.exportUserData);
router.delete('/settings/delete-account', settingsController.deleteUserAccount);
router.delete('/settings/delete-all-data', settingsController.deleteAllUserData);

// User management routes
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.put('/:id', validateUserUpdate, userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;