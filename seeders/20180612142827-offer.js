require('dotenv').config();

module.exports = {
    up: (queryInterface, Sequelize) => queryInterface.bulkInsert('offers', [{
        id: '0x6197690d373dff73e80a53111b5512303293c398c7822cfac39e8b1312f1ae94',
        import_id: '1528813398194',
        total_escrow_time: '600000',
        max_token_amount: '1000000',
        min_stake_amount: '100',
        min_reputation: '0',
        data_hash: '0x05d44b8ca143b3e43ce042873ebd3db7695e50729531d2327369aeed88e7761c',
        data_size_bytes: '22372',
        dh_wallets: '["0xFfDDAd7BD40602B78C0649032D2532dEFa23A4C0","0xFfDDAd7BD40602B78C0649032D2532dEFa23A4C0"]',
        dh_ids: '["b5fd41d2cca3b0a79720670e5b3da7054751245a","b5fd41d2cca3b0a79720670e5b3da7054751245a"]',
        start_tender_time: '1528813399549',
        status: 'STARTED',
        created_at: new Date(),
        updated_at: new Date(),

    }], {}),

    down: (queryInterface, Sequelize) => queryInterface.bulkDelete('blockchain_data', null, {}),
};
