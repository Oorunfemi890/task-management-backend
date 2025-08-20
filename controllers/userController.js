// controllers/userController.js
const pool = require('../config/database');
const bcrypt = require("bcrypt");
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { generateToken } = require('../middleware/auth');

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const userController = {
  // Get current user (protected route)
  getCurrentUser: async (req, res) => {
    try {
      // User info is already available from authenticate middleware
      const userId = req.user.id;

      const result = await pool.query(`
        SELECT id, name, email, avatar, phone, company, location, bio, title, 
               timezone, role, created_at as "joinedAt"
        FROM users 
        WHERE id = $1 AND deleted_at IS NULL
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User account no longer exists.'
        });
      }

      res.json({
        user: result.rows[0]
      });
    } catch (err) {
      console.error('Error getting current user:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Unable to fetch user information.'
      });
    }
  },

  // Login user with JWT
  loginUser: async (req, res) => {
    try {
      const { email, password } = req.body;

      console.log('Login attempt for email:', email);

      // 1. Check if user exists
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Invalid email or password.'
        });
      }

      const user = result.rows[0];

      // 2. Check if password exists
      if (!user.password) {
        return res.status(401).json({
          error: 'Account setup required',
          message: 'Account needs password setup. Please contact administrator.'
        });
      }

      // 3. Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Invalid email or password.'
        });
      }

      // 4. Generate JWT token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role || 'member'
      });

      // 5. Update last login time
      await pool.query(
        'UPDATE users SET updated_at = NOW() WHERE id = $1',
        [user.id]
      );

      console.log('Login successful for user:', user.id);

      // 6. Return user data with token
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          phone: user.phone,
          company: user.company,
          location: user.location,
          bio: user.bio,
          title: user.title,
          timezone: user.timezone,
          role: user.role || 'member',
          joinedAt: user.created_at
        }
      });
    } catch (err) {
      console.error('Error logging in user:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Login service temporarily unavailable.'
      });
    }
  },

  // Register user with JWT
  registerUser: async (req, res) => {
    try {
      console.log('Registration request body:', req.body);

      const { name, email, password, company, role } = req.body;

      // 1. Check if email already exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase().trim()]
      );

      if (existingUser.rows.length > 0) {
        console.log('Email already exists:', email);
        return res.status(400).json({
          error: 'Email already exists',
          message: 'An account with this email address already exists. Please use a different email or try logging in.'
        });
      }

      // 2. Generate avatar from name initials
      const avatar = name.split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2);

      // 3. Hash the password
      const hashedPassword = await bcrypt.hash(password, 12);

      // 4. Insert user
      const result = await pool.query(`
        INSERT INTO users (name, email, avatar, password, company, role, timezone, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'UTC', NOW(), NOW())
        RETURNING id, name, email, avatar, company, role, created_at
      `, [name.trim(), email.toLowerCase().trim(), avatar, hashedPassword, company || null, role || 'member']);

      const newUser = result.rows[0];

      // 5. Generate JWT token
      const token = generateToken({
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role || 'member'
      });

      console.log('User registered successfully:', newUser.id);

      // 6. Return user data with token
      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          avatar: newUser.avatar,
          company: newUser.company,
          role: newUser.role,
          joinedAt: newUser.created_at
        }
      });
    } catch (err) {
      console.error('Error creating user:', err);
      if (err.code === '23505') {
        res.status(400).json({
          error: 'Email already exists',
          message: 'An account with this email address already exists. Please use a different email or try logging in.'
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Registration service temporarily unavailable.'
        });
      }
    }
  },

  // Update user profile (protected route)
  updateProfile: async (req, res) => {
    try {
      const userId = req.user.id;

      const {
        name,
        email,
        phone,
        company,
        location,
        bio,
        title,
        timezone
      } = req.body;

      // Check if email is already taken by another user
      if (email) {
        const emailCheck = await pool.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
          [email.toLowerCase().trim(), userId]
        );

        if (emailCheck.rows.length > 0) {
          return res.status(400).json({
            error: 'Email already exists',
            message: 'This email is already being used by another account.'
          });
        }
      }

      const result = await pool.query(`
        UPDATE users 
        SET name = COALESCE($1, name),
            email = COALESCE($2, email),
            phone = $3,
            company = $4,
            location = $5,
            bio = $6,
            title = $7,
            timezone = COALESCE($8, timezone),
            updated_at = NOW()
        WHERE id = $9 AND deleted_at IS NULL
        RETURNING id, name, email, avatar, phone, company, location, bio, title, 
                 timezone, role, created_at as "joinedAt"
      `, [
        name?.trim(),
        email?.toLowerCase().trim(),
        phone,
        company,
        location,
        bio,
        title,
        timezone,
        userId
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User account no longer exists.'
        });
      }

      res.json({
        message: 'Profile updated successfully',
        user: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating profile:', err);
      if (err.code === '23505') {
        res.status(400).json({
          error: 'Email already exists',
          message: 'This email is already being used by another account.'
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Profile update service temporarily unavailable.'
        });
      }
    }
  },

  // Change password (protected route)
  changePassword: async (req, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Current password and new password are required.'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'New password must be at least 8 characters long.'
        });
      }

      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password must contain uppercase, lowercase, and number.'
        });
      }

      // Get current user data
      const userResult = await pool.query(
        'SELECT password FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User account no longer exists.'
        });
      }

      const user = userResult.rows[0];

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Current password is incorrect.'
        });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await pool.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
        [hashedNewPassword, userId]
      );

      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      console.error('Error changing password:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Password change service temporarily unavailable.'
      });
    }
  },

  // Forgot password - send reset email
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Email required',
          message: 'Email address is required.'
        });
      }

      // Check if user exists
      const userResult = await pool.query(
        'SELECT id, name FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase().trim()]
      );

      if (userResult.rows.length === 0) {
        // Don't reveal if email exists or not for security
        return res.json({
          message: 'If an account with this email exists, a password reset link has been sent.'
        });
      }

      const user = userResult.rows[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Store token in database
      await pool.query(`
        UPDATE users 
        SET reset_token = $1, reset_token_expiry = $2, updated_at = NOW()
        WHERE id = $3
      `, [resetToken, resetTokenExpiry, user.id]);

      // Send email (if configured)
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

        const mailOptions = {
          from: process.env.EMAIL_FROM || 'noreply@taskflow.com',
          to: email,
          subject: 'Password Reset - TaskFlow',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Password Reset Request</h2>
              <p>Hello ${user.name},</p>
              <p>You requested to reset your password for your TaskFlow account.</p>
              <p>Please click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #666;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request this password reset, please ignore this email.</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
      }

      res.json({
        message: 'If an account with this email exists, a password reset link has been sent.'
      });
    } catch (err) {
      console.error('Error sending password reset email:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Password reset service temporarily unavailable.'
      });
    }
  },

  // Reset password with token
  resetPassword: async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Token and new password are required.'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password must be at least 8 characters long.'
        });
      }

      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password must contain uppercase, lowercase, and number.'
        });
      }

      // Find user with valid token
      const userResult = await pool.query(`
        SELECT id FROM users 
        WHERE reset_token = $1 AND reset_token_expiry > NOW() AND deleted_at IS NULL
      `, [token]);

      if (userResult.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid or expired token',
          message: 'The password reset link is invalid or has expired.'
        });
      }

      const userId = userResult.rows[0].id;

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset token
      await pool.query(`
        UPDATE users 
        SET password = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW()
        WHERE id = $2
      `, [hashedPassword, userId]);

      res.json({ message: 'Password reset successfully' });
    } catch (err) {
      console.error('Error resetting password:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Password reset service temporarily unavailable.'
      });
    }
  },

  // Get all users (protected route)
  getAllUsers: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, name, email, avatar, role, created_at 
        FROM users 
        WHERE deleted_at IS NULL
        ORDER BY name
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Unable to fetch users.'
      });
    }
  },

  // Get user by ID (protected route)
  getUserById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT id, name, email, avatar, phone, company, location, bio, title, 
               timezone, role, created_at
        FROM users 
        WHERE id = $1 AND deleted_at IS NULL
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User does not exist or has been deleted.'
        });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Unable to fetch user information.'
      });
    }
  },

  // Create new user (admin only)
  createUser: async (req, res) => {
    // This is now just registerUser for backward compatibility
    return userController.registerUser(req, res);
  },

  // Update user (protected route)
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, avatar, phone, company, location, bio, title, timezone, role } = req.body;

      // Check if email is already taken by another user
      if (email) {
        const emailCheck = await pool.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
          [email.toLowerCase().trim(), id]
        );

        if (emailCheck.rows.length > 0) {
          return res.status(400).json({
            error: 'Email already exists',
            message: 'This email is already being used by another account.'
          });
        }
      }

      const result = await pool.query(`
        UPDATE users 
        SET name = COALESCE($1, name),
            email = COALESCE($2, email), 
            avatar = COALESCE($3, avatar),
            phone = $4,
            company = $5,
            location = $6,
            bio = $7,
            title = $8,
            timezone = COALESCE($9, timezone),
            role = COALESCE($10, role),
            updated_at = NOW()
        WHERE id = $11 AND deleted_at IS NULL
        RETURNING id, name, email, avatar, phone, company, location, bio, title, 
                 timezone, role, created_at
      `, [
        name?.trim(),
        email?.toLowerCase().trim(),
        avatar,
        phone,
        company,
        location,
        bio,
        title,
        timezone,
        role,
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User does not exist or has been deleted.'
        });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error updating user:', err);
      if (err.code === '23505') {
        res.status(400).json({
          error: 'Email already exists',
          message: 'This email is already being used by another account.'
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: 'User update service temporarily unavailable.'
        });
      }
    }
  },

  // Delete user (soft delete - protected route)
  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(`
        UPDATE users 
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User does not exist or has already been deleted.'
        });
      }

      res.status(204).send();
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: 'User deletion service temporarily unavailable.'
      });
    }
  }
};

module.exports = userController;