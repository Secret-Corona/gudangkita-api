/**
 * ITEM MODEL - Week 6 Enhancement
 * ===============================
 * Enhanced item management with advanced stock tracking and validation
 * Features:
 * - Smart stock level calculations and alerts
 * - Advanced validation for stock operations
 * - Utility methods for stock management
 * - Integration with audit trail system
 */

module.exports = (sequelize, DataTypes) => {
  const Item = sequelize.define('Item', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nama_barang: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100]
      }
    },
    stok_terkini: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        isInt: true
      }
    },
    satuan: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'pcs'
    },
    deskripsi: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    minimum_stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      validate: {
        min: 0,
        isInt: true
      }
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  /**
   * Check if item stock is low (at or below minimum threshold)
   * @returns {boolean} True if stock is low
   */
  Item.prototype.isLowStock = function() {
    return this.stok_terkini <= this.minimum_stock;
  };

  /**
   * Check if item can fulfill a request for specified quantity
   * @param {number} quantity - Requested quantity
   * @returns {boolean} True if stock is sufficient
   */
  Item.prototype.canFulfillRequest = function(quantity) {
    return this.stok_terkini >= quantity;
  };

  /**
   * Week 6 Enhancement: Get stock level percentage
   * @returns {number} Stock level as percentage of minimum stock
   */
  Item.prototype.getStockLevelPercentage = function() {
    if (this.minimum_stock === 0) return 100;
    return Math.round((this.stok_terkini / this.minimum_stock) * 100);
  };

  /**
   * Week 6 Enhancement: Get stock status description
   * @returns {string} Human-readable stock status
   */
  Item.prototype.getStockStatus = function() {
    if (this.stok_terkini === 0) return 'out_of_stock';
    if (this.isLowStock()) return 'low_stock';
    return 'in_stock';
  };

  /**
   * Week 6 Enhancement: Check if item is out of stock
   * @returns {boolean} True if completely out of stock
   */
  Item.prototype.isOutOfStock = function() {
    return this.stok_terkini === 0;
  };

  /**
   * Week 6 Enhancement: Calculate recommended restock quantity
   * @param {number} targetLevel - Target stock level (default: 3x minimum)
   * @returns {number} Recommended restock quantity
   */
  Item.prototype.getRecommendedRestockQuantity = function(targetLevel = null) {
    const target = targetLevel || (this.minimum_stock * 3);
    const needed = Math.max(0, target - this.stok_terkini);
    return needed;
  };

  /**
   * Week 6 Enhancement: Get stock urgency level
   * @returns {string} Urgency level: 'critical', 'urgent', 'normal'
   */
  Item.prototype.getStockUrgency = function() {
    if (this.stok_terkini === 0) return 'critical';
    if (this.stok_terkini <= Math.floor(this.minimum_stock / 2)) return 'urgent';
    if (this.isLowStock()) return 'normal';
    return 'good';
  };

  /**
   * Week 6 Enhancement: Validate stock adjustment
   * @param {number} newStock - New stock level
   * @returns {Object} Validation result
   */
  Item.prototype.validateStockAdjustment = function(newStock) {
    const result = {
      valid: true,
      warnings: [],
      errors: []
    };

    if (newStock < 0) {
      result.valid = false;
      result.errors.push('Stock cannot be negative');
    }

    if (newStock === 0) {
      result.warnings.push('Item will be out of stock');
    }

    if (newStock <= this.minimum_stock) {
      result.warnings.push('Stock will be at or below minimum level');
    }

    const change = Math.abs(newStock - this.stok_terkini);
    if (change > 1000) {
      result.warnings.push(`Large stock change detected: ${change} units`);
    }

    return result;
  };

  /**
   * Week 6 Enhancement: Get stock change description
   * @param {number} previousStock - Previous stock level
   * @returns {string} Human-readable change description
   */
  Item.prototype.getStockChangeDescription = function(previousStock) {
    const change = this.stok_terkini - previousStock;
    const absChange = Math.abs(change);
    
    if (change === 0) return 'No change';
    if (change > 0) return `Increased by ${absChange} ${this.satuan}`;
    return `Decreased by ${absChange} ${this.satuan}`;
  };

  /**
   * Week 6 Enhancement: Static method to find items needing restock
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Items needing restock
   */
  Item.getItemsNeedingRestock = async function(options = {}) {
    const { urgency = 'all', limit = 50 } = options;
    
    let whereClause = {};
    
    if (urgency === 'critical') {
      whereClause.stok_terkini = 0;
    } else if (urgency === 'urgent') {
      whereClause.stok_terkini = {
        [sequelize.Sequelize.Op.lte]: sequelize.Sequelize.col('minimum_stock')
      };
    } else if (urgency === 'low') {
      whereClause.stok_terkini = {
        [sequelize.Sequelize.Op.lte]: sequelize.Sequelize.col('minimum_stock')
      };
    }
    
    const items = await this.findAll({
      where: whereClause,
      order: [['stok_terkini', 'ASC'], ['nama_barang', 'ASC']],
      limit
    });

    return items.map(item => ({
      ...item.toJSON(),
      is_low_stock: item.isLowStock(),
      stock_status: item.getStockStatus(),
      stock_urgency: item.getStockUrgency(),
      recommended_restock: item.getRecommendedRestockQuantity()
    }));
  };

  /**
   * Week 6 Enhancement: Static method to get stock statistics
   * @returns {Promise<Object>} Stock statistics
   */
  Item.getStockStatistics = async function() {
    const items = await this.findAll();
    
    const stats = {
      total_items: items.length,
      out_of_stock: 0,
      low_stock: 0,
      in_stock: 0,
      critical_items: [],
      total_stock_value: 0
    };

    items.forEach(item => {
      if (item.isOutOfStock()) {
        stats.out_of_stock++;
        stats.critical_items.push({
          id: item.id,
          nama_barang: item.nama_barang,
          urgency: 'critical'
        });
      } else if (item.isLowStock()) {
        stats.low_stock++;
        if (item.getStockUrgency() === 'urgent') {
          stats.critical_items.push({
            id: item.id,
            nama_barang: item.nama_barang,
            urgency: 'urgent'
          });
        }
      } else {
        stats.in_stock++;
      }
    });

    return stats;
  };

  return Item;
}; 