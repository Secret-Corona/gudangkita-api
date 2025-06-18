const { Sequelize } = require('sequelize');
const config = require('../config');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

// Import models
const User = require('./User')(sequelize, Sequelize.DataTypes);
const Item = require('./Item')(sequelize, Sequelize.DataTypes);
const Request = require('./Request')(sequelize, Sequelize.DataTypes);
const Transaction = require('./Transaction')(sequelize, Sequelize.DataTypes);
const AuditLog = require('./AuditLog')(sequelize, Sequelize.DataTypes);

// Define associations
const models = { User, Item, Request, Transaction, AuditLog };

// User associations
User.hasMany(Request, { foreignKey: 'user_id', as: 'requests' });
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });

// Item associations
Item.hasMany(Request, { foreignKey: 'item_id', as: 'requests' });
Item.hasMany(Transaction, { foreignKey: 'item_id', as: 'transactions' });

// Request associations
Request.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Request.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Request.hasMany(Transaction, { foreignKey: 'request_id', as: 'transactions' });

// Transaction associations
Transaction.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Transaction.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// AuditLog associations
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  Sequelize,
  ...models
}; 