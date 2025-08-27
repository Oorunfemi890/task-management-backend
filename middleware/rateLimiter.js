// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Rate limiting for invitations
const inviteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each user to 10 invites per windowMs
  message: {
    error: 'Too many invitations sent',
    message: 'You have exceeded the invitation limit. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user ID
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for admins in development
    return process.env.NODE_ENV === 'development' && req.user?.role === 'admin';
  }
});

// General API rate limiting
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  inviteRateLimit,
  apiRateLimit
};