const jwt = require('jsonwebtoken');
const { User } = require('../database/models');
const logger = require('../utils/logger');

/**
 * Authentication Middleware - Week 6 Enhancement
 * Enhanced security and logging for approval/reject workflows
 * Provides role-based access control for administrative functions
 */

// Verify JWT token - Enhanced with detailed authentication logging
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      // Enhanced logging for security monitoring
      logger.warn(`Authentication failed: No token provided from IP ${req.ip} for ${req.method} ${req.path}`);
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist
    // Week 6 Enhancement: Added user existence validation for security
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      logger.error(`Authentication failed: User ${decoded.userId} not found in database`);
      return res.status(401).json({ 
        error: 'Invalid token - user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Enhanced logging for successful authentication
    req.user = user;
    logger.debug(`User ${user.username} (${user.role}) authenticated for ${req.method} ${req.path}`);
    next();
  } catch (error) {
    logger.error('Token verification failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Verify admin role - Critical for approval/reject workflows
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    logger.warn(`Admin access attempted without authentication for ${req.method} ${req.path} from IP ${req.ip}`);
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (req.user.role !== 'admin') {
    // Enhanced security logging for unauthorized admin access attempts
    logger.warn(`Non-admin user ${req.user.username} attempted admin action: ${req.method} ${req.path} from IP ${req.ip}`);
    return res.status(403).json({ 
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Success logging for admin actions (critical for audit trail)
  logger.info(`Admin ${req.user.username} accessing ${req.method} ${req.path}`);
  next();
};

// Verify user role (both user and admin can access)
const requireUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (!['user', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ 
      error: 'User access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  next();
};

// Optional authentication (for endpoints that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireUser,
  optionalAuth
}; 