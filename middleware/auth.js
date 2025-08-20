// middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// JWT Secret - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '12h';

// Generate JWT Token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
    issuer: 'taskflow-app',
    audience: 'taskflow-users'
  });
};

// Verify JWT Token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'taskflow-app',
      audience: 'taskflow-users'
    });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided. Please log in to access this resource.'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token format.'
      });
    }

    try {
      const decoded = verifyToken(token);

      // Check if user still exists in database
      const userResult = await pool.query(
        'SELECT id, name, email, avatar, role, deleted_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          error: 'User not found',
          message: 'User account no longer exists.'
        });
      }

      const user = userResult.rows[0];

      // Check if user account is deleted
      if (user.deleted_at) {
        return res.status(401).json({
          error: 'Account suspended',
          message: 'User account has been deactivated.'
        });
      }

      // Add user info to request
      req.user = {
        id: user.id,
        userId: user.id, // For backward compatibility
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role || 'member'
      };

      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Your session has expired. Please log in again.',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'Authentication token is invalid.',
          code: 'INVALID_TOKEN'
        });
      }

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Unable to authenticate user.',
        code: 'AUTH_FAILED'
      });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication service temporarily unavailable.'
    });
  }
};

// Optional authentication (for routes that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = verifyToken(token);

      const userResult = await pool.query(
        'SELECT id, name, email, avatar, role, deleted_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0 || userResult.rows[0].deleted_at) {
        req.user = null;
      } else {
        const user = userResult.rows[0];
        req.user = {
          id: user.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role || 'member'
        };
      }
    } catch (jwtError) {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    req.user = null;
    next();
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access forbidden',
        message: 'You do not have permission to access this resource.'
      });
    }

    next();
  };
};

// Refresh token functionality
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Refresh token is required.'
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      // Verify the current token (even if expired)
      const decoded = jwt.verify(token, JWT_SECRET, {
        ignoreExpiration: true,
        issuer: 'taskflow-app',
        audience: 'taskflow-users'
      });

      // Check if user still exists
      const userResult = await pool.query(
        'SELECT id, name, email, avatar, role, deleted_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          error: 'User not found',
          message: 'User account no longer exists.'
        });
      }

      const user = userResult.rows[0];

      if (user.deleted_at) {
        return res.status(401).json({
          error: 'Account suspended',
          message: 'User account has been deactivated.'
        });
      }

      // Generate new token
      const newToken = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role || 'member'
      });

      res.json({
        message: 'Token refreshed successfully',
        token: newToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role || 'member'
        }
      });
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Unable to refresh token. Please log in again.'
      });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Token refresh service temporarily unavailable.'
    });
  }
};

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  optionalAuth,
  authorize,
  refreshToken,
  JWT_SECRET,
  JWT_EXPIRE
};