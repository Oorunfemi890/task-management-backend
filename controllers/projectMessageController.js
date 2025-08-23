// controllers/projectMessageController.js
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/messages');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common file types
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

const projectMessageController = {
  // Get all messages for a project
  getProjectMessages: async (req, res) => {
    try {
      const { projectId } = req.params;
      const { page = 1, limit = 50, before } = req.query;
      const currentUser = req.user;
      const offset = (page - 1) * limit;

      // Check if user has access to this project
      const projectAccess = await pool.query(`
        SELECT p.id FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.id = $1 AND (p.created_by = $2 OR pm.user_id = $2)
      `, [projectId, currentUser.id]);

      if (projectAccess.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      let query = `
        SELECT 
          pm.*,
          u.name as user_name,
          u.avatar as user_avatar,
          reply_msg.message as reply_message,
          reply_user.name as reply_user_name,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'emoji', mr.emoji,
                'count', mr.reaction_count,
                'users', mr.users
              )
            ) FILTER (WHERE mr.emoji IS NOT NULL), 
            '[]'
          ) as reactions
        FROM project_messages pm
        LEFT JOIN users u ON pm.user_id = u.id
        LEFT JOIN project_messages reply_msg ON pm.reply_to = reply_msg.id
        LEFT JOIN users reply_user ON reply_msg.user_id = reply_user.id
        LEFT JOIN (
          SELECT 
            message_id, 
            emoji, 
            COUNT(*) as reaction_count,
            json_agg(
              jsonb_build_object('id', user_id, 'name', user_name, 'avatar', user_avatar)
            ) as users
          FROM message_reactions mr2
          LEFT JOIN users u2 ON mr2.user_id = u2.id
          GROUP BY message_id, emoji
        ) mr ON pm.id = mr.message_id
        WHERE pm.project_id = $1 AND pm.is_archived = false
      `;

      const queryParams = [projectId];
      let paramCounter = 2;

      if (before) {
        query += ` AND pm.created_at < $${paramCounter}`;
        queryParams.push(before);
        paramCounter++;
      }

      query += ` 
        GROUP BY pm.id, u.name, u.avatar, reply_msg.message, reply_user.name
        ORDER BY pm.created_at DESC
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;
      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);

      // Update user's last seen for this project
      await pool.query(`
        INSERT INTO project_chat_participants (project_id, user_id, last_seen, is_online)
        VALUES ($1, $2, NOW(), true)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET last_seen = NOW(), is_online = true
      `, [projectId, currentUser.id]);

      res.json(result.rows.reverse()); // Reverse to show oldest first
    } catch (err) {
      console.error('Error fetching project messages:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Send a message to a project
  sendMessage: async (req, res) => {
    try {
      const { projectId } = req.params;
      const { message, messageType = 'text', replyTo } = req.body;
      const currentUser = req.user;

      // Validate input
      if (!message || message.trim() === '') {
        return res.status(400).json({
          error: 'Message content required',
          message: 'Message cannot be empty'
        });
      }

      // Check project access
      const projectAccess = await pool.query(`
        SELECT p.id, p.name FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.id = $1 AND (p.created_by = $2 OR pm.user_id = $2)
      `, [projectId, currentUser.id]);

      if (projectAccess.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      const project = projectAccess.rows[0];

      // Insert message
      const messageResult = await pool.query(`
        INSERT INTO project_messages (project_id, user_id, message, message_type, reply_to)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [projectId, currentUser.id, message.trim(), messageType, replyTo || null]);

      const newMessage = messageResult.rows[0];

      // Get complete message data with user info
      const completeMessage = await pool.query(`
        SELECT 
          pm.*,
          u.name as user_name,
          u.avatar as user_avatar,
          reply_msg.message as reply_message,
          reply_user.name as reply_user_name
        FROM project_messages pm
        LEFT JOIN users u ON pm.user_id = u.id
        LEFT JOIN project_messages reply_msg ON pm.reply_to = reply_msg.id
        LEFT JOIN users reply_user ON reply_msg.user_id = reply_user.id
        WHERE pm.id = $1
      `, [newMessage.id]);

      const messageWithUser = completeMessage.rows[0];

      // Log project activity
      await pool.query(`
        SELECT log_project_activity($1, $2, $3, $4, $5)
      `, [
        projectId,
        currentUser.id,
        'message_sent',
        `${currentUser.name} sent a message`,
        JSON.stringify({ message_id: newMessage.id, message_preview: message.substring(0, 100) })
      ]);

      // Send real-time update via socket
      if (req.io) {
        req.io.to(`project:${projectId}`).emit('project:message_received', {
          projectId: parseInt(projectId),
          message: messageWithUser
        });
      }

      // Send notifications to project members (except sender)
      await pool.query(`
        SELECT notify_project_members($1, $2, $3, $4, $5, $6, $7)
      `, [
        projectId,
        'project_message',
        'New message in project',
        `${currentUser.name}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
        JSON.stringify({
          project_name: project.name,
          sender_name: currentUser.name,
          action_url: `/projects/${projectId}`
        }),
        currentUser.id,
        'normal'
      ]);

      res.status(201).json(messageWithUser);
    } catch (err) {
      console.error('Error sending message:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Upload and send file/image message
  uploadAndSendFile: async (req, res) => {
    const uploadSingle = upload.single('file');
    
    uploadSingle(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ 
          error: 'Upload failed',
          message: err.message 
        });
      }

      try {
        const { projectId } = req.params;
        const { message = '' } = req.body;
        const currentUser = req.user;
        const file = req.file;

        if (!file) {
          return res.status(400).json({
            error: 'No file uploaded',
            message: 'Please select a file to upload'
          });
        }

        // Check project access
        const projectAccess = await pool.query(`
          SELECT p.id, p.name FROM projects p
          LEFT JOIN project_members pm ON p.id = pm.project_id
          WHERE p.id = $1 AND (p.created_by = $2 OR pm.user_id = $2)
        `, [projectId, currentUser.id]);

        if (projectAccess.rows.length === 0) {
          // Delete uploaded file if no access
          await fs.unlink(file.path).catch(console.error);
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'You do not have access to this project'
          });
        }

        const project = projectAccess.rows[0];
        const messageType = file.mimetype.startsWith('image/') ? 'image' : 'file';
        const attachmentUrl = `/uploads/messages/${file.filename}`;

        // Insert message with attachment
        const messageResult = await pool.query(`
          INSERT INTO project_messages (
            project_id, user_id, message, message_type, 
            attachment_url, attachment_name, attachment_size, attachment_type
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          projectId, currentUser.id, message.trim() || file.originalname, messageType,
          attachmentUrl, file.originalname, file.size, file.mimetype
        ]);

        const newMessage = messageResult.rows[0];

        // Get complete message data
        const completeMessage = await pool.query(`
          SELECT 
            pm.*,
            u.name as user_name,
            u.avatar as user_avatar
          FROM project_messages pm
          LEFT JOIN users u ON pm.user_id = u.id
          WHERE pm.id = $1
        `, [newMessage.id]);

        const messageWithUser = completeMessage.rows[0];

        // Log activity
        await pool.query(`
          SELECT log_project_activity($1, $2, $3, $4, $5)
        `, [
          projectId,
          currentUser.id,
          messageType === 'image' ? 'image_shared' : 'file_shared',
          `${currentUser.name} shared ${messageType === 'image' ? 'an image' : 'a file'}: ${file.originalname}`,
          JSON.stringify({ 
            message_id: newMessage.id, 
            file_name: file.originalname,
            file_size: file.size 
          })
        ]);

        // Send real-time update
        if (req.io) {
          req.io.to(`project:${projectId}`).emit('project:message_received', {
            projectId: parseInt(projectId),
            message: messageWithUser
          });
        }

        // Send notifications
        await pool.query(`
          SELECT notify_project_members($1, $2, $3, $4, $5, $6, $7)
        `, [
          projectId,
          'project_message',
          `New ${messageType} in project`,
          `${currentUser.name} shared ${messageType === 'image' ? 'an image' : 'a file'}: ${file.originalname}`,
          JSON.stringify({
            project_name: project.name,
            sender_name: currentUser.name,
            action_url: `/projects/${projectId}`
          }),
          currentUser.id,
          'normal'
        ]);

        res.status(201).json(messageWithUser);
      } catch (error) {
        console.error('Error sending file message:', error);
        // Clean up uploaded file on error
        if (req.file) {
          await fs.unlink(req.file.path).catch(console.error);
        }
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  },

  // Edit a message
  editMessage: async (req, res) => {
    try {
      const { projectId, messageId } = req.params;
      const { message } = req.body;
      const currentUser = req.user;

      if (!message || message.trim() === '') {
        return res.status(400).json({
          error: 'Message content required',
          message: 'Message cannot be empty'
        });
      }

      // Check if user can edit this message
      const messageCheck = await pool.query(`
        SELECT pm.*, p.name as project_name FROM project_messages pm
        LEFT JOIN projects p ON pm.project_id = p.id
        WHERE pm.id = $1 AND pm.project_id = $2 AND pm.user_id = $3
      `, [messageId, projectId, currentUser.id]);

      if (messageCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only edit your own messages'
        });
      }

      const existingMessage = messageCheck.rows[0];

      // Don't allow editing non-text messages
      if (existingMessage.message_type !== 'text') {
        return res.status(400).json({
          error: 'Cannot edit this message',
          message: 'Only text messages can be edited'
        });
      }

      // Update message
      const updateResult = await pool.query(`
        UPDATE project_messages 
        SET message = $1, is_edited = true, edited_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [message.trim(), messageId]);

      const updatedMessage = updateResult.rows[0];

      // Get complete message data
      const completeMessage = await pool.query(`
        SELECT 
          pm.*,
          u.name as user_name,
          u.avatar as user_avatar
        FROM project_messages pm
        LEFT JOIN users u ON pm.user_id = u.id
        WHERE pm.id = $1
      `, [messageId]);

      const messageWithUser = completeMessage.rows[0];

      // Send real-time update
      if (req.io) {
        req.io.to(`project:${projectId}`).emit('project:message_edited', {
          projectId: parseInt(projectId),
          message: messageWithUser
        });
      }

      res.json(messageWithUser);
    } catch (err) {
      console.error('Error editing message:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete a message
  deleteMessage: async (req, res) => {
    try {
      const { projectId, messageId } = req.params;
      const currentUser = req.user;

      // Check if user can delete this message
      const messageCheck = await pool.query(`
        SELECT pm.*, p.name as project_name FROM project_messages pm
        LEFT JOIN projects p ON pm.project_id = p.id
        LEFT JOIN project_members pm2 ON p.id = pm2.project_id
        WHERE pm.id = $1 AND pm.project_id = $2 AND (
          pm.user_id = $3 OR 
          p.created_by = $3 OR 
          (pm2.user_id = $3 AND pm2.role IN ('admin', 'manager'))
        )
      `, [messageId, projectId, currentUser.id]);

      if (messageCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own messages or you must be a project admin'
        });
      }

      const message = messageCheck.rows[0];

      // Delete attachment file if exists
      if (message.attachment_url) {
        const filePath = path.join(__dirname, '../', message.attachment_url);
        await fs.unlink(filePath).catch(console.error);
      }

      // Delete message and related data
      await pool.query('DELETE FROM message_reactions WHERE message_id = $1', [messageId]);
      await pool.query('DELETE FROM project_messages WHERE id = $1', [messageId]);

      // Send real-time update
      if (req.io) {
        req.io.to(`project:${projectId}`).emit('project:message_deleted', {
          projectId: parseInt(projectId),
          messageId: parseInt(messageId)
        });
      }

      res.status(204).send();
    } catch (err) {
      console.error('Error deleting message:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Add reaction to message
  addReaction: async (req, res) => {
    try {
      const { projectId, messageId } = req.params;
      const { emoji } = req.body;
      const currentUser = req.user;

      if (!emoji || emoji.trim() === '') {
        return res.status(400).json({
          error: 'Emoji required',
          message: 'Please provide an emoji for the reaction'
        });
      }

      // Check project access
      const accessCheck = await pool.query(`
        SELECT pm.id FROM project_messages pm
        LEFT JOIN projects p ON pm.project_id = p.id
        LEFT JOIN project_members pmem ON p.id = pmem.project_id
        WHERE pm.id = $1 AND pm.project_id = $2 AND (
          p.created_by = $3 OR pmem.user_id = $3
        )
      `, [messageId, projectId, currentUser.id]);

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      // Add or toggle reaction
      const existingReaction = await pool.query(`
        SELECT id FROM message_reactions 
        WHERE message_id = $1 AND user_id = $2 AND emoji = $3
      `, [messageId, currentUser.id, emoji.trim()]);

      if (existingReaction.rows.length > 0) {
        // Remove existing reaction
        await pool.query(`
          DELETE FROM message_reactions 
          WHERE message_id = $1 AND user_id = $2 AND emoji = $3
        `, [messageId, currentUser.id, emoji.trim()]);
      } else {
        // Add new reaction
        await pool.query(`
          INSERT INTO message_reactions (message_id, user_id, emoji)
          VALUES ($1, $2, $3)
        `, [messageId, currentUser.id, emoji.trim()]);
      }

      // Get updated reactions for this message
      const reactions = await pool.query(`
        SELECT 
          emoji,
          COUNT(*) as count,
          json_agg(
            jsonb_build_object(
              'id', mr.user_id,
              'name', u.name,
              'avatar', u.avatar
            )
          ) as users
        FROM message_reactions mr
        LEFT JOIN users u ON mr.user_id = u.id
        WHERE mr.message_id = $1
        GROUP BY emoji
      `, [messageId]);

      // Send real-time update
      if (req.io) {
        req.io.to(`project:${projectId}`).emit('project:message_reaction_updated', {
          projectId: parseInt(projectId),
          messageId: parseInt(messageId),
          reactions: reactions.rows
        });
      }

      res.json({ reactions: reactions.rows });
    } catch (err) {
      console.error('Error adding reaction:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Archive old messages
  archiveMessages: async (req, res) => {
    try {
      const { projectId } = req.params;
      const { beforeDate } = req.body;
      const currentUser = req.user;

      // Check if user is project admin
      const adminCheck = await pool.query(`
        SELECT p.id FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.id = $1 AND (
          p.created_by = $2 OR 
          (pm.user_id = $2 AND pm.role IN ('admin', 'manager'))
        )
      `, [projectId, currentUser.id]);

      if (adminCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Only project admins can archive messages'
        });
      }

      const archiveDate = beforeDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      // Archive messages
      const result = await pool.query(`
        UPDATE project_messages 
        SET is_archived = true, archived_at = NOW()
        WHERE project_id = $1 AND created_at < $2 AND is_archived = false
        RETURNING COUNT(*)
      `, [projectId, archiveDate]);

      // Log activity
      await pool.query(`
        SELECT log_project_activity($1, $2, $3, $4, $5)
      `, [
        projectId,
        currentUser.id,
        'messages_archived',
        `${currentUser.name} archived old messages`,
        JSON.stringify({ archived_before: archiveDate })
      ]);

      res.json({ 
        message: 'Messages archived successfully',
        archivedCount: result.rowCount 
      });
    } catch (err) {
      console.error('Error archiving messages:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get project chat participants
  getChatParticipants: async (req, res) => {
    try {
      const { projectId } = req.params;
      const currentUser = req.user;

      // Check project access
      const projectAccess = await pool.query(`
        SELECT p.id FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.id = $1 AND (p.created_by = $2 OR pm.user_id = $2)
      `, [projectId, currentUser.id]);

      if (projectAccess.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      // Get all project members with their online status
      const participants = await pool.query(`
        SELECT DISTINCT
          u.id,
          u.name,
          u.avatar,
          pcp.is_online,
          pcp.last_seen,
          uos.status,
          CASE 
            WHEN uos.current_project_id = $1 THEN true 
            ELSE false 
          END as in_current_project
        FROM (
          SELECT created_by as user_id FROM projects WHERE id = $1
          UNION
          SELECT user_id FROM project_members WHERE project_id = $1
        ) AS all_members
        LEFT JOIN users u ON all_members.user_id = u.id
        LEFT JOIN project_chat_participants pcp ON pcp.project_id = $1 AND pcp.user_id = u.id
        LEFT JOIN user_online_status uos ON uos.user_id = u.id
        WHERE u.id IS NOT NULL
        ORDER BY 
          CASE WHEN uos.status = 'online' THEN 0 ELSE 1 END,
          u.name
      `, [projectId]);

      res.json(participants.rows);
    } catch (err) {
      console.error('Error fetching chat participants:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Mark messages as read
  markMessagesAsRead: async (req, res) => {
    try {
      const { projectId } = req.params;
      const { lastMessageId } = req.body;
      const currentUser = req.user;

      // Update user's last read message for this project
      await pool.query(`
        INSERT INTO project_chat_participants (project_id, user_id, last_message_read, last_seen)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET last_message_read = $3, last_seen = NOW()
      `, [projectId, currentUser.id, lastMessageId]);

      res.json({ message: 'Messages marked as read' });
    } catch (err) {
      console.error('Error marking messages as read:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get message search results
  searchMessages: async (req, res) => {
    try {
      const { projectId } = req.params;
      const { query, limit = 20 } = req.query;
      const currentUser = req.user;

      if (!query || query.trim() === '') {
        return res.status(400).json({
          error: 'Search query required',
          message: 'Please provide a search query'
        });
      }

      // Check project access
      const projectAccess = await pool.query(`
        SELECT p.id FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.id = $1 AND (p.created_by = $2 OR pm.user_id = $2)
      `, [projectId, currentUser.id]);

      if (projectAccess.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      // Search messages
      const results = await pool.query(`
        SELECT 
          pm.*,
          u.name as user_name,
          u.avatar as user_avatar,
          ts_rank(to_tsvector('english', pm.message), plainto_tsquery('english', $2)) as rank
        FROM project_messages pm
        LEFT JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1 
          AND pm.is_archived = false
          AND to_tsvector('english', pm.message) @@ plainto_tsquery('english', $2)
        ORDER BY rank DESC, pm.created_at DESC
        LIMIT $3
      `, [projectId, query.trim(), limit]);

      res.json(results.rows);
    } catch (err) {
      console.error('Error searching messages:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = projectMessageController;