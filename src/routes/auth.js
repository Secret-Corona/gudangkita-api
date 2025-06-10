const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User, AuditLog } = require('../database/models');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/auth/login - User/Admin login
router.post('/login', [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, password } = req.body;

    // Find user by username
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Validate password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Log login action
    await AuditLog.logAction({
      user_id: user.id,
      action: 'login',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        login_time: new Date().toISOString()
      }
    });

    logger.info(`User ${username} logged in successfully`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at
      }
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout - User logout (with token)
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    // Log logout action
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'logout',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        logout_time: new Date().toISOString()
      }
    });

    logger.info(`User ${req.user.username} logged out`);

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/auth/profile - Get current user profile
router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        created_at: req.user.created_at,
        updated_at: req.user.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register - Register new user (admin only in production)
router.post('/register', [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin')
], async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, password, role = 'user' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(409).json({
        error: 'Username already exists',
        code: 'USERNAME_EXISTS'
      });
    }

    // Create new user
    const user = await User.create({
      username,
      password,
      role
    });

    // Log user creation
    await AuditLog.logAction({
      user_id: null,
      action: 'create_user',
      entity_type: 'user',
      entity_id: user.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        username: user.username,
        role: user.role
      }
    });

    logger.info(`New user registered: ${username} with role: ${role}`);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router; 