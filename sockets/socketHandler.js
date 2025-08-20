// sockets/socketHandler.js (Updated with JWT Authentication)
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Verify socket authentication
const verifySocketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'taskflow-app',
      audience: 'taskflow-users'
    });

    // Check if user exists in database
    const userResult = await pool.query(
      'SELECT id, name, email, avatar, role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return next(new Error('User not found'));
    }

    const user = userResult.rows[0];

    // Add user info to socket
    socket.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role || 'member'
    };

    next();
  } catch (error) {
    console.error('Socket authentication error:', error);

    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }

    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token'));
    }

    return next(new Error('Authentication failed'));
  }
};

const initializeSocket = (io) => {
  // Apply authentication middleware
  io.use(verifySocketAuth);

  // Store online users
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`User connected: ${user.name} (${user.id}) - Socket: ${socket.id}`);

    // Add user to online users
    onlineUsers.set(user.id, {
      socketId: socket.id,
      user: user,
      connectedAt: new Date(),
      rooms: new Set()
    });

    // Notify other users that this user came online
    socket.broadcast.emit('user:online', {
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        role: user.role
      }
    });

    // Send current online users to the newly connected user
    const onlineUsersList = Array.from(onlineUsers.values()).map(userInfo => ({
      userId: userInfo.user.id,
      user: {
        id: userInfo.user.id,
        name: userInfo.user.name,
        avatar: userInfo.user.avatar,
        role: userInfo.user.role
      }
    }));

    socket.emit('users:online_list', onlineUsersList);

    // Join user to their personal room
    socket.join(`user:${user.id}`);

    // Project room management
    socket.on('project:join', async (projectId) => {
      try {
        // Check if user has access to this project
        const projectAccess = await pool.query(`
          SELECT p.id FROM projects p
          LEFT JOIN project_members pm ON p.id = pm.project_id
          WHERE p.id = $1 AND (p.created_by = $2 OR pm.user_id = $2)
        `, [projectId, user.id]);

        if (projectAccess.rows.length === 0) {
          socket.emit('error', { message: 'Access denied to project' });
          return;
        }

        socket.join(`project:${projectId}`);
        onlineUsers.get(user.id)?.rooms.add(`project:${projectId}`);

        console.log(`User ${user.name} joined project room: ${projectId}`);

        // Notify other users in the project
        socket.to(`project:${projectId}`).emit('project:user_joined', {
          projectId: parseInt(projectId),
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            role: user.role
          }
        });

        socket.emit('project:joined', { projectId: parseInt(projectId) });
      } catch (error) {
        console.error('Error joining project room:', error);
        socket.emit('error', { message: 'Failed to join project' });
      }
    });

    socket.on('project:leave', (projectId) => {
      socket.leave(`project:${projectId}`);
      onlineUsers.get(user.id)?.rooms.delete(`project:${projectId}`);

      console.log(`User ${user.name} left project room: ${projectId}`);

      // Notify other users in the project
      socket.to(`project:${projectId}`).emit('project:user_left', {
        projectId: parseInt(projectId),
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          role: user.role
        }
      });

      socket.emit('project:left', { projectId: parseInt(projectId) });
    });

    // Task room management
    socket.on('task:join', async (taskId) => {
      try {
        // Check if user has access to this task
        const taskAccess = await pool.query(`
          SELECT t.id FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          LEFT JOIN project_members pm ON p.id = pm.project_id
          WHERE t.id = $1 AND (
            t.assignee = $2 OR 
            t.created_by = $2 OR 
            p.created_by = $2 OR 
            pm.user_id = $2 OR
            $3 IN ('admin', 'manager')
          )
        `, [taskId, user.id, user.role]);

        if (taskAccess.rows.length === 0) {
          socket.emit('error', { message: 'Access denied to task' });
          return;
        }

        socket.join(`task:${taskId}`);
        onlineUsers.get(user.id)?.rooms.add(`task:${taskId}`);

        console.log(`User ${user.name} joined task room: ${taskId}`);

        socket.emit('task:joined', { taskId: parseInt(taskId) });
      } catch (error) {
        console.error('Error joining task room:', error);
        socket.emit('error', { message: 'Failed to join task' });
      }
    });

    socket.on('task:leave', (taskId) => {
      socket.leave(`task:${taskId}`);
      onlineUsers.get(user.id)?.rooms.delete(`task:${taskId}`);

      console.log(`User ${user.name} left task room: ${taskId}`);
      socket.emit('task:left', { taskId: parseInt(taskId) });
    });

    // Task collaboration events
    socket.on('task:typing', (data) => {
      const { taskId } = data;
      socket.to(`task:${taskId}`).emit('task:user_typing', {
        taskId: parseInt(taskId),
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar
        }
      });
    });

    socket.on('task:stop_typing', (data) => {
      const { taskId } = data;
      socket.to(`task:${taskId}`).emit('task:user_stopped_typing', {
        taskId: parseInt(taskId),
        userId: user.id
      });
    });

    // Real-time task updates
    socket.on('task:status_change', async (data) => {
      try {
        const { taskId, status, oldStatus } = data;

        // Verify user can edit this task
        const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (taskResult.rows.length === 0) {
          socket.emit('error', { message: 'Task not found' });
          return;
        }

        const task = taskResult.rows[0];

        // Check permissions (similar to task controller)
        const canEdit = task.created_by === user.id ||
          task.assignee === user.id ||
          ['admin', 'manager'].includes(user.role);

        if (!canEdit) {
          socket.emit('error', { message: 'Permission denied' });
          return;
        }

        // Broadcast to task room and project room
        const updateData = {
          taskId: parseInt(taskId),
          status,
          oldStatus,
          updatedBy: {
            id: user.id,
            name: user.name,
            avatar: user.avatar
          },
          timestamp: new Date()
        };

        socket.to(`task:${taskId}`).emit('task:status_changed', updateData);

        if (task.project_id) {
          socket.to(`project:${task.project_id}`).emit('task:status_changed', updateData);
        }

        console.log(`Task ${taskId} status changed from ${oldStatus} to ${status} by ${user.name}`);
      } catch (error) {
        console.error('Error handling task status change:', error);
        socket.emit('error', { message: 'Failed to update task status' });
      }
    });

    // Comment events
    socket.on('comment:add', async (data) => {
      try {
        const { taskId, content } = data;

        // Verify access to task
        const taskAccess = await pool.query(`
          SELECT t.id, t.project_id FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          LEFT JOIN project_members pm ON p.id = pm.project_id
          WHERE t.id = $1 AND (
            t.assignee = $2 OR 
            t.created_by = $2 OR 
            p.created_by = $2 OR 
            pm.user_id = $2 OR
            $3 IN ('admin', 'manager')
          )
        `, [taskId, user.id, user.role]);

        if (taskAccess.rows.length === 0) {
          socket.emit('error', { message: 'Access denied to task' });
          return;
        }

        // Add comment to database
        const commentResult = await pool.query(`
          INSERT INTO comments (task_id, user_id, content, created_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING *
        `, [taskId, user.id, content]);

        const comment = {
          ...commentResult.rows[0],
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar
          }
        };

        // Broadcast to task room
        io.to(`task:${taskId}`).emit('comment:added', {
          taskId: parseInt(taskId),
          comment
        });

        // Also broadcast to project room if task belongs to a project
        const projectId = taskAccess.rows[0].project_id;
        if (projectId) {
          socket.to(`project:${projectId}`).emit('comment:added', {
            taskId: parseInt(taskId),
            comment
          });
        }

        console.log(`Comment added to task ${taskId} by ${user.name}`);
      } catch (error) {
        console.error('Error adding comment:', error);
        socket.emit('error', { message: 'Failed to add comment' });
      }
    });

    // User status updates
    socket.on('user:status_update', (status) => {
      const validStatuses = ['online', 'away', 'busy', 'offline'];
      if (!validStatuses.includes(status)) {
        socket.emit('error', { message: 'Invalid status' });
        return;
      }

      const userInfo = onlineUsers.get(user.id);
      if (userInfo) {
        userInfo.status = status;

        // Broadcast status change to all connected users
        socket.broadcast.emit('user:status_changed', {
          userId: user.id,
          status,
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            role: user.role
          }
        });
      }
    });

    // Notification events
    socket.on('notification:mark_read', async (notificationId) => {
      try {
        await pool.query(`
          UPDATE notifications 
          SET read_at = NOW() 
          WHERE id = $1 AND user_id = $2
        `, [notificationId, user.id]);

        socket.emit('notification:marked_read', { notificationId });
      } catch (error) {
        console.error('Error marking notification as read:', error);
        socket.emit('error', { message: 'Failed to mark notification as read' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${user.name} (${user.id}) - Reason: ${reason}`);

      // Remove from online users
      onlineUsers.delete(user.id);

      // Notify other users
      socket.broadcast.emit('user:offline', {
        userId: user.id,
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          role: user.role
        },
        disconnectedAt: new Date()
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error from user ${user.name}:`, error);
    });

    // Ping-pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Connection error handler
  io.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  // Server-level error handler
  io.on('error', (error) => {
    console.error('Socket.IO server error:', error);
  });

  // Utility function to send notifications to specific users
  io.sendNotificationToUser = async (userId, notification) => {
    try {
      // Store notification in database
      const notificationResult = await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [
        userId,
        notification.type || 'info',
        notification.title,
        notification.message,
        JSON.stringify(notification.data || {})
      ]);

      const savedNotification = notificationResult.rows[0];

      // Send to user's personal room
      io.to(`user:${userId}`).emit('notification:new', savedNotification);

      console.log(`Notification sent to user ${userId}: ${notification.title}`);
    } catch (error) {
      console.error('Error sending notification to user:', error);
    }
  };

  // Utility function to broadcast to project members
  io.broadcastToProject = (projectId, event, data) => {
    io.to(`project:${projectId}`).emit(event, data);
  };

  // Utility function to broadcast to task participants
  io.broadcastToTask = (taskId, event, data) => {
    io.to(`task:${taskId}`).emit(event, data);
  };

  // Get online users count
  io.getOnlineUsersCount = () => {
    return onlineUsers.size;
  };

  // Get online users for a specific project
  io.getProjectOnlineUsers = (projectId) => {
    const projectUsers = [];
    onlineUsers.forEach((userInfo) => {
      if (userInfo.rooms.has(`project:${projectId}`)) {
        projectUsers.push({
          userId: userInfo.user.id,
          user: userInfo.user,
          connectedAt: userInfo.connectedAt
        });
      }
    });
    return projectUsers;
  };

  console.log('🔌 Socket.IO initialized with JWT authentication');
};

module.exports = initializeSocket;