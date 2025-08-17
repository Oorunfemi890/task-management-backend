// controllers/userController.js
const pool = require('../config/database');
const bcrypt = require("bcrypt");

const userController = {
  // Get current user (for /api/auth/me endpoint)
  getCurrentUser: async (req, res) => {
    try {
      // For now, since you don't have JWT middleware, let's return the first user
      // This is a temporary solution until you implement proper authentication
      const authHeader = req.headers.authorization;
      
      // Simple token validation (temporary)
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // For now, just return the first user (you'll need proper JWT later)
      const result = await pool.query(`
        SELECT id, name, email, avatar, created_at 
        FROM users 
        ORDER BY id 
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        user: result.rows[0]
      });
    } catch (err) {
      console.error('Error getting current user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Login user
  loginUser: async (req, res) => {
    try {
      const { email, password } = req.body;

      // 1. Check if user exists
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];

      // 2. Check if password exists (for users created without password)
      if (!user.password) {
        return res.status(401).json({ error: 'Account needs password setup. Please contact administrator.' });
      }

      // 3. Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // 4. If login successful, return user data (you'll add JWT token later)
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        }
      });
    } catch (err) {
      console.error('Error logging in user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get all users (team members)
  getAllUsers: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, name, email, avatar, created_at 
        FROM users 
        ORDER BY name
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get user by ID
  getUserById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT id, name, email, avatar, created_at 
        FROM users 
        WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Create new user
  createUser: async (req, res) => {
    try {
      console.log('Registration request body:', req.body); // Debug log
      
      const { name, email, password, company, role } = req.body;

      // 1. Check if email already exists
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        console.log('Email already exists:', email); // Debug log
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
      const hashedPassword = await bcrypt.hash(password, 10); // 10 = salt rounds

      // 4. Insert user with hashed password
      const result = await pool.query(
        `
        INSERT INTO users (name, email, avatar, password, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, name, email, avatar, created_at
        `,
        [name, email, avatar, hashedPassword]
      );

      console.log('User created successfully:', result.rows[0]); // Debug log
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating user:', err);
      if (err.code === '23505') {
        // PostgreSQL unique constraint violation
        res.status(400).json({ 
          error: 'Email already exists',
          message: 'An account with this email address already exists. Please use a different email or try logging in.'
        });
      } else {
        res.status(500).json({ 
          error: 'Internal server error',
          message: 'Something went wrong while creating your account. Please try again.'
        });
      }
    }
  },

  // Update user
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, avatar } = req.body;

      const result = await pool.query(`
        UPDATE users 
        SET name = $1, email = $2, avatar = $3
        WHERE id = $4
        RETURNING id, name, email, avatar, created_at
      `, [name, email, avatar, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error updating user:', err);
      if (err.code === '23505') { // Unique constraint violation
        res.status(400).json({ error: 'Email already exists' });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  },

  // Delete user
  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(204).send();
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = userController;