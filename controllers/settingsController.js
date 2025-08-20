// controllers/settingsController.js (FIXED)
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Helper function to get user ID from JWT token
const getUserIdFromToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'taskflow-app',
      audience: 'taskflow-users'
    });

    return decoded.userId;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

const settingsController = {
  // Get user settings
  getUserSettings: async (req, res) => {
    try {
      // Use proper JWT authentication instead of dummy token
      const userId = getUserIdFromToken(req.headers.authorization);

      const result = await pool.query(`
        SELECT * FROM user_settings WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        // Create default settings if none exist FOR THIS SPECIFIC USER
        const defaultSettings = {
          notifications: {
            email: {
              taskAssigned: true,
              taskCompleted: true,
              projectUpdates: true,
              deadlineReminders: true,
              weeklyDigest: false
            },
            push: {
              taskAssigned: true,
              taskCompleted: false,
              projectUpdates: true,
              deadlineReminders: true
            },
            inApp: {
              taskAssigned: true,
              taskCompleted: true,
              projectUpdates: true,
              deadlineReminders: true,
              mentions: true
            }
          },
          preferences: {
            theme: 'light',
            language: 'en',
            timezone: 'UTC',
            dateFormat: 'MM/DD/YYYY',
            startOfWeek: 'monday',
            defaultView: 'board'
          },
          privacy: {
            profileVisibility: 'team',
            activityVisibility: 'team',
            taskVisibility: 'assigned',
            allowMentions: true,
            showOnlineStatus: true
          }
        };

        const insertResult = await pool.query(`
          INSERT INTO user_settings (user_id, settings, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          RETURNING *
        `, [userId, JSON.stringify(defaultSettings)]);

        return res.json(insertResult.rows[0]);
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching user settings:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update user settings
  updateUserSettings: async (req, res) => {
    try {
      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      const { settings } = req.body;

      if (!settings) {
        return res.status(400).json({ error: 'Settings data is required' });
      }

      // Update or insert settings FOR THIS SPECIFIC USER
      const result = await pool.query(`
        INSERT INTO user_settings (user_id, settings, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET 
          settings = $2,
          updated_at = NOW()
        RETURNING *
      `, [userId, JSON.stringify(settings)]);

      res.json({
        message: 'Settings updated successfully',
        settings: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating user settings:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update notification settings
  updateNotificationSettings: async (req, res) => {
    try {
      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      const { notifications } = req.body;

      // Get current settings FOR THIS SPECIFIC USER
      const currentResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      let currentSettings = {};
      if (currentResult.rows.length > 0) {
        currentSettings = currentResult.rows[0].settings;
      }

      // Update notifications in settings
      currentSettings.notifications = notifications;

      // Save updated settings FOR THIS SPECIFIC USER
      const result = await pool.query(`
        INSERT INTO user_settings (user_id, settings, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET 
          settings = $2,
          updated_at = NOW()
        RETURNING *
      `, [userId, JSON.stringify(currentSettings)]);

      res.json({
        message: 'Notification settings updated successfully',
        settings: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating notification settings:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update appearance settings
  updateAppearanceSettings: async (req, res) => {
    try {
      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      const { preferences } = req.body;

      // Get current settings FOR THIS SPECIFIC USER
      const currentResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      let currentSettings = {};
      if (currentResult.rows.length > 0) {
        currentSettings = currentResult.rows[0].settings;
      }

      // Update preferences in settings
      currentSettings.preferences = { ...currentSettings.preferences, ...preferences };

      // Save updated settings FOR THIS SPECIFIC USER
      const result = await pool.query(`
        INSERT INTO user_settings (user_id, settings, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET 
          settings = $2,
          updated_at = NOW()
        RETURNING *
      `, [userId, JSON.stringify(currentSettings)]);

      res.json({
        message: 'Appearance settings updated successfully',
        settings: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating appearance settings:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update privacy settings
  updatePrivacySettings: async (req, res) => {
    try {
      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      const { privacy } = req.body;

      // Get current settings FOR THIS SPECIFIC USER
      const currentResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      let currentSettings = {};
      if (currentResult.rows.length > 0) {
        currentSettings = currentResult.rows[0].settings;
      }

      // Update privacy in settings
      currentSettings.privacy = { ...currentSettings.privacy, ...privacy };

      // Save updated settings FOR THIS SPECIFIC USER
      const result = await pool.query(`
        INSERT INTO user_settings (user_id, settings, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET 
          settings = $2,
          updated_at = NOW()
        RETURNING *
      `, [userId, JSON.stringify(currentSettings)]);

      res.json({
        message: 'Privacy settings updated successfully',
        settings: result.rows[0]
      });
    } catch (err) {
      console.error('Error updating privacy settings:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Export user data
  exportUserData: async (req, res) => {
    try {
      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      // Get user profile FOR THIS SPECIFIC USER
      const userResult = await pool.query(`
        SELECT id, name, email, avatar, phone, company, location, bio, title, 
               timezone, role, created_at
        FROM users WHERE id = $1
      `, [userId]);

      // Get user tasks FOR THIS SPECIFIC USER
      const tasksResult = await pool.query(`
        SELECT * FROM tasks WHERE assignee = $1
      `, [userId]);

      // Get user settings FOR THIS SPECIFIC USER
      const settingsResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      // Get user comments FOR THIS SPECIFIC USER
      const commentsResult = await pool.query(`
        SELECT c.*, t.title as task_title
        FROM comments c
        LEFT JOIN tasks t ON c.task_id = t.id
        WHERE c.user_id = $1
      `, [userId]);

      const exportData = {
        user: userResult.rows[0] || null,
        tasks: tasksResult.rows,
        settings: settingsResult.rows[0]?.settings || null,
        comments: commentsResult.rows,
        exportDate: new Date().toISOString(),
        exportedBy: 'TaskFlow Export System'
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="taskflow-data-${userId}-${Date.now()}.json"`);
      res.json(exportData);
    } catch (err) {
      console.error('Error exporting user data:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete user account (soft delete)
  deleteUserAccount: async (req, res) => {
    try {
      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      const { confirmPassword } = req.body;

      if (!confirmPassword) {
        return res.status(400).json({
          error: 'Password confirmation required',
          message: 'Please enter your password to confirm account deletion.'
        });
      }

      // Verify password FOR THIS SPECIFIC USER
      const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const bcrypt = require('bcrypt');
      const isPasswordValid = await bcrypt.compare(confirmPassword, userResult.rows[0].password);

      if (!isPasswordValid) {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password is incorrect.'
        });
      }

      // Soft delete - mark as deleted FOR THIS SPECIFIC USER
      await pool.query(`
        UPDATE users 
        SET deleted_at = NOW(), 
            email = email || '_deleted_' || id,
            updated_at = NOW()
        WHERE id = $1
      `, [userId]);

      res.json({ message: 'Account deleted successfully' });
    } catch (err) {
      console.error('Error deleting user account:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete all user data (hard delete)
  deleteAllUserData: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Use proper JWT authentication
      const userId = getUserIdFromToken(req.headers.authorization);

      const { confirmPassword } = req.body;

      if (!confirmPassword) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Password confirmation required',
          message: 'Please enter your password to confirm data deletion.'
        });
      }

      // Verify password FOR THIS SPECIFIC USER
      const userResult = await client.query('SELECT password FROM users WHERE id = $1', [userId]);

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const bcrypt = require('bcrypt');
      const isPasswordValid = await bcrypt.compare(confirmPassword, userResult.rows[0].password);

      if (!isPasswordValid) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Invalid password',
          message: 'Password is incorrect.'
        });
      }

      // Delete user data FOR THIS SPECIFIC USER in correct order to avoid foreign key constraints
      await client.query('DELETE FROM comments WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM task_activity WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM project_members WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
      await client.query('UPDATE tasks SET assignee = NULL WHERE assignee = $1', [userId]);
      await client.query('UPDATE projects SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');

      res.json({ message: 'All user data deleted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error deleting all user data:', err);

      if (err.message === 'No token provided' || err.message === 'Invalid or expired token') {
        return res.status(401).json({ error: err.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  }
};

module.exports = settingsController;