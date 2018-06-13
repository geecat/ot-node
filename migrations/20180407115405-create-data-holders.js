
module.exports = {
    up: (queryInterface, Sequelize) => queryInterface.createTable('data_holders', {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        dh_wallet: {
            type: Sequelize.STRING,
        },
        dh_kademlia_id: {
            type: Sequelize.STRING,
        },
        data_public_key: {
            type: Sequelize.STRING,
        },
        data_private_key: {
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
    down: (queryInterface, Sequelize) => queryInterface.dropTable('data_holders'),
};
