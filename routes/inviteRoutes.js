// ===========================================
const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const { authenticate, authorize } = require('../middleware/auth'); // Fixed import
const { inviteRateLimit } = require('../middleware/rateLimiter');

// Public routes (no auth required) - MUST BE FIRST
router.get('/details/:token', inviteController.getInvitationDetails);
router.post('/accept/:token', inviteController.acceptInvitation);

// Apply authentication to all routes below this point
router.use(authenticate);

// Send invitations (with rate limiting)
router.post('/send', inviteRateLimit, inviteController.sendInvitations);

// Generate invite link
router.post('/generate-link', authorize('admin', 'manager'), inviteController.generateInviteLink);

// Get available roles for current user
router.get('/roles', inviteController.getAvailableRoles);

// Get user's sent invitations
router.get('/my-invitations', inviteController.getMyInvitations);

// Revoke invitation
router.delete('/:id', inviteController.revokeInvitation);

module.exports = router;