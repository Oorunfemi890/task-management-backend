// middleware/validation.js

// Validation for creating tasks
const validateTask = (req, res, next) => {
  const { title, priority, status } = req.body;
  const errors = [];

  // Validate title
  if (!title || title.trim().length === 0) {
    errors.push('Title is required');
  } else if (title.length > 255) {
    errors.push('Title must be less than 255 characters');
  }

  // Validate priority
  const validPriorities = ['low', 'medium', 'high'];
  if (priority && !validPriorities.includes(priority)) {
    errors.push('Priority must be one of: low, medium, high');
  }

  // Validate status
  const validStatuses = ['todo', 'inprogress', 'review', 'done'];
  if (status && !validStatuses.includes(status)) {
    errors.push('Status must be one of: todo, inprogress, review, done');
  }

  // Validate assignee (if provided)
  if (req.body.assignee && (!Number.isInteger(Number(req.body.assignee)) || Number(req.body.assignee) <= 0)) {
    errors.push('Assignee must be a valid user ID');
  }

  // Validate due date (if provided)
  if (req.body.dueDate && isNaN(Date.parse(req.body.dueDate))) {
    errors.push('Due date must be a valid date');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || email.trim().length === 0) {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Email must be a valid email address');
    }
  }

  if (!password || password.trim().length === 0) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validation for updating tasks
const validateTaskUpdate = (req, res, next) => {
  const { title, priority, status } = req.body;
  const errors = [];

  // Validate title (if provided)
  if (title !== undefined) {
    if (!title || title.trim().length === 0) {
      errors.push('Title cannot be empty');
    } else if (title.length > 255) {
      errors.push('Title must be less than 255 characters');
    }
  }

  // Validate priority (if provided)
  const validPriorities = ['low', 'medium', 'high'];
  if (priority && !validPriorities.includes(priority)) {
    errors.push('Priority must be one of: low, medium, high');
  }

  // Validate status (if provided)
  const validStatuses = ['todo', 'inprogress', 'review', 'done'];
  if (status && !validStatuses.includes(status)) {
    errors.push('Status must be one of: todo, inprogress, review, done');
  }

  // Validate assignee (if provided)
  if (req.body.assignee !== undefined && req.body.assignee !== null) {
    if (!Number.isInteger(Number(req.body.assignee)) || Number(req.body.assignee) <= 0) {
      errors.push('Assignee must be a valid user ID');
    }
  }

  // Validate due date (if provided)
  if (req.body.dueDate && isNaN(Date.parse(req.body.dueDate))) {
    errors.push('Due date must be a valid date');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validation for creating users
const validateUser = (req, res, next) => {
  const { name, email, avatar } = req.body;
  const errors = [];

  // Validate name
  if (!name || name.trim().length === 0) {
    errors.push('Name is required');
  } else if (name.length > 100) {
    errors.push('Name must be less than 100 characters');
  }

  // Validate email
  if (!email || email.trim().length === 0) {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Email must be a valid email address');
    } else if (email.length > 255) {
      errors.push('Email must be less than 255 characters');
    }
  }

  // Validate avatar (if provided)
  if (avatar && avatar.length > 10) {
    errors.push('Avatar must be less than 10 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Validation for updating users
const validateUserUpdate = (req, res, next) => {
  const { name, email, avatar } = req.body;
  const errors = [];

  // Validate name (if provided)
  if (name !== undefined) {
    if (!name || name.trim().length === 0) {
      errors.push('Name cannot be empty');
    } else if (name.length > 100) {
      errors.push('Name must be less than 100 characters');
    }
  }

  // Validate email (if provided)
  if (email !== undefined) {
    if (!email || email.trim().length === 0) {
      errors.push('Email cannot be empty');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Email must be a valid email address');
      } else if (email.length > 255) {
        errors.push('Email must be less than 255 characters');
      }
    }
  }

  // Validate avatar (if provided)
  if (avatar && avatar.length > 10) {
    errors.push('Avatar must be less than 10 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

module.exports = {
  validateTask,
  validateTaskUpdate,
  validateUser,
  validateUserUpdate,
  validateLogin   
};