// server.js (Enhanced with new routes)
const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
require("dotenv").config();

// Import routes
const taskRoutes = require("./routes/taskRoutes");
const userRoutes = require("./routes/userRoutes");
const projectRoutes = require("./routes/projectRoutes");
const teamRoutes = require("./routes/teamRoutes");
const projectMessageRoutes = require("./routes/projectMessageRoutes"); // New
const notificationRoutes = require("./routes/notificationRoutes"); // New
const inviteRoutes = require("./routes/inviteRoutes");

// Import middleware
const errorHandler = require("./middleware/errorHandler");
const { authenticate } = require("./middleware/auth");

// Import socket handler
const initializeSocket = require("./sockets/socketHandler");

// Import database connection
const pool = require("./config/database");

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with authentication
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize socket handlers with authentication
initializeSocket(io);

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Request logging middleware (development only)
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(
      `${new Date().toISOString()} - ${req.method} ${req.originalUrl}`
    );
    if (req.body && Object.keys(req.body).length > 0 && req.method !== "GET") {
      console.log("Request body:", JSON.stringify(req.body, null, 2));
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
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/projects", authenticate, projectRoutes);
app.use("/api/team", authenticate, teamRoutes);
app.use("/api/notifications", notificationRoutes); // New notification routes
app.use("/api/projects/:projectId/messages", projectMessageRoutes); // New project message routes
app.use("/api/invites", inviteRoutes);

// Auth routes (for backward compatibility and refresh token)
const authRouter = express.Router();
authRouter.post("/refresh", require("./middleware/auth").refreshToken);
app.use("/api/auth", authRouter);

const { apiRateLimit } = require("./middleware/rateLimiter");
app.use("/api", apiRateLimit);

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    await pool.query("SELECT 1");

    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      database: "connected",
      socket: {
        status: "active",
        connections: io.engine.clientsCount,
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: "Database connection failed",
    });
  }
});

// System status endpoint (for monitoring)
app.get("/api/status", authenticate, async (req, res) => {
  try {
    // Get system statistics
    const userCount = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL"
    );
    const projectCount = await pool.query(
      "SELECT COUNT(*) as count FROM projects"
    );
    const taskCount = await pool.query("SELECT COUNT(*) as count FROM tasks");
    const messageCount = await pool.query(
      "SELECT COUNT(*) as count FROM project_messages WHERE is_archived = false"
    );

    res.json({
      status: "healthy",
      statistics: {
        users: parseInt(userCount.rows[0].count),
        projects: parseInt(projectCount.rows[0].count),
        tasks: parseInt(taskCount.rows[0].count),
        messages: parseInt(messageCount.rows[0].count),
        socketConnections: io.engine.clientsCount,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Status check failed:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "TaskFlow API Server",
    version: "2.0.0",
    status: "Running",
    features: [
      "JWT Authentication",
      "Real-time Messaging",
      "Project Management",
      "Task Management",
      "Team Collaboration",
      "File Sharing",
      "Push Notifications",
    ],
    endpoints: {
      health: "/api/health",
      status: "/api/status",
      auth: {
        login: "POST /api/users/login",
        register: "POST /api/users/register",
        refresh: "POST /api/auth/refresh",
      },
      tasks: {
        list: "GET /api/tasks",
        create: "POST /api/tasks",
        update: "PUT /api/tasks/:id",
        delete: "DELETE /api/tasks/:id",
      },
      projects: {
        list: "GET /api/projects",
        create: "POST /api/projects",
        update: "PUT /api/projects/:id",
        delete: "DELETE /api/projects/:id",
        messages: "GET /api/projects/:id/messages",
      },
      notifications: {
        list: "GET /api/notifications",
        markRead: "PUT /api/notifications/:id/read",
        preferences: "GET /api/notifications/preferences",
      },
      team: "GET /api/team/members",
    },
  });
});

// Rate limiting middleware for file uploads
const rateLimit = require("express-rate-limit");
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs for uploads
  message: {
    error: "Too many upload requests",
    message: "Please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to upload routes
app.use("/api/projects/*/messages/upload", uploadLimiter);

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Error handling middleware (must be last)
app.use(errorHandler.notFound);
app.use(errorHandler.errorHandler);

const PORT = process.env.PORT || 3001;

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    console.log("HTTP server closed.");

    try {
      // Close socket connections
      io.close(() => {
        console.log("Socket.IO server closed.");
      });

      // Close database connections
      await pool.end();
      console.log("Database connections closed.");

      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 30000);
};

// Handle various shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

server.listen(PORT, () => {
  console.log(`🚀 TaskFlow API Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `🔗 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
  );
  console.log(`🗄️  Database: ${process.env.DB_NAME || "taskmanagement"}`);
  console.log(`⚡ Socket.IO enabled for real-time features`);
  console.log(`🔐 JWT Authentication enabled`);
  console.log(`💬 Project Messaging enabled`);
  console.log(`🔔 Push Notifications enabled`);
  console.log(`📁 File Upload support enabled`);

  // Configuration warnings
  if (!process.env.JWT_SECRET) {
    console.warn("⚠️  WARNING: JWT_SECRET not set in environment variables!");
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(
      "⚠️  WARNING: Email configuration incomplete. Password reset and notifications will not work."
    );
  }

  if (!process.env.FRONTEND_URL) {
    console.warn(
      "⚠️  WARNING: FRONTEND_URL not set. CORS may not work properly in production."
    );
  }

  console.log(`\n📋 Available endpoints:`);
  console.log(`   Health: GET http://localhost:${PORT}/api/health`);
  console.log(`   Status: GET http://localhost:${PORT}/api/status`);
  console.log(`   API Docs: GET http://localhost:${PORT}/`);
  console.log(`\n🔌 Socket.IO endpoint: ws://localhost:${PORT}`);
  console.log(`\n✅ Server is ready to accept connections!\n`);
});

// Export for testing
module.exports = { app, server, io };
