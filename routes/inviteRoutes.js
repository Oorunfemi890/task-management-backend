// routes/inviteRoutes.js
const express = require('express');
const router = express.Router();
const inviteController = require('../controllers/inviteController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { inviteRateLimit } = require('../middleware/rateLimiter');

// Apply authentication to all routes
router.use(requireAuth);

// Send invitations (with rate limiting)
router.post('/send', inviteRateLimit, inviteController.sendInvitations);

// Generate invite link
router.post('/generate-link', requireRole(['admin', 'manager']), inviteController.generateInviteLink);

// Get available roles for current user
router.get('/roles', inviteController.getAvailableRoles);

// Get user's sent invitations
router.get('/my-invitations', inviteController.getMyInvitations);

// Revoke invitation
router.delete('/:id', inviteController.revokeInvitation);

// Public routes (no auth required)
router.get('/details/:token', inviteController.getInvitationDetails);
router.post('/accept/:token', inviteController.acceptInvitation);

module.exports = router;