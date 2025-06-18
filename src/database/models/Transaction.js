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

  // Instance methods
  Transaction.prototype.isStockIncrease = function() {
    return this.new_stock > this.previous_stock;
  };

  Transaction.prototype.isStockDecrease = function() {
    return this.new_stock < this.previous_stock;
  };

  Transaction.prototype.getStockChange = function() {
    return this.new_stock - this.previous_stock;
  };

  return Transaction;
}; 