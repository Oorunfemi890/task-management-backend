// middleware/errorHandler.js

// 404 handler for routes that don't exist
const notFound = (req, res, next) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  console.error('Error Stack:', err.stack);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique constraint violation
        error = {
          message: 'Duplicate entry - record already exists',
          status: 400
        };
        break;
      case '23503': // Foreign key constraint violation
        error = {
          message: 'Referenced record does not exist',
          status: 400
        };
        break;
      case '23502': // Not null constraint violation
        error = {
          message: 'Required field is missing',
          status: 400
        };
        break;
      case '22001': // String data right truncation
        error = {
          message: 'Data too long for field',
          status: 400
        };
        break;
      case '42P01': // Undefined table
        error = {
          message: 'Database table not found',
          status: 500
        };
        break;
      default:
        error = {
          message: 'Database error occurred',
          status: 500
        };
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error = {
      message: 'Validation Error',
      status: 400,
      details: Object.values(err.errors).map(e => e.message)
    };
  }

  // JWT errors (if you add authentication later)
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      status: 401
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      status: 401
    };
  }

  // Send error response
  res.status(error.status).json({
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(error.details && { details: error.details })
  });
};

module.exports = {
  notFound,
  errorHandler
};