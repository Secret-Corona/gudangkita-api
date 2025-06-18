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
      }
    ]
  });

  // Static methods
  AuditLog.logAction = async function(data) {
    return await this.create({
      user_id: data.user_id || null,
      action: data.action,
      entity_type: data.entity_type || null,
      entity_id: data.entity_id || null,
      details: data.details || null,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null
    });
  };

  return AuditLog;
}; 