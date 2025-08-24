// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

// All notification routes require authentication
router.use(authenticate);

// Get user notifications
router.get('/', notificationController.getUserNotifications);

// Get notification statistics
router.get('/stats', notificationController.getNotificationStats);

// Get notification preferences
router.get('/preferences', notificationController.getNotificationPreferences);

// Update notification preferences
router.put('/preferences', notificationController.updateNotificationPreferences);

// Mark notification as read
router.put('/:notificationId/read', (req, res, next) => {
  console.log(`[DEBUG] Hitting markAsRead route for ID: ${req.params.notificationId}`);
  next();
}, notificationController.markAsRead);

// Mark all notifications as read
router.put('/read-all', notificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', notificationController.deleteNotification);

// Delete all read notifications
router.delete('/read-all', notificationController.deleteAllRead);

module.exports = router;