/**
 * Request Model - Week 6 Enhancement
 * Enhanced request model with improved validation and helper methods
 * Core model for approval/reject workflows and public request handling
 */
module.exports = (sequelize, DataTypes) => {
  const Request = sequelize.define('Request', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true, // Null for public requests
      references: {
        model: 'users',
        key: 'id'
      }
    },
    item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      }
    },
    jumlah_diminta: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        isInt: true
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'completed'),
      allowNull: false,
      defaultValue: 'pending'
    },
    feedback_admin: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_urgent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_public_request: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    public_requester_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    public_requester_contact: {
      type: DataTypes.STRING(100),
      allowNull: true
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
    tableName: 'requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Instance methods - Enhanced for Week 6 approval workflows
  Request.prototype.canBeApproved = function() {
    return this.status === 'pending';
  };

  Request.prototype.canBeRejected = function() {
    return this.status === 'pending';
  };

  Request.prototype.isCompleted = function() {
    return this.status === 'completed';
  };

  // Week 6 Enhancement: Additional helper methods for improved request management
  Request.prototype.isPending = function() {
    return this.status === 'pending';
  };

  Request.prototype.isApproved = function() {
    return this.status === 'approved';
  };

  Request.prototype.isRejected = function() {
    return this.status === 'rejected';
  };

  Request.prototype.getStatusColor = function() {
    const colors = {
      'pending': '#FFA500',    // Orange
      'approved': '#008000',   // Green
      'rejected': '#FF0000',   // Red
      'completed': '#0000FF'   // Blue
    };
    return colors[this.status] || '#808080'; // Default gray
  };

  Request.prototype.getFormattedCreatedDate = function() {
    return new Date(this.created_at).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return Request;
}; 