// controllers/notificationController.js
const pool = require('../config/database');

const notificationController = {
  // Get all notifications for the current user
  getUserNotifications: async (req, res) => {
    try {
      const currentUser = req.user;
      const { page = 1, limit = 20, type, unreadOnly = false } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          n.*,
          p.name as project_name,
          t.title as task_title,
          pm.message as message_preview
        FROM notifications n
        LEFT JOIN projects p ON n.project_id = p.id
        LEFT JOIN tasks t ON n.task_id = t.id
        LEFT JOIN project_messages pm ON n.message_id = pm.id
        WHERE n.user_id = $1
      `;

      const queryParams = [currentUser.id];
      let paramCounter = 2;

      if (type && type !== 'all') {
        query += ` AND n.type = $${paramCounter}`;
        queryParams.push(type);
        paramCounter++;
      }

      if (unreadOnly === 'true') {
        query += ` AND n.read_at IS NULL`;
      }

      query += ` 
        ORDER BY 
          CASE WHEN n.priority = 'urgent' THEN 0 
               WHEN n.priority = 'high' THEN 1 
               WHEN n.priority = 'normal' THEN 2 
               ELSE 3 END,
          n.created_at DESC
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;
      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);

      // Get unread count
      const unreadResult = await pool.query(`
        SELECT COUNT(*) as unread_count
        FROM notifications 
        WHERE user_id = $1 AND read_at IS NULL
      `, [currentUser.id]);

      res.json({
        notifications: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rows.length,
          hasMore: result.rows.length === parseInt(limit)
        },
        unreadCount: parseInt(unreadResult.rows[0].unread_count)
      });
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Mark notification as read
  markAsRead: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const currentUser = req.user;

      const result = await pool.query(`
        UPDATE notifications 
        SET read_at = NOW() 
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL
        RETURNING *
      `, [notificationId, currentUser.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Notification not found',
          message: 'Notification does not exist or is already read'
        });
      }

      // Send real-time update
      if (req.io) {
        req.io.to(`user:${currentUser.id}`).emit('notification:marked_read', {
          notificationId: parseInt(notificationId)
        });
      }

      res.json({ message: 'Notification marked as read' });
    } catch (err) {
      console.error('Error marking notification as read:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Mark all notifications as read
  markAllAsRead: async (req, res) => {
    try {
      const currentUser = req.user;

      const result = await pool.query(`
        UPDATE notifications 
        SET read_at = NOW() 
        WHERE user_id = $1 AND read_at IS NULL
        RETURNING COUNT(*)
      `, [currentUser.id]);

      // Send real-time update
      if (req.io) {
        req.io.to(`user:${currentUser.id}`).emit('notification:all_marked_read', {
          userId: currentUser.id
        });
      }

      res.json({ 
        message: 'All notifications marked as read',
        updatedCount: result.rowCount
      });
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete notification
  deleteNotification: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const currentUser = req.user;

      const result = await pool.query(`
        DELETE FROM notifications 
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [notificationId, currentUser.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Notification not found',
          message: 'Notification does not exist'
        });
      }

      // Send real-time update
      if (req.io) {
        req.io.to(`user:${currentUser.id}`).emit('notification:deleted', {
          notificationId: parseInt(notificationId)
        });
      }

      res.status(204).send();
    } catch (err) {
      console.error('Error deleting notification:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete all read notifications
  deleteAllRead: async (req, res) => {
    try {
      const currentUser = req.user;

      const result = await pool.query(`
        DELETE FROM notifications 
        WHERE user_id = $1 AND read_at IS NOT NULL
        RETURNING COUNT(*)
      `, [currentUser.id]);

      res.json({ 
        message: 'All read notifications deleted',
        deletedCount: result.rowCount
      });
    } catch (err) {
      console.error('Error deleting read notifications:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get notification preferences
  getNotificationPreferences: async (req, res) => {
    try {
      const currentUser = req.user;

      // Get user settings for notifications
      const settingsResult = await pool.query(`
        SELECT settings->>'notifications' as notification_settings
        FROM user_settings 
        WHERE user_id = $1
      `, [currentUser.id]);

      const defaultPreferences = {
        email: {
          project_invitation: true,
          task_assigned: true,
          task_completed: false,
          project_message: false,
          mention: true,
          deadline_reminder: true
        },
        push: {
          project_invitation: true,
          task_assigned: true,
          task_completed: false,
          project_message: true,
          mention: true,
          deadline_reminder: true
        },
        inApp: {
          project_invitation: true,
          task_assigned: true,
          task_completed: true,
          project_message: true,
          mention: true,
          deadline_reminder: true
        }
      };

      const preferences = settingsResult.rows.length > 0 && settingsResult.rows[0].notification_settings
        ? JSON.parse(settingsResult.rows[0].notification_settings)
        : defaultPreferences;

      res.json(preferences);
    } catch (err) {
      console.error('Error fetching notification preferences:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update notification preferences
  updateNotificationPreferences: async (req, res) => {
    try {
      const currentUser = req.user;
      const { preferences } = req.body;

      if (!preferences) {
        return res.status(400).json({
          error: 'Preferences required',
          message: 'Notification preferences are required'
        });
      }

      // Get current settings
      let currentSettings = {};
      const settingsResult = await pool.query(`
        SELECT settings FROM user_settings WHERE user_id = $1
      `, [currentUser.id]);

      if (settingsResult.rows.length > 0) {
        currentSettings = settingsResult.rows[0].settings;
      }

      // Update notification preferences
      const updatedSettings = {
        ...currentSettings,
        notifications: preferences
      };

      // Save settings
      await pool.query(`
        INSERT INTO user_settings (user_id, settings)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET settings = $2, updated_at = NOW()
      `, [currentUser.id, JSON.stringify(updatedSettings)]);

      res.json({ 
        message: 'Notification preferences updated successfully',
        preferences 
      });
    } catch (err) {
      console.error('Error updating notification preferences:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Create notification (internal use)
  createNotification: async (userId, notificationData) => {
    try {
      const {
        type,
        title,
        message,
        data = {},
        projectId = null,
        taskId = null,
        messageId = null,
        actionUrl = null,
        priority = 'normal'
      } = notificationData;

      const result = await pool.query(`
        INSERT INTO notifications (
          user_id, type, title, message, data, 
          project_id, task_id, message_id, action_url, priority
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        userId, type, title, message, JSON.stringify(data),
        projectId, taskId, messageId, actionUrl, priority
      ]);

      return result.rows[0];
    } catch (err) {
      console.error('Error creating notification:', err);
      throw err;
    }
  },

  // Send notification to multiple users
  notifyUsers: async (userIds, notificationData, excludeUserId = null) => {
    try {
      const filteredUserIds = excludeUserId 
        ? userIds.filter(id => id !== excludeUserId)
        : userIds;

      const notifications = await Promise.all(
        filteredUserIds.map(userId => 
          notificationController.createNotification(userId, notificationData)
        )
      );

      return notifications;
    } catch (err) {
      console.error('Error notifying users:', err);
      throw err;
    }
  },

  // Notify project members
  notifyProjectMembers: async (projectId, notificationData, excludeUserId = null, io = null) => {
    try {
      // Get all project members
      const membersResult = await pool.query(`
        SELECT DISTINCT user_id FROM (
          SELECT created_by as user_id FROM projects WHERE id = $1
          UNION
          SELECT user_id FROM project_members WHERE project_id = $1
        ) AS all_members
        WHERE user_id IS NOT NULL
      `, [projectId]);

      const userIds = membersResult.rows.map(row => row.user_id);
      const notifications = await notificationController.notifyUsers(
        userIds, 
        { ...notificationData, projectId }, 
        excludeUserId
      );

      // Send real-time notifications
      if (io) {
        notifications.forEach(notification => {
          io.to(`user:${notification.user_id}`).emit('notification:new', notification);
        });
      }

      return notifications;
    } catch (err) {
      console.error('Error notifying project members:', err);
      throw err;
    }
  },

  // Get notification statistics
  getNotificationStats: async (req, res) => {
    try {
      const currentUser = req.user;

      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread,
          COUNT(CASE WHEN type = 'project_invitation' THEN 1 END) as project_invitations,
          COUNT(CASE WHEN type = 'task_assigned' THEN 1 END) as task_assignments,
          COUNT(CASE WHEN type = 'project_message' THEN 1 END) as messages,
          COUNT(CASE WHEN type = 'mention' THEN 1 END) as mentions,
          COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority
        FROM notifications 
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
      `, [currentUser.id]);

      res.json(stats.rows[0]);
    } catch (err) {
      console.error('Error fetching notification stats:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = notificationController;