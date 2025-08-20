// controllers/taskController.js
const pool = require('../config/database');

const taskController = {
  // Get all tasks (with user context)
  getAllTasks: async (req, res) => {
    try {
      const currentUser = req.user;
      
      // Get filters from query parameters
      const { status, priority, assignee, project, search } = req.query;
      
      let query = `
        SELECT 
          t.*, 
          u.name as assignee_name,
          u.avatar as assignee_avatar,
          p.name as project_name,
          creator.name as created_by_name
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users creator ON t.created_by = creator.id
        WHERE 1=1
      `;
      
      const queryParams = [];
      let paramCounter = 1;
      
      // Apply filters
      if (status && status !== 'all') {
        query += ` AND t.status = $${paramCounter}`;
        queryParams.push(status);
        paramCounter++;
      }
      
      if (priority && priority !== 'all') {
        query += ` AND t.priority = $${paramCounter}`;
        queryParams.push(priority);
        paramCounter++;
      }
      
      if (assignee && assignee !== 'all') {
        query += ` AND t.assignee = $${paramCounter}`;
        queryParams.push(parseInt(assignee));
        paramCounter++;
      }
      
      if (project && project !== 'all') {
        query += ` AND t.project_id = $${paramCounter}`;
        queryParams.push(parseInt(project));
        paramCounter++;
      }
      
      if (search) {
        query += ` AND (t.title ILIKE ${paramCounter} OR t.description ILIKE ${paramCounter})`;
        queryParams.push(`%${search}%`);
        paramCounter++;
      }
      
      query += ` ORDER BY t.created_at DESC`;
      
      const result = await pool.query(query, queryParams);
      
      // Add user permissions to each task
      const tasksWithPermissions = result.rows.map(task => ({
        ...task,
        can_edit: canEditTask(currentUser, task),
        can_delete: canDeleteTask(currentUser, task),
        can_assign: canAssignTask(currentUser, task)
      }));
      
      res.json(tasksWithPermissions);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get task by ID
  getTaskById: async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      const result = await pool.query(`
        SELECT 
          t.*, 
          u.name as assignee_name,
          u.avatar as assignee_avatar,
          p.name as project_name,
          creator.name as created_by_name
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users creator ON t.created_by = creator.id
        WHERE t.id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const task = result.rows[0];
      
      // Add permissions
      const taskWithPermissions = {
        ...task,
        can_edit: canEditTask(currentUser, task),
        can_delete: canDeleteTask(currentUser, task),
        can_assign: canAssignTask(currentUser, task)
      };
      
      res.json(taskWithPermissions);
    } catch (err) {
      console.error('Error fetching task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Create new task
  createTask: async (req, res) => {
    try {
      const { title, description, priority, status, assignee, dueDate, projectId } = req.body;
      const currentUser = req.user;
      
      const result = await pool.query(`
        INSERT INTO tasks (title, description, priority, status, assignee, due_date, project_id, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `, [
        title, 
        description, 
        priority || 'medium', 
        status || 'todo', 
        assignee || null, 
        dueDate || null,
        projectId || null,
        currentUser.id
      ]);
      
      const newTask = result.rows[0];
      
      // Log activity
      await logTaskActivity(newTask.id, currentUser.id, 'created', null, title);
      
      // Get complete task data with relationships
      const completeTask = await getCompleteTaskData(newTask.id);
      
      // Emit to all connected clients
      if (req.io) {
        req.io.emit('taskCreated', completeTask);
      }
      
      res.status(201).json(completeTask);
    } catch (err) {
      console.error('Error creating task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update task
  updateTask: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, priority, status, assignee, dueDate, projectId } = req.body;
      const currentUser = req.user;
      
      // Get current task to check permissions and log changes
      const currentTaskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
      
      if (currentTaskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const currentTask = currentTaskResult.rows[0];
      
      // Check permissions
      if (!canEditTask(currentUser, currentTask)) {
        return res.status(403).json({ 
          error: 'Access denied', 
          message: 'You do not have permission to edit this task' 
        });
      }
      
      const result = await pool.query(`
        UPDATE tasks 
        SET title = $1, description = $2, priority = $3, status = $4, 
            assignee = $5, due_date = $6, project_id = $7, updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [title, description, priority, status, assignee || null, dueDate || null, projectId || null, id]);
      
      const updatedTask = result.rows[0];
      
      // Log changes
      await logTaskChanges(currentTask, updatedTask, currentUser.id);
      
      // Get complete task data with relationships
      const completeTask = await getCompleteTaskData(id);
      
      // Emit to all connected clients
      if (req.io) {
        req.io.emit('taskUpdated', completeTask);
      }
      
      res.json(completeTask);
    } catch (err) {
      console.error('Error updating task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete task
  deleteTask: async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      // Get current task to check permissions
      const currentTaskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
      
      if (currentTaskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const currentTask = currentTaskResult.rows[0];
      
      // Check permissions
      if (!canDeleteTask(currentUser, currentTask)) {
        return res.status(403).json({ 
          error: 'Access denied', 
          message: 'You do not have permission to delete this task' 
        });
      }
      
      const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id, title', [id]);
      
      // Log activity
      await logTaskActivity(id, currentUser.id, 'deleted', currentTask.title, null);
      
      // Emit to all connected clients
      if (req.io) {
        req.io.emit('taskDeleted', parseInt(id));
      }
      
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get tasks by status (for analytics)
  getTasksByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      const currentUser = req.user;
      
      const result = await pool.query(`
        SELECT 
          t.*, 
          u.name as assignee_name,
          u.avatar as assignee_avatar,
          p.name as project_name
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.status = $1 
        ORDER BY t.created_at DESC
      `, [status]);
      
      const tasksWithPermissions = result.rows.map(task => ({
        ...task,
        can_edit: canEditTask(currentUser, task),
        can_delete: canDeleteTask(currentUser, task),
        can_assign: canAssignTask(currentUser, task)
      }));
      
      res.json(tasksWithPermissions);
    } catch (err) {
      console.error('Error fetching tasks by status:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get tasks by assignee
  getTasksByAssignee: async (req, res) => {
    try {
      const { assignee } = req.params;
      const currentUser = req.user;
      
      const result = await pool.query(`
        SELECT 
          t.*, 
          u.name as assignee_name,
          u.avatar as assignee_avatar,
          p.name as project_name
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.assignee = $1 
        ORDER BY t.created_at DESC
      `, [assignee]);
      
      const tasksWithPermissions = result.rows.map(task => ({
        ...task,
        can_edit: canEditTask(currentUser, task),
        can_delete: canDeleteTask(currentUser, task),
        can_assign: canAssignTask(currentUser, task)
      }));
      
      res.json(tasksWithPermissions);
    } catch (err) {
      console.error('Error fetching tasks by assignee:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Bulk update tasks
  bulkUpdateTasks: async (req, res) => {
    try {
      const { taskIds, updateData } = req.body;
      const currentUser = req.user;
      
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Task IDs are required' });
      }
      
      // Check permissions for all tasks
      const tasksResult = await pool.query(
        'SELECT * FROM tasks WHERE id = ANY($1)',
        [taskIds]
      );
      
      const unauthorizedTasks = tasksResult.rows.filter(task => !canEditTask(currentUser, task));
      
      if (unauthorizedTasks.length > 0) {
        return res.status(403).json({ 
          error: 'Access denied', 
          message: 'You do not have permission to edit some of the selected tasks' 
        });
      }
      
      // Build dynamic update query
      const setClauses = [];
      const values = [];
      let paramCounter = 1;
      
      if (updateData.status) {
        setClauses.push(`status = ${paramCounter}`);
        values.push(updateData.status);
        paramCounter++;
      }
      
      if (updateData.priority) {
        setClauses.push(`priority = ${paramCounter}`);
        values.push(updateData.priority);
        paramCounter++;
      }
      
      if (updateData.assignee !== undefined) {
        setClauses.push(`assignee = ${paramCounter}`);
        values.push(updateData.assignee);
        paramCounter++;
      }
      
      if (updateData.projectId !== undefined) {
        setClauses.push(`project_id = ${paramCounter}`);
        values.push(updateData.projectId);
        paramCounter++;
      }
      
      setClauses.push(`updated_at = NOW()`);
      values.push(taskIds);
      
      const updateQuery = `
        UPDATE tasks 
        SET ${setClauses.join(', ')}
        WHERE id = ANY(${paramCounter})
        RETURNING *
      `;
      
      const result = await pool.query(updateQuery, values);
      
      // Log activity for each updated task
      for (const task of result.rows) {
        await logTaskActivity(task.id, currentUser.id, 'bulk_updated', null, 'Bulk update applied');
      }
      
      // Emit to all connected clients
      if (req.io) {
        result.rows.forEach(task => {
          req.io.emit('taskUpdated', task);
        });
      }
      
      res.json({
        message: `${result.rows.length} tasks updated successfully`,
        updatedTasks: result.rows
      });
    } catch (err) {
      console.error('Error bulk updating tasks:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Helper functions for permissions
function canEditTask(user, task) {
  // Admins and managers can edit all tasks
  if (user.role === 'admin' || user.role === 'manager') {
    return true;
  }
  
  // Task creator can edit their own tasks
  if (task.created_by === user.id) {
    return true;
  }
  
  // Assigned user can edit their assigned tasks
  if (task.assignee === user.id) {
    return true;
  }
  
  return false;
}

function canDeleteTask(user, task) {
  // Only admins and managers can delete tasks
  if (user.role === 'admin' || user.role === 'manager') {
    return true;
  }
  
  // Task creator can delete their own tasks (if they're not completed)
  if (task.created_by === user.id && task.status !== 'done') {
    return true;
  }
  
  return false;
}

function canAssignTask(user, task) {
  // Admins and managers can assign tasks
  if (user.role === 'admin' || user.role === 'manager') {
    return true;
  }
  
  // Task creator can assign their own tasks
  if (task.created_by === user.id) {
    return true;
  }
  
  return false;
}

// Helper function to get complete task data
async function getCompleteTaskData(taskId) {
  const result = await pool.query(`
    SELECT 
      t.*, 
      u.name as assignee_name,
      u.avatar as assignee_avatar,
      p.name as project_name,
      creator.name as created_by_name
    FROM tasks t 
    LEFT JOIN users u ON t.assignee = u.id 
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users creator ON t.created_by = creator.id
    WHERE t.id = $1
  `, [taskId]);
  
  return result.rows[0];
}

// Helper function to log task activity
async function logTaskActivity(taskId, userId, action, oldValue, newValue) {
  try {
    await pool.query(`
      INSERT INTO task_activity (task_id, user_id, action, old_value, new_value, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [taskId, userId, action, oldValue, newValue]);
  } catch (error) {
    console.error('Error logging task activity:', error);
  }
}

// Helper function to log task changes
async function logTaskChanges(oldTask, newTask, userId) {
  const changes = [];
  
  if (oldTask.title !== newTask.title) {
    changes.push({ field: 'title', old: oldTask.title, new: newTask.title });
  }
  
  if (oldTask.description !== newTask.description) {
    changes.push({ field: 'description', old: oldTask.description, new: newTask.description });
  }
  
  if (oldTask.status !== newTask.status) {
    changes.push({ field: 'status', old: oldTask.status, new: newTask.status });
  }
  
  if (oldTask.priority !== newTask.priority) {
    changes.push({ field: 'priority', old: oldTask.priority, new: newTask.priority });
  }
  
  if (oldTask.assignee !== newTask.assignee) {
    changes.push({ field: 'assignee', old: oldTask.assignee, new: newTask.assignee });
  }
  
  if (oldTask.due_date !== newTask.due_date) {
    changes.push({ field: 'due_date', old: oldTask.due_date, new: newTask.due_date });
  }
  
  if (oldTask.project_id !== newTask.project_id) {
    changes.push({ field: 'project_id', old: oldTask.project_id, new: newTask.project_id });
  }
  
  // Log each change
  for (const change of changes) {
    await logTaskActivity(
      newTask.id, 
      userId, 
      `${change.field}_changed`, 
      change.old?.toString() || null, 
      change.new?.toString() || null
    );
  }
}

module.exports = taskController;