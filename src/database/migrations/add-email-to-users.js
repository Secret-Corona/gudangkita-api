const { QueryInterface, DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Add email column to users table
      await queryInterface.addColumn('users', 'email', {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          isEmail: true
        }
      });

      console.log('✅ Email column added to users table successfully');
    } catch (error) {
      console.error('❌ Failed to add email column:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Remove email column from users table
      await queryInterface.removeColumn('users', 'email');
      console.log('✅ Email column removed from users table successfully');
    } catch (error) {
      console.error('❌ Failed to remove email column:', error);
      throw error;
    }
  }
}; 