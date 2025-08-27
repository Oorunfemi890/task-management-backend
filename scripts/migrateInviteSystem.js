// scripts/migrateInviteSystem.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'taskmanagement',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

async function migrateInviteSystem() {
  const client = await pool.connect();

  try {
    console.log('Starting invite system migration...');

    // Start transaction
    await client.query('BEGIN');

    // 1. Create roles table
    console.log('Creating roles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Add role column to users table if it doesn't exist
    console.log('Adding role support to users table...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member'
    `);

    // 3. Create user_roles junction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, role_id)
      )
    `);

    // 4. Create invitations table
    console.log('Creating invitations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        role_id INTEGER NOT NULL REFERENCES roles(id),
        invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
        message TEXT,
        expires_at TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Create invite_links table
    console.log('Creating invite_links table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_links (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) UNIQUE NOT NULL,
        role_id INTEGER NOT NULL REFERENCES roles(id),
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_uses INTEGER DEFAULT NULL,
        used_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Create invite_link_usage table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_link_usage (
        id SERIAL PRIMARY KEY,
        invite_link_id INTEGER NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_address INET,
        user_agent TEXT,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Create indexes
    console.log('Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invite_links_token ON invite_links(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)');

    // 8. Insert default roles
    console.log('Inserting default roles...');
    await client.query(`
      INSERT INTO roles (name, description, permissions) VALUES 
        ('admin', 'Full system access with all permissions', '{
          "users": {"create": true, "read": true, "update": true, "delete": true},
          "projects": {"create": true, "read": true, "update": true, "delete": true},
          "tasks": {"create": true, "read": true, "update": true, "delete": true},
          "invites": {"create": true, "read": true, "update": true, "delete": true},
          "roles": {"create": true, "read": true, "update": true, "delete": true}
        }'),
        ('manager', 'Project and team management with limited admin access', '{
          "users": {"create": false, "read": true, "update": true, "delete": false},
          "projects": {"create": true, "read": true, "update": true, "delete": false},
          "tasks": {"create": true, "read": true, "update": true, "delete": true},
          "invites": {"create": true, "read": true, "update": false, "delete": false},
          "roles": {"create": false, "read": true, "update": false, "delete": false}
        }'),
        ('member', 'Basic team member access with task management', '{
          "users": {"create": false, "read": true, "update": false, "delete": false},
          "projects": {"create": false, "read": true, "update": false, "delete": false},
          "tasks": {"create": true, "read": true, "update": true, "delete": false},
          "invites": {"create": false, "read": false, "update": false, "delete": false},
          "roles": {"create": false, "read": false, "update": false, "delete": false}
        }')
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        permissions = EXCLUDED.permissions,
        updated_at = CURRENT_TIMESTAMP
    `);

    // 9. Migrate existing users to role system
    console.log('Migrating existing users to role system...');
    
    // Get all existing users
    const existingUsers = await client.query('SELECT id, role FROM users');
    
    for (const user of existingUsers.rows) {
      // Get role ID
      const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [user.role || 'member']);
      if (roleResult.rows.length > 0) {
        // Insert into user_roles if not exists
        await client.query(`
          INSERT INTO user_roles (user_id, role_id, assigned_by)
          VALUES ($1, $2, $1)
          ON CONFLICT (user_id, role_id) DO NOTHING
        `, [user.id, roleResult.rows[0].id]);
      }
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log('Invite system migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateInviteSystem()
    .then(() => {
      console.log('Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateInviteSystem;