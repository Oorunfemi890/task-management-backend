const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // Import the helper for IPv6 safety

// Helper function for per-user or IP-based key generation
const userOrIpKey = (req) => {
  // If user is authenticated, rate-limit by their user ID; otherwise, fallback to IP
  return req.user?.id ? `user_${req.user.id}` : ipKeyGenerator(req);
};

// Rate limiting for invitations
const inviteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each user or IP to 10 invites per window
  keyGenerator: userOrIpKey, // ✅ Safely handle IPv4 & IPv6
  message: {
    error: 'Too many invitations sent',
    message: 'You have exceeded the invitation limit. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admins during development
    return process.env.NODE_ENV === 'development' && req.user?.role === 'admin';
  },
});

// General API rate limiting
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  keyGenerator: ipKeyGenerator, // ✅ IPv6-safe
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  inviteRateLimit,
  apiRateLimit,
};
