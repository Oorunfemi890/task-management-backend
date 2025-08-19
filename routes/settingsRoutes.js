const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');



// Settings routes
router.get('/settings', settingsController.getUserSettings);
router.put('/settings', settingsController.updateUserSettings);
router.put('/settings/notifications', settingsController.updateNotificationSettings);
router.put('/settings/appearance', settingsController.updateAppearanceSettings);
router.put('/settings/privacy', settingsController.updatePrivacySettings);
router.get('/settings/export', settingsController.exportUserData);
router.delete('/settings/delete-account', settingsController.deleteUserAccount);
router.delete('/settings/delete-all-data', settingsController.deleteAllUserData);


module.exports = router;