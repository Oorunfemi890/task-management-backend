// routes/projectMessageRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true }); // Allow access to parent route params
const projectMessageController = require('../controllers/projectMessageController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get all messages for a project
router.get('/', projectMessageController.getProjectMessages);

// Send a text message
router.post('/', projectMessageController.sendMessage);

// Upload and send file/image message
router.post('/upload', projectMessageController.uploadAndSendFile);

// Edit a message
router.put('/:messageId', projectMessageController.editMessage);

// Delete a message
router.delete('/:messageId', projectMessageController.deleteMessage);

// Add reaction to a message
router.post('/:messageId/reactions', projectMessageController.addReaction);

// Archive old messages (admin only)
router.post('/archive', projectMessageController.archiveMessages);

// Get chat participants
router.get('/participants', projectMessageController.getChatParticipants);

// Mark messages as read
router.post('/read', projectMessageController.markMessagesAsRead);

// Search messages
router.get('/search', projectMessageController.searchMessages);

module.exports = router;