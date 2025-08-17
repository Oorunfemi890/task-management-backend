// server.js (Main entry point)
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const projectRoutes = require('./routes/projectRoutes');
const teamRoutes = require('./routes/teamRoutes');

// Import routes
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import socket handler
const initializeSocket = require('./sockets/socketHandler');

// Import database connection
const pool = require('./config/database');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Initialize socket handlers
initializeSocket(io);

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api/projects', projectRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/auth', userRoutes);

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});



// Error handling middleware
app.use(errorHandler.notFound);
app.use(errorHandler.errorHandler);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});