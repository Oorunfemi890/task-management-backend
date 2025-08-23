// scripts/setupProjectMessaging.js - FINAL FIXED VERSION
// Comprehensive migration script for project messaging and enhanced notifications

const { Pool } = require("pg");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "taskmanagement",
  password: process.env.DB_PASSWORD || "password",
  port: process.env.DB_PORT || 5432,
});

async function setupProjectMessaging() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting project messaging setup...");

    // Start transaction
    await client.query("BEGIN");

    // 1. Create project messages table
    console.log("📝 Creating project_messages table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_messages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
        reply_to INTEGER REFERENCES project_messages(id) ON DELETE SET NULL,
        attachment_url TEXT,
        attachment_name VARCHAR(255),
        attachment_size INTEGER,
        attachment_type VARCHAR(100),
        is_edited BOOLEAN DEFAULT FALSE,
        edited_at TIMESTAMP,
        is_archived BOOLEAN DEFAULT FALSE,
        archived_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Create message reactions table
    console.log("😀 Creating message_reactions table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES project_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id, emoji)
      )
    `);

    // 3. Create project chat participants table
    console.log("👥 Creating project_chat_participants table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_chat_participants (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message_read INTEGER REFERENCES project_messages(id) ON DELETE SET NULL,
        is_online BOOLEAN DEFAULT FALSE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, user_id)
      )
    `);

    // 4. Enhance notifications table - FIXED VERSION
    console.log("🔔 Enhancing notifications table...");

    // First, check if the existing constraint exists and what values it allows
    const constraintCheck = await client.query(`
  SELECT cc.constraint_name, cc.check_clause
  FROM information_schema.check_constraints cc
  JOIN information_schema.constraint_column_usage ccu 
    ON cc.constraint_name = ccu.constraint_name
  WHERE ccu.table_name = 'notifications' 
    AND ccu.column_name = 'type'
`);

    // Drop the existing type constraint if it exists
    if (constraintCheck.rows.length > 0) {
      const constraintName = constraintCheck.rows[0].constraint_name;
      console.log(`   ✓ Found existing constraint: ${constraintName}`);
      await client.query(
        `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS ${constraintName}`
      );
      console.log(`   ✓ Dropped existing type constraint`);
    }

    // Add the new enhanced constraint with all notification types
    await client.query(`
      ALTER TABLE notifications ADD CONSTRAINT notifications_type_enhanced_check 
      CHECK (type IN (
        'info', 'success', 'warning', 'error', 'task', 'project', 'comment',
        'project_invitation', 'project_message', 'task_assigned', 'task_completed',
        'team_mention', 'mention', 'deadline_reminder', 'task_overdue', 
        'member_added', 'system'
      ))
    `);
    console.log(
      `   ✓ Added enhanced type constraint with all notification types`
    );

    // Add new columns
    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE
    `);
    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE
    `);
    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES project_messages(id) ON DELETE CASCADE
    `);
    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT
    `);
    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
    `);

    // 5. Create project activity table
    console.log("📊 Creating project_activity table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_activity (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        activity_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Create user online status table
    console.log("🟢 Creating user_online_status table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_online_status (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        current_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        socket_id VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Create project settings table
    console.log("⚙️ Creating project_settings table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_settings (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        setting_key VARCHAR(100) NOT NULL,
        setting_value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, setting_key)
      )
    `);

    // 8. Enhance comments table
    console.log("💬 Enhancing comments table...");
    await client.query(`
      ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_project_visible BOOLEAN DEFAULT TRUE
    `);
    await client.query(`
      ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP
    `);
    await client.query(`
      ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_by INTEGER REFERENCES users(id)
    `);

    // 9. Create performance indexes
    console.log("🚀 Creating performance indexes...");

    // Project messages indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON project_messages(project_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_messages_user_id ON project_messages(user_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_messages_created_at ON project_messages(created_at)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_messages_type ON project_messages(message_type)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_messages_archived ON project_messages(is_archived)"
    );

    // Message reactions indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id)"
    );

    // Project chat participants indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_chat_participants_project_id ON project_chat_participants(project_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_chat_participants_user_id ON project_chat_participants(user_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_chat_participants_online ON project_chat_participants(is_online)"
    );

    // Enhanced notification indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON notifications(project_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_notifications_task_id ON notifications(task_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_notifications_message_id ON notifications(message_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority)"
    );

    // Project activity indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_activity_project_id ON project_activity(project_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_activity_type ON project_activity(activity_type)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_project_activity_created_at ON project_activity(created_at)"
    );

    // User online status indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_user_online_status_status ON user_online_status(status)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_user_online_status_project ON user_online_status(current_project_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_user_online_status_activity ON user_online_status(last_activity)"
    );

    // 10. Create utility functions
    console.log("🔧 Creating utility functions...");

    // Drop existing functions first to avoid conflicts
    await client.query(
      "DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE"
    );
    await client.query(
      "DROP FUNCTION IF EXISTS log_project_activity(INTEGER, INTEGER, VARCHAR, TEXT, JSONB) CASCADE"
    );
    await client.query(
      "DROP FUNCTION IF EXISTS notify_project_members(INTEGER, VARCHAR, VARCHAR, TEXT, JSONB, INTEGER, VARCHAR) CASCADE"
    );

    // Function for automatic timestamps (fixed syntax)
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER 
      LANGUAGE plpgsql
      AS $function$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $function$
    `);

    // Create triggers for automatic timestamp updates
    await client.query(`
      DROP TRIGGER IF EXISTS update_project_messages_updated_at ON project_messages
    `);
    await client.query(`
      CREATE TRIGGER update_project_messages_updated_at 
          BEFORE UPDATE ON project_messages 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_project_settings_updated_at ON project_settings
    `);
    await client.query(`
      CREATE TRIGGER update_project_settings_updated_at 
          BEFORE UPDATE ON project_settings 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_user_online_status_updated_at ON user_online_status
    `);
    await client.query(`
      CREATE TRIGGER update_user_online_status_updated_at 
          BEFORE UPDATE ON user_online_status 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // Function to log project activity (fixed syntax)
    await client.query(`
      CREATE OR REPLACE FUNCTION log_project_activity(
          p_project_id INTEGER,
          p_user_id INTEGER,
          p_activity_type VARCHAR(50),
          p_description TEXT,
          p_metadata JSONB DEFAULT '{}'
      ) 
      RETURNS void 
      LANGUAGE plpgsql
      AS $function$
      BEGIN
          INSERT INTO project_activity (project_id, user_id, activity_type, description, metadata)
          VALUES (p_project_id, p_user_id, p_activity_type, p_description, p_metadata);
      END;
      $function$
    `);

    // Function to notify project members (fixed syntax)
    await client.query(`
      CREATE OR REPLACE FUNCTION notify_project_members(
          p_project_id INTEGER,
          p_notification_type VARCHAR(50),
          p_title VARCHAR(255),
          p_message TEXT,
          p_data JSONB DEFAULT '{}',
          p_exclude_user_id INTEGER DEFAULT NULL,
          p_priority VARCHAR(10) DEFAULT 'normal'
      ) 
      RETURNS void 
      LANGUAGE plpgsql
      AS $function$
      DECLARE
          member_id INTEGER;
      BEGIN
          FOR member_id IN 
              SELECT DISTINCT user_id FROM (
                  SELECT created_by as user_id FROM projects WHERE id = p_project_id
                  UNION
                  SELECT user_id FROM project_members WHERE project_id = p_project_id
              ) AS all_members
              WHERE user_id IS NOT NULL 
              AND (p_exclude_user_id IS NULL OR user_id != p_exclude_user_id)
          LOOP
              INSERT INTO notifications (user_id, type, title, message, data, project_id, priority)
              VALUES (member_id, p_notification_type, p_title, p_message, p_data, p_project_id, p_priority);
          END LOOP;
      END;
      $function$
    `);

    // 11. Create uploads directory structure
    console.log("📁 Creating uploads directory structure...");

    const uploadDirs = [
      "uploads",
      "uploads/messages",
      "uploads/avatars",
      "uploads/attachments",
      "uploads/temp",
    ];

    for (const dir of uploadDirs) {
      const dirPath = path.join(__dirname, "..", dir);
      try {
        await fs.access(dirPath);
        console.log(`   ✓ Directory ${dir} already exists`);
      } catch {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`   ✓ Created directory ${dir}`);
      }
    }

    // Create .gitkeep files to ensure directories are tracked
    for (const dir of uploadDirs) {
      const gitkeepPath = path.join(__dirname, "..", dir, ".gitkeep");
      try {
        await fs.writeFile(gitkeepPath, "");
        console.log(`   ✓ Created .gitkeep in ${dir}`);
      } catch (error) {
        console.warn(
          `   ⚠ Could not create .gitkeep in ${dir}:`,
          error.message
        );
      }
    }

    // 12. Insert sample data (optional) - FIXED
    console.log("🌟 Inserting sample data...");

    // Check if we have any projects to work with
    const existingProjects = await client.query(
      "SELECT id FROM projects LIMIT 1"
    );

    if (existingProjects.rows.length > 0) {
      const projectId = existingProjects.rows[0].id;

      // Get some users
      const users = await client.query("SELECT id FROM users LIMIT 3");

      if (users.rows.length >= 2) {
        const [user1, user2] = users.rows;

        // Insert sample messages
        const existingMessages = await client.query(
          "SELECT COUNT(*) as count FROM project_messages WHERE project_id = $1",
          [projectId]
        );

        if (parseInt(existingMessages.rows[0].count) === 0) {
          await client.query(
            `
            INSERT INTO project_messages (project_id, user_id, message, message_type) 
            VALUES 
            ($1, $2, 'Welcome to the project! Let''s collaborate effectively.', 'text'),
            ($1, $3, 'Thanks! Looking forward to working together.', 'text'),
            ($1, $2, 'I''ve uploaded the initial project requirements. Please review when you have time.', 'text')
          `,
            [projectId, user1.id, user2.id]
          );
        }

        // Insert sample project activity
        await client.query(
          `
          SELECT log_project_activity($1, $2, 'project_setup', 'Project messaging system initialized')
        `,
          [projectId, user1.id]
        );

        // Create sample notification - FIXED with valid notification type
        await client.query(
          `
          SELECT notify_project_members($1, $2, $3, $4, $5::jsonb)
        `,
          [
            projectId,
            "project_invitation", // Changed from 'system' to valid type
            "Project Messaging Enabled",
            "Real-time messaging has been enabled for this project. You can now chat with your team members!",
            JSON.stringify({
              feature: "messaging",
              action_url: `/projects/${projectId}`,
            }),
          ]
        );

        console.log(`   ✓ Added sample data for project ${projectId}`);
      }
    }

    // Commit transaction
    await client.query("COMMIT");

    console.log("✅ Project messaging setup completed successfully!");
    console.log("\n📋 What was created:");
    console.log("   • project_messages table for storing chat messages");
    console.log("   • message_reactions table for emoji reactions");
    console.log(
      "   • project_chat_participants table for tracking online users"
    );
    console.log("   • Enhanced notifications table with project support");
    console.log("   • project_activity table for activity logging");
    console.log("   • user_online_status table for user presence");
    console.log("   • project_settings table for project preferences");
    console.log("   • Utility functions for logging and notifications");
    console.log("   • Performance indexes for better query speed");
    console.log("   • Upload directory structure");
    console.log("   • Sample data for testing");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function verifyInstallation() {
  const client = await pool.connect();

  try {
    console.log("\n🔍 Verifying installation...");

    const tables = [
      "project_messages",
      "message_reactions",
      "project_chat_participants",
      "project_activity",
      "user_online_status",
      "project_settings",
    ];

    for (const table of tables) {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );

      if (parseInt(result.rows[0].count) === 1) {
        console.log(`   ✓ Table ${table} exists`);
      } else {
        console.log(`   ❌ Table ${table} missing`);
      }
    }

    // Check functions
    const functions = [
      "log_project_activity",
      "notify_project_members",
      "update_updated_at_column",
    ];

    for (const func of functions) {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM information_schema.routines 
         WHERE routine_schema = 'public' AND routine_name = $1`,
        [func]
      );

      if (parseInt(result.rows[0].count) >= 1) {
        console.log(`   ✓ Function ${func} exists`);
      } else {
        console.log(`   ❌ Function ${func} missing`);
      }
    }

    // Check notification types constraint
    const typeConstraint = await client.query(`
      SELECT check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
      WHERE ccu.table_name = 'notifications' AND ccu.column_name = 'type'
    `);

    if (typeConstraint.rows.length > 0) {
      console.log(`   ✓ Notification type constraint updated`);
    } else {
      console.log(`   ❌ Notification type constraint missing`);
    }

    console.log("\n✅ Installation verification completed!");
  } catch (error) {
    console.error("❌ Verification failed:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  setupProjectMessaging()
    .then(async () => {
      await verifyInstallation();
      console.log("\n🎉 Project messaging system is ready!");
      console.log("\n📝 Next steps:");
      console.log("1. Install required npm packages:");
      console.log("   npm install multer express-rate-limit");
      console.log("2. Update your server.js file with the new routes");
      console.log("3. Add the new frontend components to your React app");
      console.log("4. Configure environment variables:");
      console.log("   - Make sure JWT_SECRET is set");
      console.log("   - Configure FRONTEND_URL for CORS");
      console.log("   - Set up EMAIL settings for notifications");
      console.log("5. Restart your server to apply changes");
      console.log("6. Test the messaging system in your projects");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Migration failed:", error);
      process.exit(1);
    });
}

module.exports = { setupProjectMessaging, verifyInstallation };
