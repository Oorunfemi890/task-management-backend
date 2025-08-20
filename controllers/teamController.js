// controllers/teamController.js
const pool = require('../config/database');

const teamController = {
  // Get all team members
  getAllMembers: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, name, email, avatar, created_at 
        FROM users 
        ORDER BY name
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching team members:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get member by ID
  getMemberById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT id, name, email, avatar, created_at 
        FROM users 
        WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Team member not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching team member:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = teamController;