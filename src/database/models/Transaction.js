/**
 * TRANSACTION MODEL - Week 6 Enhancement
 * ======================================
 * Enhanced transaction logging with comprehensive tracking and analytics
 * Features:
 * - Complete transaction history with detailed metadata
 * - Advanced querying methods for transaction reports
 * - Transaction statistics and analytics
 * - Integration with audit trail system
 */

module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true, // Can be null for system transactions
      references: {
        model: 'users',
        key: 'id'
      }
    },
    request_id: {
      type: DataTypes.INTEGER,
      allowNull: true, // Not all transactions are from requests (e.g., restocking)
      references: {
        model: 'requests',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('request', 'pickup', 'restock', 'adjustment'),
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isInt: true
      }
    },
    previous_stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        isInt: true
      }
    },
    new_stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        isInt: true
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  /**
   * Check if transaction resulted in stock increase
   * @returns {boolean} True if stock increased
   */
  Transaction.prototype.isStockIncrease = function() {
    return this.new_stock > this.previous_stock;
  };

  /**
   * Check if transaction resulted in stock decrease
   * @returns {boolean} True if stock decreased
   */
  Transaction.prototype.isStockDecrease = function() {
    return this.new_stock < this.previous_stock;
  };

  /**
   * Get the stock change amount (can be positive or negative)
   * @returns {number} Stock change amount
   */
  Transaction.prototype.getStockChange = function() {
    return this.new_stock - this.previous_stock;
  };

  /**
   * Week 6 Enhancement: Get transaction impact description
   * @returns {string} Human-readable impact description
   */
  Transaction.prototype.getImpactDescription = function() {
    const change = this.getStockChange();
    const absChange = Math.abs(change);
    
    if (change === 0) return 'No stock change';
    if (change > 0) return `Stock increased by ${absChange} units`;
    return `Stock decreased by ${absChange} units`;
  };

  /**
   * Week 6 Enhancement: Get transaction severity level
   * @returns {string} Severity level: 'critical', 'high', 'medium', 'low'
   */
  Transaction.prototype.getSeverityLevel = function() {
    const change = Math.abs(this.getStockChange());
    
    if (change >= 1000) return 'critical';
    if (change >= 500) return 'high';
    if (change >= 100) return 'medium';
    return 'low';
  };

  /**
   * Week 6 Enhancement: Check if transaction is a major change
   * @returns {boolean} True if major change (>= 100 units)
   */
  Transaction.prototype.isMajorChange = function() {
    return Math.abs(this.getStockChange()) >= 100;
  };

  /**
   * Week 6 Enhancement: Get transaction summary
   * @returns {Object} Transaction summary with key metrics
   */
  Transaction.prototype.getSummary = function() {
    return {
      id: this.id,
      type: this.type,
      quantity: this.quantity,
      stock_change: this.getStockChange(),
      impact: this.getImpactDescription(),
      severity: this.getSeverityLevel(),
      is_major_change: this.isMajorChange(),
      timestamp: this.created_at
    };
  };

  /**
   * Week 6 Enhancement: Static method to get transactions by item
   * @param {number} itemId - Item ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Transactions for the item
   */
  Transaction.getByItem = async function(itemId, options = {}) {
    const { limit = 50, type = null, dateFrom = null, dateTo = null } = options;
    
    let whereClause = { item_id: itemId };
    
    if (type) {
      whereClause.type = type;
    }
    
    if (dateFrom || dateTo) {
      whereClause.created_at = {};
      if (dateFrom) whereClause.created_at[sequelize.Sequelize.Op.gte] = dateFrom;
      if (dateTo) whereClause.created_at[sequelize.Sequelize.Op.lte] = dateTo;
    }

    return await this.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      include: [
        {
          model: sequelize.models.Item,
          as: 'Item',
          attributes: ['id', 'nama_barang', 'satuan']
        },
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });
  };

  /**
   * Week 6 Enhancement: Static method to get transactions by user
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Transactions by the user
   */
  Transaction.getByUser = async function(userId, options = {}) {
    const { limit = 50, type = null, dateFrom = null, dateTo = null } = options;
    
    let whereClause = { user_id: userId };
    
    if (type) {
      whereClause.type = type;
    }
    
    if (dateFrom || dateTo) {
      whereClause.created_at = {};
      if (dateFrom) whereClause.created_at[sequelize.Sequelize.Op.gte] = dateFrom;
      if (dateTo) whereClause.created_at[sequelize.Sequelize.Op.lte] = dateTo;
    }

    return await this.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      include: [
        {
          model: sequelize.models.Item,
          as: 'Item',
          attributes: ['id', 'nama_barang', 'satuan']
        },
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });
  };

  /**
   * Week 6 Enhancement: Static method to get transaction statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Transaction statistics
   */
  Transaction.getStatistics = async function(options = {}) {
    const { dateFrom = null, dateTo = null, itemId = null } = options;
    
    let whereClause = {};
    
    if (itemId) {
      whereClause.item_id = itemId;
    }
    
    if (dateFrom || dateTo) {
      whereClause.created_at = {};
      if (dateFrom) whereClause.created_at[sequelize.Sequelize.Op.gte] = dateFrom;
      if (dateTo) whereClause.created_at[sequelize.Sequelize.Op.lte] = dateTo;
    }

    const transactions = await this.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    const stats = {
      total_transactions: transactions.length,
      by_type: {
        request: 0,
        pickup: 0,
        restock: 0,
        adjustment: 0
      },
      by_severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      total_stock_increased: 0,
      total_stock_decreased: 0,
      major_changes: 0,
      most_active_items: {},
      most_active_users: {}
    };

    transactions.forEach(transaction => {
      // Count by type
      stats.by_type[transaction.type]++;
      
      // Count by severity
      const severity = transaction.getSeverityLevel();
      stats.by_severity[severity]++;
      
      // Count major changes
      if (transaction.isMajorChange()) {
        stats.major_changes++;
      }
      
      // Track stock changes
      const change = transaction.getStockChange();
      if (change > 0) {
        stats.total_stock_increased += change;
      } else if (change < 0) {
        stats.total_stock_decreased += Math.abs(change);
      }
      
      // Track most active items
      if (!stats.most_active_items[transaction.item_id]) {
        stats.most_active_items[transaction.item_id] = 0;
      }
      stats.most_active_items[transaction.item_id]++;
      
      // Track most active users
      if (transaction.user_id) {
        if (!stats.most_active_users[transaction.user_id]) {
          stats.most_active_users[transaction.user_id] = 0;
        }
        stats.most_active_users[transaction.user_id]++;
      }
    });

    return stats;
  };

  /**
   * Week 6 Enhancement: Static method to get recent major transactions
   * @param {number} hours - Hours to look back (default: 24)
   * @param {number} limit - Maximum results (default: 20)
   * @returns {Promise<Array>} Recent major transactions
   */
  Transaction.getRecentMajorTransactions = async function(hours = 24, limit = 20) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const transactions = await this.findAll({
      where: {
        created_at: { [sequelize.Sequelize.Op.gte]: since }
      },
      order: [['created_at', 'DESC']],
      limit: limit * 2, // Get more to filter
      include: [
        {
          model: sequelize.models.Item,
          as: 'Item',
          attributes: ['id', 'nama_barang', 'satuan']
        },
        {
          model: sequelize.models.User,
          as: 'User',
          attributes: ['id', 'username', 'role']
        }
      ]
    });

    // Filter for major changes and limit results
    return transactions
      .filter(t => t.isMajorChange())
      .slice(0, limit)
      .map(t => ({
        ...t.toJSON(),
        summary: t.getSummary()
      }));
  };

  return Transaction;
}; 