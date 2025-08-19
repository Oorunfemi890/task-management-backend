// scripts/addUserColumns.js
// Migration script to add new columns to users table and create user_settings table

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'taskmanagement',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

async function migrateDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migration...');
    
    // Add new columns to users table
    console.log('Adding new columns to users table...');
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(255)
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255)
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(255)
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC'
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member'
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
    `);
    
    console.log('New columns added to users table successfully!');
    
    // Create user_settings table
    console.log('Creating user_settings table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);
    
    console.log('user_settings table created successfully!');
    
    // Create indexes for better performance
    console.log('Creating indexes...');
    
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_settings_settings ON user_settings USING GIN(settings)');
    
    console.log('Indexes created successfully!');
    
    // Update existing users with default values
    console.log('Updating existing users with default values...');
    
    await client.query(`
      UPDATE users 
      SET 
        timezone = 'UTC',
        role = 'member',
        updated_at = CURRENT_TIMESTAMP
      WHERE timezone IS NULL OR role IS NULL OR updated_at IS NULL
    `);
    
    console.log('Existing users updated successfully!');
    
    console.log('Database migration completed successfully!');
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Add email configuration validation
function validateEmailConfig() {
  const requiredEnvVars = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn('⚠️  Email configuration incomplete. Missing environment variables:', missingVars.join(', '));
    console.warn('   Password reset emails will not work without proper email configuration.');
    console.warn('   Please add these to your .env file:');
    console.warn('   EMAIL_HOST=smtp.gmail.com');
    console.warn('   EMAIL_PORT=587');
    console.warn('   EMAIL_USER=your-email@gmail.com');
    console.warn('   EMAIL_PASS=your-app-password');
    console.warn('   EMAIL_FROM=noreply@taskflow.com');
  } else {
    console.log('✅ Email configuration looks good!');
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('✅ Migration script completed successfully!');
      validateEmailConfig();
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateDatabase;