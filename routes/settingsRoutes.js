// routes/settingsRoutes.js (FIXED)
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth'); // Import authentication middleware

// ALL settings routes require authentication
router.use(authenticate);

// Settings routes (all now properly protected)
router.get('/settings', settingsController.getUserSettings);
router.put('/settings', settingsController.updateUserSettings);
router.put('/settings/notifications', settingsController.updateNotificationSettings);
router.put('/settings/appearance', settingsController.updateAppearanceSettings);
router.put('/settings/privacy', settingsController.updatePrivacySettings);
router.get('/settings/export', settingsController.exportUserData);
router.delete('/settings/delete-account', settingsController.deleteUserAccount);
router.delete('/settings/delete-all-data', settingsController.deleteAllUserData);

module.exports = router;