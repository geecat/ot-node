module.exports = (sequelize, DataTypes) => {
    var data_creators = sequelize.define('data_creators', {
        dc_wallet: DataTypes.STRING(50),
        dc_kademlia_id: DataTypes.STRING(128),
        public_key: DataTypes.STRING(2048),
        created_at: DataTypes.INTEGER,
        updated_at: DataTypes.INTEGER,
    }, {
        timestamps: true,
    }, {});
    data_creators.associate = function (models) {
        // associations can be defined here
    };
    return data_creators;
};
