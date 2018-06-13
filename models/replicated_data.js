
module.exports = (sequelize, DataTypes) => {
    var replicated_data = sequelize.define('replicated_data', {
        dh_id: DataTypes.INTEGER,
        data_id: DataTypes.INTEGER,
        start_time: DataTypes.DATE,
        end_time: DataTypes.DATE,
        total_amount: DataTypes.REAL,
        dh_stake: DataTypes.REAL,
        my_stake: DataTypes.REAL,
        created_at: DataTypes.INTEGER,
        updated_at: DataTypes.INTEGER,
    }, {
        timestamps: true,
    }, {});
    replicated_data.associate = function (models) {
    // associations can be defined here
    };
    return replicated_data;
};
