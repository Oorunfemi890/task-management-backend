// scripts/setupDatabase.js
// Updated version with projects table

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'postgres', // Connect to default database first
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database setup...');
    
    // Check if database exists
    const dbCheckResult = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'taskmanagement'"
    );
    
    if (dbCheckResult.rows.length === 0) {
      console.log('Creating database: taskmanagement');
      await client.query('CREATE DATABASE taskmanagement');
    } else {
      console.log('Database taskmanagement already exists');
    }
    
    client.release();
    
    // Connect to the taskmanagement database
    const appPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: 'taskmanagement',
      password: process.env.DB_PASSWORD || 'password',
      port: process.env.DB_PORT || 5432,
    });
    
    const appClient = await appPool.connect();
    
    try {
      // Create tables
      console.log('Creating tables...');
      
      // Users table (updated with password)
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          avatar VARCHAR(10),
          password VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add password column if it doesn't exist
      await appClient.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)
      `);
      
      // Projects table (NEW)
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'on_hold', 'completed', 'cancelled')),
          priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
          start_date DATE,
          due_date DATE,
          budget DECIMAL(12, 2),
          client VARCHAR(255),
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Project members table (many-to-many relationship)
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS project_members (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(50) DEFAULT 'member',
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, user_id)
        )
      `);

      // Project tags table
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS project_tags (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          tag VARCHAR(50) NOT NULL
        )
      `);

      // Project goals table
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS project_goals (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          goal TEXT NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Tasks table (updated to include project reference)
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
          status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'inprogress', 'review', 'done')),
          assignee INTEGER REFERENCES users(id) ON DELETE SET NULL,
          project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
          due_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add project_id column to existing tasks table if it doesn't exist
      await appClient.query(`
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL
      `);
      
      // Comments table
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Task activity table
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS task_activity (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(50) NOT NULL,
          old_value TEXT,
          new_value TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('Creating indexes...');
      
      // Create indexes
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_activity_task_id ON task_activity(task_id)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id)');
      
      // Check if sample data exists
      const userCount = await appClient.query('SELECT COUNT(*) FROM users');
      
      if (parseInt(userCount.rows[0].count) === 0) {
        console.log('Inserting sample data...');
        
        // Insert sample users with passwords
        await appClient.query(`
          INSERT INTO users (name, email, avatar, password) VALUES 
          ('John Doe', 'john.doe@example.com', 'JD', '$2b$10$rQ8qT2xJv5YP9j6H8XxJnOJ5CvDJ9kP2F1L4M6N8Q3R7S9T2V5X8Y1'),
          ('Jane Smith', 'jane.smith@example.com', 'JS', '$2b$10$rQ8qT2xJv5YP9j6H8XxJnOJ5CvDJ9kP2F1L4M6N8Q3R7S9T2V5X8Y1'),
          ('Mike Johnson', 'mike.johnson@example.com', 'MJ', '$2b$10$rQ8qT2xJv5YP9j6H8XxJnOJ5CvDJ9kP2F1L4M6N8Q3R7S9T2V5X8Y1'),
          ('Sarah Wilson', 'sarah.wilson@example.com', 'SW', '$2b$10$rQ8qT2xJv5YP9j6H8XxJnOJ5CvDJ9kP2F1L4M6N8Q3R7S9T2V5X8Y1'),
          ('David Brown', 'david.brown@example.com', 'DB', '$2b$10$rQ8qT2xJv5YP9j6H8XxJnOJ5CvDJ9kP2F1L4M6N8Q3R7S9T2V5X8Y1')
        `);

        // Insert sample projects
        await appClient.query(`
          INSERT INTO projects (name, description, status, priority, start_date, due_date, budget, client, created_by) VALUES 
          ('E-Commerce Website', 'Build a modern e-commerce platform with payment integration', 'in_progress', 'high', '2024-01-01', '2024-06-30', 50000.00, 'TechCorp Inc', 1),
          ('Mobile App Development', 'Create a cross-platform mobile application', 'not_started', 'medium', '2024-02-01', '2024-08-31', 30000.00, 'StartupXYZ', 2),
          ('Database Migration', 'Migrate legacy database to modern cloud infrastructure', 'in_progress', 'high', '2024-01-15', '2024-04-15', 25000.00, 'Enterprise Solutions', 1),
          ('UI/UX Redesign', 'Complete redesign of the company website', 'completed', 'medium', '2023-10-01', '2023-12-31', 15000.00, 'Design Studio', 3)
        `);

        // Insert project members
        await appClient.query(`
          INSERT INTO project_members (project_id, user_id, role) VALUES 
          (1, 1, 'lead'),
          (1, 2, 'developer'),
          (1, 3, 'developer'),
          (2, 2, 'lead'),
          (2, 4, 'designer'),
          (2, 5, 'developer'),
          (3, 1, 'lead'),
          (3, 5, 'developer'),
          (4, 3, 'lead'),
          (4, 4, 'designer')
        `);

        // Insert project tags
        await appClient.query(`
          INSERT INTO project_tags (project_id, tag) VALUES 
          (1, 'react'),
          (1, 'nodejs'),
          (1, 'ecommerce'),
          (2, 'mobile'),
          (2, 'react-native'),
          (3, 'database'),
          (3, 'migration'),
          (4, 'design'),
          (4, 'ui/ux')
        `);

        // Insert project goals
        await appClient.query(`
          INSERT INTO project_goals (project_id, goal, completed) VALUES 
          (1, 'Setup project structure and basic authentication', true),
          (1, 'Implement product catalog and shopping cart', false),
          (1, 'Integrate payment gateway', false),
          (1, 'Deploy to production', false),
          (2, 'Create app wireframes and designs', true),
          (2, 'Develop core app functionality', false),
          (2, 'Implement push notifications', false),
          (3, 'Backup existing database', true),
          (3, 'Setup new cloud infrastructure', false),
          (3, 'Migrate data and test', false)
        `);
        
        // Insert sample tasks (updated with project_id)
        await appClient.query(`
          INSERT INTO tasks (title, description, priority, status, assignee, project_id, due_date) VALUES 
          ('Setup Project Repository', 'Initialize the Git repository and setup basic project structure', 'high', 'done', 1, 1, '2024-01-15'),
          ('Design Database Schema', 'Create the database schema for the e-commerce platform', 'high', 'done', 2, 1, '2024-01-18'),
          ('Implement User Authentication', 'Add login and registration functionality', 'medium', 'inprogress', 1, 1, '2024-02-01'),
          ('Create Product Catalog', 'Implement product listing and search functionality', 'high', 'inprogress', 3, 1, '2024-02-05'),
          ('Mobile App Wireframes', 'Create wireframes for mobile application', 'medium', 'done', 4, 2, '2024-02-10'),
          ('API Development', 'Develop REST APIs for mobile app', 'high', 'todo', 2, 2, '2024-02-15'),
          ('Database Backup', 'Backup existing legacy database', 'high', 'done', 1, 3, '2024-01-20'),
          ('Cloud Infrastructure Setup', 'Setup AWS infrastructure for migration', 'medium', 'inprogress', 5, 3, '2024-02-25'),
          ('Website Redesign', 'Complete redesign of company website', 'low', 'done', 3, 4, '2024-01-05'),
          ('User Testing', 'Conduct user testing for new design', 'medium', 'done', 4, 4, '2024-01-15')
        `);
        
        // Insert sample comments
        await appClient.query(`
          INSERT INTO comments (task_id, user_id, content) VALUES 
          (3, 2, 'I suggest we use JWT for authentication tokens.'),
          (3, 1, 'Agreed, JWT would be perfect for this use case.'),
          (4, 3, 'I''ve started working on the product catalog. The basic structure is ready.'),
          (6, 2, 'The API documentation is available in the project wiki.')
        `);
        
        // Insert sample activity
        await appClient.query(`
          INSERT INTO task_activity (task_id, user_id, action, old_value, new_value) VALUES 
          (1, 1, 'status_changed', 'inprogress', 'done'),
          (2, 2, 'status_changed', 'todo', 'done'),
          (3, 1, 'created', NULL, 'Implement User Authentication'),
          (4, 3, 'status_changed', 'todo', 'inprogress')
        `);
        
        console.log('Sample data inserted successfully!');
      } else {
        console.log('Sample data already exists, skipping insertion.');
      }
      
      console.log('Database setup completed successfully!');
      
    } catch (error) {
      console.error('Error setting up database:', error);
      throw error;
    } finally {
      appClient.release();
      await appPool.end();
    }
    
  } catch (error) {
    console.error('Error in database setup:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the setup if this file is executed directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('Database setup script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup script failed:', error);
      process.exit(1);
    });
}

module.exports = setupDatabase;