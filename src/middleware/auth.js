const jwt = require('jsonwebtoken');
const { User } = require('../database/models');
const logger = require('../utils/logger');

/**
 * AUTHENTICATION MIDDLEWARE - Week 6 Enhancement
 * ===============================================
 * Enhanced security and logging for approval/reject workflows
 * Features:
 * - Comprehensive security logging for audit trail
 * - Enhanced role-based access control
 * - Detailed authentication failure tracking
 * - IP address and user agent logging for security monitoring
 * - Rate limiting protection (to be implemented)
 */

// Verify JWT token - Enhanced with detailed authentication logging
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      // Enhanced logging for security monitoring - Week 6 Enhancement
      logger.warn(`Authentication failed: No token provided from IP ${req.ip} for ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
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
      // Enhanced security logging for invalid user attempts
      logger.error(`Authentication failed: User ${decoded.userId} not found in database`, {
        userId: decoded.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ 
        error: 'Invalid token - user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Enhanced logging for successful authentication - Week 6 Enhancement
    req.user = user;
    logger.debug(`User ${user.username} (${user.role}) authenticated for ${req.method} ${req.path}`, {
      userId: user.id,
      username: user.username,
      role: user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    next();
  } catch (error) {
    // Enhanced error logging with security context
    logger.error('Token verification failed:', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    
    if (error.name === 'TokenExpiredError') {
      // Week 6 Enhancement: Track expired token attempts
      logger.warn(`Expired token used from IP ${req.ip} for ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      // Week 6 Enhancement: Track invalid token attempts
      logger.warn(`Invalid token used from IP ${req.ip} for ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
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
    // Enhanced security logging for unauthorized access attempts
    logger.warn(`Admin access attempted without authentication for ${req.method} ${req.path} from IP ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (req.user.role !== 'admin') {
    // Enhanced security logging for unauthorized admin access attempts - Week 6 Enhancement
    logger.warn(`Non-admin user ${req.user.username} attempted admin action: ${req.method} ${req.path} from IP ${req.ip}`, {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    return res.status(403).json({ 
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Success logging for admin actions (critical for audit trail) - Week 6 Enhancement
  logger.info(`Admin ${req.user.username} accessing ${req.method} ${req.path}`, {
    userId: req.user.id,
    username: req.user.username,
    role: req.user.role,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  next();
};

// Verify user role (both user and admin can access) - Enhanced with detailed logging
const requireUser = (req, res, next) => {
  if (!req.user) {
    logger.warn(`User access attempted without authentication for ${req.method} ${req.path} from IP ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (!['user', 'admin'].includes(req.user.role)) {
    // Week 6 Enhancement: Enhanced logging for invalid role access
    logger.warn(`User ${req.user.username} with invalid role '${req.user.role}' attempted access: ${req.method} ${req.path}`, {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    return res.status(403).json({ 
      error: 'User access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Week 6 Enhancement: Success logging for user actions
  logger.debug(`User ${req.user.username} (${req.user.role}) accessing ${req.method} ${req.path}`, {
    userId: req.user.id,
    username: req.user.username,
    role: req.user.role,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  next();
};

// Optional authentication (for endpoints that work with or without auth) - Enhanced with logging
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId);
      if (user) {
        req.user = user;
        // Week 6 Enhancement: Log optional auth success
        logger.debug(`Optional auth successful for user ${user.username} on ${req.method} ${req.path}`, {
          userId: user.id,
          username: user.username,
          role: user.role,
          ip: req.ip,
          timestamp: new Date().toISOString()
        });
      }
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid - Week 6 Enhancement: Log failed optional auth
    logger.debug(`Optional auth failed for ${req.method} ${req.path} from IP ${req.ip}: ${error.message}`, {
      ip: req.ip,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    req.user = null;
    next();
  }
};

/**
 * Week 6 Enhancement: Middleware to log sensitive actions
 * This middleware automatically logs sensitive operations to the audit trail
 */
const logSensitiveAction = (action) => {
  return async (req, res, next) => {
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method to log after successful response
    res.json = function(data) {
      // Log the sensitive action if response is successful
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const { AuditLog } = require('../database/models');
        AuditLog.logAction({
          user_id: req.user ? req.user.id : null,
          action: action,
          entity_type: req.params.id ? 'item' : null,
          entity_id: req.params.id ? req.params.id : null,
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          details: {
            method: req.method,
            path: req.path,
            body: req.body,
            params: req.params,
            query: req.query,
            response_status: res.statusCode,
            timestamp: new Date().toISOString()
          }
        }).catch(error => {
          logger.error('Failed to log sensitive action:', error);
        });
      }
      
      // Call the original json method
      originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireUser,
  optionalAuth,
  logSensitiveAction  // Week 6 Enhancement: Export new middleware
}; 