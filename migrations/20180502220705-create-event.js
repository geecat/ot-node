
module.exports = {
    up: (queryInterface, Sequelize) => queryInterface.createTable('events', {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        event: {
            type: Sequelize.STRING,
        },
        data: {
            type: Sequelize.TEXT,
        },
        block: {
            allowNull: false,
            type: Sequelize.INTEGER,
        },

        offer_hash: {
            type: Sequelize.STRING,
        },
        finished: {
            allowNull: false,
            type: Sequelize.INTEGER,
        },
        created_at:
            {
                
                type: Sequelize.INTEGER,

            },
        updated_at:
            {

                type: Sequelize.INTEGER,

            },
        timestamp: {

            type: Sequelize.INTEGER,
        },

    }),
    down: (queryInterface, Sequelize) => queryInterface.dropTable('Events'),
};
