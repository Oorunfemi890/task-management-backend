// scripts/addJwtSupport.js
// Migration script to add JWT support and additional tables

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'taskmanagement',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

async function migrateForJWT() {
  const client = await pool.connect();

  try {
    console.log('Starting JWT support migration...');

    // Add created_by column to tasks table if it doesn't exist
    console.log('Adding created_by column to tasks table...');
    await client.query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)
    `);

    // Set created_by for existing tasks (set to first user for demo)
    await client.query(`
      UPDATE tasks 
      SET created_by = (SELECT id FROM users LIMIT 1)
      WHERE created_by IS NULL
    `);

    // Create notifications table
    console.log('Creating notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'task', 'project', 'comment')),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_type CHECK (type IN ('info', 'success', 'warning', 'error', 'task', 'project', 'comment'))
      )
    `);

    // Create task_attachments table
    console.log('Creating task_attachments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_attachments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_sessions table (for tracking active sessions)
    console.log('Creating user_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        device_info JSONB DEFAULT '{}',
        ip_address INET,
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP
      )
    `);

    // Create activity_logs table (for audit trail)
    console.log('Creating activity_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id INTEGER,
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create team_invitations table
    console.log('Creating team_invitations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_invitations (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'member',
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add indexes for better performance
    console.log('Creating performance indexes...');

    // Tasks indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at)');

    // Notifications indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)');

    // Task attachments indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_attachments_user_id ON task_attachments(user_id)');

    // User sessions indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_at ON user_sessions(revoked_at)');

    // Activity logs indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at)');

    // Team invitations indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_team_invitations_expires_at ON team_invitations(expires_at)');

    // Update existing users with default timezone if not set
    console.log('Updating existing users with default values...');
    await client.query(`
      UPDATE users 
      SET timezone = COALESCE(timezone, 'UTC'),
          role = COALESCE(role, 'member'),
          updated_at = COALESCE(updated_at, created_at)
      WHERE timezone IS NULL OR role IS NULL OR updated_at IS NULL
    `);

    // Create a cleanup function for expired sessions
    console.log('Creating cleanup function for expired sessions...');
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
      RETURNS void AS $$
      BEGIN
        DELETE FROM user_sessions 
        WHERE expires_at < NOW() OR revoked_at IS NOT NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create a function to log activities
    console.log('Creating activity logging function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION log_activity(
        p_user_id INTEGER,
        p_action VARCHAR(100),
        p_resource_type VARCHAR(50),
        p_resource_id INTEGER DEFAULT NULL,
        p_old_values JSONB DEFAULT NULL,
        p_new_values JSONB DEFAULT NULL,
        p_ip_address INET DEFAULT NULL,
        p_user_agent TEXT DEFAULT NULL
      ) RETURNS void AS $$
      BEGIN
        INSERT INTO activity_logs (
          user_id, action, resource_type, resource_id, 
          old_values, new_values, ip_address, user_agent, created_at
        ) VALUES (
          p_user_id, p_action, p_resource_type, p_resource_id,
          p_old_values, p_new_values, p_ip_address, p_user_agent, NOW()
        );
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Insert sample notifications for testing
    console.log('Inserting sample notifications...');
    const usersResult = await client.query('SELECT id FROM users LIMIT 1');
    if (usersResult.rows.length > 0) {
      const userId = usersResult.rows[0].id;
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, data) VALUES 
        ($1, 'info', 'Welcome to TaskFlow!', 'Your account has been set up successfully. Start by creating your first project.', '{"action": "getting_started"}'),
        ($1, 'task', 'Task Assigned', 'You have been assigned a new task: "Setup Project Repository"', '{"task_id": 1, "action": "view_task"}')
      `, [userId]);
    }

    console.log('JWT support migration completed successfully!');

  } catch (error) {
    console.error('Error during JWT migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateForJWT()
    .then(() => {
      console.log('✅ JWT migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('1. Install jsonwebtoken: npm install jsonwebtoken');
      console.log('2. Set JWT_SECRET in your .env file');
      console.log('3. Restart your server');
      console.log('4. Test authentication endpoints');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ JWT migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateForJWT;