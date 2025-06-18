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

  // Instance methods
  Item.prototype.isLowStock = function() {
    return this.stok_terkini <= this.minimum_stock;
  };

  Item.prototype.canFulfillRequest = function(quantity) {
    return this.stok_terkini >= quantity;
  };

  return Item;
}; 