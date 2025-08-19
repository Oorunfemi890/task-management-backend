// controllers/settingsController.js
const pool = require('../config/database');

const settingsController = {
  // Get user settings
  getUserSettings: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1; // Replace with proper JWT

      const result = await pool.query(`
        SELECT * FROM user_settings WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        // Create default settings if none exist
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update user settings
  updateUserSettings: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      const { settings } = req.body;

      if (!settings) {
        return res.status(400).json({ error: 'Settings data is required' });
      }

      // Update or insert settings
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update notification settings
  updateNotificationSettings: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      const { notifications } = req.body;

      // Get current settings
      const currentResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      let currentSettings = {};
      if (currentResult.rows.length > 0) {
        currentSettings = currentResult.rows[0].settings;
      }

      // Update notifications in settings
      currentSettings.notifications = notifications;

      // Save updated settings
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update appearance settings
  updateAppearanceSettings: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      const { preferences } = req.body;

      // Get current settings
      const currentResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      let currentSettings = {};
      if (currentResult.rows.length > 0) {
        currentSettings = currentResult.rows[0].settings;
      }

      // Update preferences in settings
      currentSettings.preferences = { ...currentSettings.preferences, ...preferences };

      // Save updated settings
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update privacy settings
  updatePrivacySettings: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      const { privacy } = req.body;

      // Get current settings
      const currentResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      let currentSettings = {};
      if (currentResult.rows.length > 0) {
        currentSettings = currentResult.rows[0].settings;
      }

      // Update privacy in settings
      currentSettings.privacy = { ...currentSettings.privacy, ...privacy };

      // Save updated settings
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Export user data
  exportUserData: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      // Get user profile
      const userResult = await pool.query(`
        SELECT id, name, email, avatar, phone, company, location, bio, title, 
               timezone, role, created_at
        FROM users WHERE id = $1
      `, [userId]);

      // Get user tasks
      const tasksResult = await pool.query(`
        SELECT * FROM tasks WHERE assignee = $1
      `, [userId]);

      // Get user settings
      const settingsResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [userId]);

      // Get user comments
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete user account (soft delete)
  deleteUserAccount: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      const { confirmPassword } = req.body;

      if (!confirmPassword) {
        return res.status(400).json({ 
          error: 'Password confirmation required',
          message: 'Please enter your password to confirm account deletion.'
        });
      }

      // Verify password
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

      // Soft delete - mark as deleted instead of actually deleting
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
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete all user data (hard delete)
  deleteAllUserData: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const userId = token.includes('dummy-token') ? 1 : 1;

      const { confirmPassword } = req.body;

      if (!confirmPassword) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Password confirmation required',
          message: 'Please enter your password to confirm data deletion.'
        });
      }

      // Verify password
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

      // Delete user data in correct order to avoid foreign key constraints
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
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  }
};

module.exports = settingsController;