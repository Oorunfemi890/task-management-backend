// routes/userRoutes.js (UPDATED - Fixed settings routes integration)
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const settingsController = require('../controllers/settingsController'); // FIXED: Use the corrected controller
const { authenticate, authorize, refreshToken } = require('../middleware/auth');
const { validateUser, validateUserUpdate, validateLogin } = require('../middleware/validation');

// PUBLIC ROUTES (No authentication required)
// Authentication routes
router.post('/login', validateLogin, userController.loginUser);
router.post('/register', validateUser, userController.registerUser);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// Token refresh route
router.post('/refresh-token', refreshToken);

// PROTECTED ROUTES (Authentication required)
// Current user routes
router.get('/me', authenticate, userController.getCurrentUser);
router.put('/profile', authenticate, userController.updateProfile);
router.put('/change-password', authenticate, userController.changePassword);

// Settings routes (all protected) - FIXED: Now using the corrected controller
router.get('/settings', authenticate, settingsController.getUserSettings);
router.put('/settings', authenticate, settingsController.updateUserSettings);
router.put('/settings/notifications', authenticate, settingsController.updateNotificationSettings);
router.put('/settings/appearance', authenticate, settingsController.updateAppearanceSettings);
router.put('/settings/privacy', authenticate, settingsController.updatePrivacySettings);
router.get('/settings/export', authenticate, settingsController.exportUserData);
router.delete('/settings/delete-account', authenticate, settingsController.deleteUserAccount);
router.delete('/settings/delete-all-data', authenticate, settingsController.deleteAllUserData);

// ADMIN/MANAGER ROUTES (Role-based access)
// User management routes (admin/manager only)
router.get('/', authenticate, authorize('admin', 'manager'), userController.getAllUsers);
router.get('/:id', authenticate, userController.getUserById);
router.put('/:id', authenticate, authorize('admin'), validateUserUpdate, userController.updateUser);
router.delete('/:id', authenticate, authorize('admin'), userController.deleteUser);

module.exports = router;