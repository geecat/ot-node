
module.exports = {
    up: (queryInterface, Sequelize) => queryInterface.createTable('data_providers', {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        ip: {
            type: Sequelize.STRING,
        },
        description: {
            type: Sequelize.STRING,
        },
        created_at: {
            allowNull: false,
            type: Sequelize.INTEGER,
        },
        updated_at: {
            allowNull: false,
            type: Sequelize.INTEGER,
        },
    }),
    down: (queryInterface, Sequelize) => queryInterface.dropTable('data_providers'),
};
