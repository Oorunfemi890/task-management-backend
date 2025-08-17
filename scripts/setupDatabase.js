// scripts/setupDatabase.js
// Run this script to setup the database programmatically

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
      
      // Users table
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          avatar VARCHAR(10),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Tasks table
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
          status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'inprogress', 'review', 'done')),
          assignee INTEGER REFERENCES users(id) ON DELETE SET NULL,
          due_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
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
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id)');
      await appClient.query('CREATE INDEX IF NOT EXISTS idx_activity_task_id ON task_activity(task_id)');
      
      // Check if sample data exists
      const userCount = await appClient.query('SELECT COUNT(*) FROM users');
      
      if (parseInt(userCount.rows[0].count) === 0) {
        console.log('Inserting sample data...');
        
        // Insert sample users
        await appClient.query(`
          INSERT INTO users (name, email, avatar) VALUES 
          ('John Doe', 'john.doe@example.com', 'JD'),
          ('Jane Smith', 'jane.smith@example.com', 'JS'),
          ('Mike Johnson', 'mike.johnson@example.com', 'MJ'),
          ('Sarah Wilson', 'sarah.wilson@example.com', 'SW'),
          ('David Brown', 'david.brown@example.com', 'DB')
        `);
        
        // Insert sample tasks
        await appClient.query(`
          INSERT INTO tasks (title, description, priority, status, assignee, due_date) VALUES 
          ('Setup Project Repository', 'Initialize the Git repository and setup basic project structure', 'high', 'done', 1, '2024-01-15'),
          ('Design Database Schema', 'Create the database schema for the task management system', 'high', 'done', 2, '2024-01-18'),
          ('Implement User Authentication', 'Add login and registration functionality', 'medium', 'inprogress', 1, '2024-02-01'),
          ('Create Task CRUD Operations', 'Implement create, read, update, delete operations for tasks', 'high', 'inprogress', 3, '2024-02-05'),
          ('Add Real-time Updates', 'Implement Socket.io for real-time task updates', 'medium', 'todo', 2, '2024-02-10'),
          ('Design User Interface', 'Create wireframes and mockups for the application', 'low', 'review', 4, '2024-02-15'),
          ('Implement Drag and Drop', 'Add drag and drop functionality for task management', 'medium', 'todo', 1, '2024-02-20'),
          ('Add Team Collaboration Features', 'Implement commenting and activity tracking', 'low', 'todo', 5, '2024-02-25'),
          ('Setup CI/CD Pipeline', 'Configure automated testing and deployment', 'medium', 'todo', 3, '2024-03-01'),
          ('Write Documentation', 'Create user and developer documentation', 'low', 'todo', 4, '2024-03-05')
        `);
        
        // Insert sample comments
        await appClient.query(`
          INSERT INTO comments (task_id, user_id, content) VALUES 
          (3, 2, 'I suggest we use JWT for authentication tokens.'),
          (3, 1, 'Agreed, JWT would be perfect for this use case.'),
          (4, 3, 'I''ve completed the basic CRUD operations. Need to add validation.'),
          (6, 4, 'The wireframes are ready for review. Please check the design folder.')
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