const jwt = require('jsonwebtoken');
const { User } = require('../database/models');
const logger = require('../utils/logger');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token - user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
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

// Verify admin role
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

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