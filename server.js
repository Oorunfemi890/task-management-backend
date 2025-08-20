// server.js (Updated with JWT)
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Import routes
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const teamRoutes = require('./routes/teamRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Import socket handler
const initializeSocket = require('./sockets/socketHandler');

// Import database connection
const pool = require('./config/database');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with authentication
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize socket handlers with authentication
initializeSocket(io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
  });
}

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/projects', authenticate, projectRoutes); // Protected
app.use('/api/team', authenticate, teamRoutes); // Protected

// Auth routes (for backward compatibility and refresh token)
const authRouter = express.Router();
authRouter.post('/refresh', require('./middleware/auth').refreshToken);
app.use('/api/auth', authRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'TaskFlow API Server',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      auth: '/api/users/login',
      register: '/api/users/register',
      tasks: '/api/tasks',
      projects: '/api/projects',
      team: '/api/team'
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler.notFound);
app.use(errorHandler.errorHandler);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 TaskFlow API Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`🗄️ Database: ${process.env.DB_NAME || 'taskmanagement'}`);
  console.log(`⚡ Socket.IO enabled for real-time features`);
  console.log(`🔐 JWT Authentication enabled`);
  
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  WARNING: JWT_SECRET not set in environment variables!');
  }
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  WARNING: Email configuration incomplete. Password reset will not work.');
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    pool.end(() => {
      console.log('Database connection closed.');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    pool.end(() => {
      console.log('Database connection closed.');
      process.exit(0);
    });
  });
});

module.exports = { app, server, io };