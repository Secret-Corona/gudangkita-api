/**
 * AUDIT LOG MODEL - Week 6 Enhancement
 * =====================================
 * Comprehensive audit trail system for tracking all user activities
 * Features:
 * - Complete action logging with detailed metadata
 * - IP address and user agent tracking for security
 * - JSON-based details storage for flexible audit data
 * - Advanced querying methods for audit reports
 * - Automated cleanup for old audit records
 */

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true, // Can be null for system actions
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.ENUM(
        'login',
        'logout',
        'create_request',
        'approve_request',
        'reject_request',
        'update_stock',
        'restock',
        'create_user',
        'update_user',
        'delete_user',
        'create_item',
        'update_item',
        'delete_item',
        'pickup_item',
        'system_action'
      ),
      allowNull: false
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true // e.g., 'user', 'item', 'request', 'transaction'
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: true // ID of the affected entity
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true // Store additional details as JSON
    },
    ip_address: {
      type: DataTypes.INET,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'audit_logs',
    timestamps: false,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['action']
      },
      {
        fields: ['timestamp']
      },
      {
        fields: ['entity_type', 'entity_id']
      },
      // Week 6 Enhancement: Additional indexes for better query performance
      {
        fields: ['ip_address']
      },
      {
        fields: ['action', 'timestamp']
      }
    ]
  });

  /**
   * Static method to log actions - Enhanced with validation and formatting
   * @param {Object} data - Audit log data
   * @returns {Promise<AuditLog>} Created audit log entry
   */
  AuditLog.logAction = async function(data) {
    try {
      // Week 6 Enhancement: Add data validation and formatting
      const logData = {
        user_id: data.user_id || null,
        action: data.action,
        entity_type: data.entity_type || null,
        entity_id: data.entity_id || null,
        details: data.details || null,
        ip_address: data.ip_address || null,
        user_agent: data.user_agent || null
      };

      // Add timestamp to details if not present
      if (logData.details && typeof logData.details === 'object') {
        logData.details.logged_at = new Date().toISOString();
      }

      return await this.create(logData);
    } catch (error) {
      console.error('Error logging audit action:', error);
      throw error;
    }
  };

  /**
   * Week 6 Enhancement: Get audit logs by user with pagination
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated audit logs
   */
  AuditLog.getByUser = async function(userId, options = {}) {
    const { page = 1, limit = 50, actions = null, dateFrom = null, dateTo = null } = options;
    
    let whereClause = { user_id: userId };
    
    // Filter by actions if provided
    if (actions && Array.isArray(actions)) {
      whereClause.action = { [sequelize.Sequelize.Op.in]: actions };
    }
    
    // Filter by date range if provided
    if (dateFrom || dateTo) {
      whereClause.timestamp = {};
      if (dateFrom) whereClause.timestamp[sequelize.Sequelize.Op.gte] = dateFrom;
      if (dateTo) whereClause.timestamp[sequelize.Sequelize.Op.lte] = dateTo;
    }

    const offset = (page - 1) * limit;
    
    const { count, rows } = await this.findAndCountAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });

    return {
      logs: rows,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    };
  };

  /**
   * Week 6 Enhancement: Get audit logs by entity
   * @param {string} entityType - Entity type (e.g., 'item', 'request')
   * @param {number} entityId - Entity ID
   * @returns {Promise<Array>} Audit logs for the entity
   */
  AuditLog.getByEntity = async function(entityType, entityId) {
    return await this.findAll({
      where: {
        entity_type: entityType,
        entity_id: entityId
      },
      order: [['timestamp', 'DESC']],
      include: [
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });
  };

  /**
   * Week 6 Enhancement: Get security-related audit logs
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Security audit logs
   */
  AuditLog.getSecurityLogs = async function(options = {}) {
    const { hours = 24, limit = 100 } = options;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.findAll({
      where: {
        action: { [sequelize.Sequelize.Op.in]: ['login', 'logout', 'create_user', 'update_user', 'delete_user'] },
        timestamp: { [sequelize.Sequelize.Op.gte]: since }
      },
      order: [['timestamp', 'DESC']],
      limit,
      include: [
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });
  };

  /**
   * Week 6 Enhancement: Get stock-related audit logs
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Stock audit logs
   */
  AuditLog.getStockLogs = async function(options = {}) {
    const { itemId = null, limit = 100, dateFrom = null, dateTo = null } = options;
    
    let whereClause = {
      action: { [sequelize.Sequelize.Op.in]: ['update_stock', 'restock', 'create_item', 'update_item'] }
    };
    
    if (itemId) {
      whereClause.entity_type = 'item';
      whereClause.entity_id = itemId;
    }
    
    if (dateFrom || dateTo) {
      whereClause.timestamp = {};
      if (dateFrom) whereClause.timestamp[sequelize.Sequelize.Op.gte] = dateFrom;
      if (dateTo) whereClause.timestamp[sequelize.Sequelize.Op.lte] = dateTo;
    }

    return await this.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit,
      include: [
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });
  };

  /**
   * Week 6 Enhancement: Cleanup old audit logs
   * @param {number} daysToKeep - Number of days to keep logs
   * @returns {Promise<number>} Number of deleted records
   */
  AuditLog.cleanupOldLogs = async function(daysToKeep = 365) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const deletedCount = await this.destroy({
      where: {
        timestamp: { [sequelize.Sequelize.Op.lt]: cutoffDate }
      }
    });
    
    console.log(`Cleaned up ${deletedCount} old audit logs (older than ${daysToKeep} days)`);
    return deletedCount;
  };

  return AuditLog;
}; 