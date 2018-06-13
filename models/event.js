module.exports = (sequelize, DataTypes) => {
    var Event = sequelize.define('events', {
        event: DataTypes.STRING,
        data: DataTypes.TEXT,
        offer_hash: DataTypes.STRING,
        block: DataTypes.INTEGER,
        finished: DataTypes.BOOLEAN,
        timestamp: DataTypes.INTEGER,
        created_at: DataTypes.INTEGER,
        updated_at: DataTypes.INTEGER,
    }, {
        timestamps: true,

    }, {});
    Event.associate = function (models) {
        // associations can be defined here
    };
    return Event;
};
