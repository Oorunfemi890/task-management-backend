// controllers/projectController.js
const pool = require('../config/database');

const projectController = {
  // Get all projects with team members
  getAllProjects: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          p.*,
          u.name as created_by_name,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', pm_user.id,
                'name', pm_user.name,
                'email', pm_user.email,
                'avatar', pm_user.avatar,
                'role', pm.role
              )
            ) FILTER (WHERE pm_user.id IS NOT NULL), 
            '[]'
          ) as team_members,
          COALESCE(
            json_agg(DISTINCT pt.tag) FILTER (WHERE pt.tag IS NOT NULL), 
            '[]'
          ) as tags,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', pg.id,
                'goal', pg.goal,
                'completed', pg.completed
              )
            ) FILTER (WHERE pg.id IS NOT NULL),
            '[]'
          ) as goals
        FROM projects p
        LEFT JOIN users u ON p.created_by = u.id
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN users pm_user ON pm.user_id = pm_user.id
        LEFT JOIN project_tags pt ON p.id = pt.project_id
        LEFT JOIN project_goals pg ON p.id = pg.project_id
        GROUP BY p.id, u.name
        ORDER BY p.created_at DESC
      `);
      
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching projects:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get project by ID
  getProjectById: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT 
          p.*,
          u.name as created_by_name,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', pm_user.id,
                'name', pm_user.name,
                'email', pm_user.email,
                'avatar', pm_user.avatar,
                'role', pm.role
              )
            ) FILTER (WHERE pm_user.id IS NOT NULL), 
            '[]'
          ) as team_members,
          COALESCE(
            json_agg(DISTINCT pt.tag) FILTER (WHERE pt.tag IS NOT NULL), 
            '[]'
          ) as tags,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', pg.id,
                'goal', pg.goal,
                'completed', pg.completed
              )
            ) FILTER (WHERE pg.id IS NOT NULL),
            '[]'
          ) as goals
        FROM projects p
        LEFT JOIN users u ON p.created_by = u.id
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN users pm_user ON pm.user_id = pm_user.id
        LEFT JOIN project_tags pt ON p.id = pt.project_id
        LEFT JOIN project_goals pg ON p.id = pg.project_id
        WHERE p.id = $1
        GROUP BY p.id, u.name
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error fetching project:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Create new project
  createProject: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { 
        name, 
        description, 
        status = 'not_started', 
        priority = 'medium', 
        startDate, 
        dueDate, 
        budget, 
        client: clientName, 
        teamMembers = [], 
        tags = [], 
        goals = [],
        createdBy 
      } = req.body;

      // Insert project
      const projectResult = await client.query(`
        INSERT INTO projects (name, description, status, priority, start_date, due_date, budget, client, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *
      `, [name, description, status, priority, startDate || null, dueDate || null, budget || null, clientName || null, createdBy]);

      const newProject = projectResult.rows[0];

      // Insert team members
      if (teamMembers && teamMembers.length > 0) {
        const memberValues = teamMembers.map((memberId, index) => 
          `($1, $${index + 2}, 'member')`
        ).join(', ');
        
        const memberParams = [newProject.id, ...teamMembers];
        await client.query(`
          INSERT INTO project_members (project_id, user_id, role) 
          VALUES ${memberValues}
        `, memberParams);
      }

      // Insert tags
      if (tags && tags.length > 0) {
        const tagValues = tags.map((tag, index) => 
          `($1, $${index + 2})`
        ).join(', ');
        
        const tagParams = [newProject.id, ...tags];
        await client.query(`
          INSERT INTO project_tags (project_id, tag) 
          VALUES ${tagValues}
        `, tagParams);
      }

      // Insert goals
      if (goals && goals.length > 0) {
        const goalValues = goals.map((goal, index) => 
          `($1, $${index + 2}, false)`
        ).join(', ');
        
        const goalParams = [newProject.id, ...goals];
        await client.query(`
          INSERT INTO project_goals (project_id, goal, completed) 
          VALUES ${goalValues}
        `, goalParams);
      }

      await client.query('COMMIT');

      // Emit to all connected clients (if socket.io is available)
      if (req.io) {
        req.io.emit('projectCreated', newProject);
      }

      res.status(201).json(newProject);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error creating project:', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  // Update project
  updateProject: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { 
        name, 
        description, 
        status, 
        priority, 
        startDate, 
        dueDate, 
        budget, 
        client: clientName, 
        teamMembers = [], 
        tags = [], 
        goals = [] 
      } = req.body;

      // Update project
      const projectResult = await client.query(`
        UPDATE projects 
        SET name = $1, description = $2, status = $3, priority = $4, 
            start_date = $5, due_date = $6, budget = $7, client = $8, updated_at = NOW()
        WHERE id = $9
        RETURNING *
      `, [name, description, status, priority, startDate || null, dueDate || null, budget || null, clientName || null, id]);

      if (projectResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Project not found' });
      }

      const updatedProject = projectResult.rows[0];

      // Update team members (remove all and re-add)
      await client.query('DELETE FROM project_members WHERE project_id = $1', [id]);
      if (teamMembers && teamMembers.length > 0) {
        const memberValues = teamMembers.map((memberId, index) => 
          `($1, $${index + 2}, 'member')`
        ).join(', ');
        
        const memberParams = [id, ...teamMembers];
        await client.query(`
          INSERT INTO project_members (project_id, user_id, role) 
          VALUES ${memberValues}
        `, memberParams);
      }

      // Update tags (remove all and re-add)
      await client.query('DELETE FROM project_tags WHERE project_id = $1', [id]);
      if (tags && tags.length > 0) {
        const tagValues = tags.map((tag, index) => 
          `($1, $${index + 2})`
        ).join(', ');
        
        const tagParams = [id, ...tags];
        await client.query(`
          INSERT INTO project_tags (project_id, tag) 
          VALUES ${tagValues}
        `, tagParams);
      }

      // Update goals (remove all and re-add)
      await client.query('DELETE FROM project_goals WHERE project_id = $1', [id]);
      if (goals && goals.length > 0) {
        const goalValues = goals.map((goal, index) => 
          `($1, $${index + 2}, false)`
        ).join(', ');
        
        const goalParams = [id, ...goals];
        await client.query(`
          INSERT INTO project_goals (project_id, goal, completed) 
          VALUES ${goalValues}
        `, goalParams);
      }

      await client.query('COMMIT');

      // Emit to all connected clients
      if (req.io) {
        req.io.emit('projectUpdated', updatedProject);
      }

      res.json(updatedProject);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error updating project:', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  // Delete project
  deleteProject: async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Emit to all connected clients
      if (req.io) {
        req.io.emit('projectDeleted', parseInt(id));
      }
      
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting project:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get project tasks
  getProjectTasks: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT t.*, u.name as assignee_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assignee = u.id 
        WHERE t.project_id = $1 
        ORDER BY t.created_at DESC
      `, [id]);
      
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching project tasks:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get project statistics
  getProjectStats: async (req, res) => {
    try {
      const { id } = req.params;
      
      const statsResult = await pool.query(`
        SELECT 
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
          COUNT(CASE WHEN t.status = 'inprogress' THEN 1 END) as in_progress_tasks,
          COUNT(CASE WHEN t.status = 'todo' THEN 1 END) as todo_tasks,
          COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status != 'done' THEN 1 END) as overdue_tasks
        FROM tasks t 
        WHERE t.project_id = $1
      `, [id]);

      const teamResult = await pool.query(`
        SELECT COUNT(pm.user_id) as team_size
        FROM project_members pm
        WHERE pm.project_id = $1
      `, [id]);

      const stats = {
        ...statsResult.rows[0],
        team_size: parseInt(teamResult.rows[0].team_size),
        completion_rate: statsResult.rows[0].total_tasks > 0 
          ? Math.round((statsResult.rows[0].completed_tasks / statsResult.rows[0].total_tasks) * 100)
          : 0
      };

      res.json(stats);
    } catch (err) {
      console.error('Error fetching project stats:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = projectController;