
module.exports = (sequelize, DataTypes) => {
    var data_info = sequelize.define('data_info', {
        data_id: DataTypes.INTEGER,
        total_documents: DataTypes.INTEGER,
        total_data_blocks: DataTypes.INTEGER,
        root_hash: DataTypes.STRING(40),
        import_timestamp: DataTypes.DATE,
        created_at: DataTypes.INTEGER,
        updated_at: DataTypes.INTEGER,
    }, {
        tableName: 'data_info',
        timestamps: true,
    });
    data_info.associate = function (models) {
    // associations can be defined here
    };
    return data_info;
};
