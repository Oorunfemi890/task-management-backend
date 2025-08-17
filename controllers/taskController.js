// controllers/taskController.js
const pool = require('../config/database');

const taskController = {
  // Get all tasks
  getAllTasks: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT t.*, u.name as assignee_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        ORDER BY t.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get task by ID
  getTaskById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT t.*, u.name as assignee_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        WHERE t.id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Create new task
  createTask: async (req, res) => {
    try {
      const { title, description, priority, status, assignee, dueDate } = req.body;
      
      const result = await pool.query(`
        INSERT INTO tasks (title, description, priority, status, assignee, due_date, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `, [title, description, priority, status, assignee || null, dueDate]);
      
      const newTask = result.rows[0];
      
      // Emit to all connected clients
      req.io.emit('taskCreated', newTask);
      
      res.status(201).json(newTask);
    } catch (err) {
      console.error('Error creating task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update task
  updateTask: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, priority, status, assignee, dueDate } = req.body;
      
      const result = await pool.query(`
        UPDATE tasks 
        SET title = $1, description = $2, priority = $3, status = $4, 
            assignee = $5, due_date = $6, updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `, [title, description, priority, status, assignee || null, dueDate, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const updatedTask = result.rows[0];
      
      // Emit to all connected clients
      req.io.emit('taskUpdated', updatedTask);
      
      res.json(updatedTask);
    } catch (err) {
      console.error('Error updating task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Delete task
  deleteTask: async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Emit to all connected clients
      req.io.emit('taskDeleted', parseInt(id));
      
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
      const result = await pool.query(`
        SELECT t.*, u.name as assignee_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        WHERE t.status = $1 
        ORDER BY t.created_at DESC
      `, [status]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching tasks by status:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get tasks by assignee
  getTasksByAssignee: async (req, res) => {
    try {
      const { assignee } = req.params;
      const result = await pool.query(`
        SELECT t.*, u.name as assignee_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        WHERE t.assignee = $1 
        ORDER BY t.created_at DESC
      `, [assignee]);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching tasks by assignee:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = taskController;