const config = require('./Config');
const Encryption = require('./Encryption');
const Graph = require('./Graph');
const bytes = require('utf8-length');
const BN = require('bn.js');
const Utilities = require('./Utilities');
const Models = require('../models');
const abi = require('ethereumjs-abi');
const Challenge = require('./Challenge');
const MerkleTree = require('./Merkle');
const ImportUtilities = require('./ImportUtilities');

const log = Utilities.getLogger();

const totalEscrowTime = 10 * 60 * 1000;
const finalizeWaitTime = 10 * 60 * 1000;
const minStakeAmount = new BN('100');
const maxTokenAmount = new BN('1000000');
const minReputation = 0;
/**
 * DC operations (handling new offers, etc.)
 */
class DCService {
    /**
     * Default constructor
     * @param ctx IoC context
     */
    constructor(ctx) {
        this.blockchain = ctx.blockchain;
        this.challenger = ctx.challenger;
    }

    async createOffer(importId, rootHash, totalDocuments, vertices) {
        this.blockchain.writeRootHash(importId, rootHash).then((res) => {
            log.info('Fingerprint written on blockchain');
        }).catch((e) => {
            console.log('Error: ', e);
        });

        const dhWallets = [];
        const dhIds = [];

        vertices.forEach((vertex) => {
            if (vertex.data && vertex.data.wallet && vertex.data.node_id) {
                dhWallets.push(vertex.data.wallet);
                dhIds.push(vertex.data.node_id);
            }
        });

        const importSizeInBytes = new BN(this._calculateImportSize(vertices));

        const newOfferRow = {
            id: importId,
            total_escrow_time: totalEscrowTime,
            max_token_amount: maxTokenAmount.toString(),
            min_stake_amount: minStakeAmount.toString(),
            min_reputation: minReputation,
            data_hash: rootHash,
            data_size_bytes: importSizeInBytes.toString(),
            dh_wallets: JSON.stringify(dhWallets),
            dh_ids: JSON.stringify(dhIds),
            start_tender_time: Date.now(), // TODO: Problem. Actual start time is returned by SC.
            status: 'PENDING',
        };

        const offer = await Models.offers.create(newOfferRow);

        // From smart contract:
        // require(profile[msg.sender].balance >=
        // max_token_amount.mul(predetermined_DH_wallet.length.mul(2).add(1)));
        // Check for balance.
        const profileBalance =
            new BN((await this.blockchain.getProfile(config.node_wallet)).balance, 10);
        const condition = maxTokenAmount.mul(new BN((dhWallets.length * 2) + 1));

        if (profileBalance.lt(condition)) {
            await this.blockchain.increaseBiddingApproval(condition - profileBalance);
            await this.blockchain.depositToken(condition - profileBalance);
        }

        this.blockchain.createOffer(
            importId,
            config.identity,
            totalEscrowTime,
            maxTokenAmount,
            minStakeAmount,
            minReputation,
            rootHash,
            importSizeInBytes,
            dhWallets,
            dhIds,
        ).then(() => {
            log.info('Offer written to blockchain. Started bidding phase.');
            offer.status = 'STARTED';
            offer.save({ fields: ['status'] });

            const finalizationCallback = () => {
                Models.offers.findOne({ where: { id: importId } }).then((offerModel) => {
                    if (offerModel.status === 'STARTED') {
                        log.warn('Event for finalizing offer hasn\'t arrived yet. Setting status to FAILED.');

                        offer.status = 'FAILED';
                        offer.save({ fields: ['status'] });
                    }
                });
            };

            this.blockchain.subscribeToEvent('FinalizeOfferReady', null, finalizeWaitTime, finalizationCallback).then(() => {
                log.trace('Started choosing phase.');

                offer.status = 'FINALIZING';
                offer.save({ fields: ['status'] });
                this.chooseBids(offer.id, totalEscrowTime).then(() => {
                    this.blockchain.subscribeToEvent('OfferFinalized', offer.id)
                        .then(() => {
                            offer.status = 'FINALIZED';
                            offer.save({ fields: ['status'] });

                            log.info(`Offer for ${offer.id} finalized`);
                        }).catch((error) => {
                            log.error(`Failed to get offer ${offer.id}). ${error}.`);
                        });
                }).catch(() => {
                    offer.status = 'FAILED';
                    offer.save({ fields: ['status'] });
                });
            });
        }).catch((err) => {
            log.warn(`Failed to create offer. ${err}`);
        });
    }

    /**
     * Calculates more or less accurate size of the import
     * @param vertices   Collection of vertices
     * @returns {number} Size in bytes
     * @private
     */
    _calculateImportSize(vertices) {
        const keyPair = Encryption.generateKeyPair(); // generate random pair of keys
        Graph.encryptVerticesWithKeys(vertices, keyPair.privateKey, keyPair.publicKey);
        return bytes(JSON.stringify(vertices));
    }

    /**
     * Chose DHs
     * @param importId Offer identifier
     * @param totalEscrowTime   Total escrow time
     */
    chooseBids(importId, totalEscrowTime) {
        return new Promise((resolve, reject) => {
            Models.offers.findOne({ where: { id: importId } }).then((offerModel) => {
                const offer = offerModel.get({ plain: true });
                log.info(`Choose bids for offer ${importId}`);
                this.blockchain.increaseApproval(offer.max_token_amount * offer.replication_number)
                    .then(() => {
                        this.blockchain.chooseBids(importId)
                            .then(() => {
                                log.info(`Bids chosen for data ${importId}`);
                                resolve();
                            }).catch((err) => {
                                log.warn(`Failed call choose bids for data ${importId}. ${err}`);
                                reject(err);
                            });
                    }).catch((err) => {
                        log.warn(`Failed to increase allowance. ${JSON.stringify(err)}`);
                        reject(err);
                    });
            }).catch((err) => {
                log.error(`Failed to get offer (Import ID ${importId}). ${err}.`);
                reject(err);
            });
        });
    }

    /**
     * Verifies DH import and distribution key
     * @param epk
     * @param importId
     * @param encryptionKey
     * @param kadWallet
     * @return {Promise<void>}
     */
    async verifyImport(epk, importId, encryptionKey, kadWallet) {
        const dataHolder = await Models.data_holders.findOne({
            where: { dh_wallet: kadWallet },
        });

        const edgesPromise = this.graphStorage.findEdgesByImportId(importId);
        const verticesPromise = this.graphStorage.findVerticesByImportId(importId);

        await Promise.all([edgesPromise, verticesPromise]).then(async (values) => {
            const edges = values[0];
            const vertices = values[1].filter(vertex => vertex.vertex_type !== 'CLASS');

            const originalVertices = Utilities.copyObject(vertices);
            const clonedVertices = Utilities.copyObject(vertices);
            Graph.encryptVerticesWithKeys(clonedVertices, dataHolder.data_private_key);

            const litigationBlocks = Challenge.getBlocks(clonedVertices, 32);
            const litigationBlocksMerkleTree = new MerkleTree(litigationBlocks);
            const litigationRootHash = litigationBlocksMerkleTree.getRoot();

            Graph.encryptVerticesWithKeys(vertices, encryptionKey);
            const distributionMerkle = await ImportUtilities.merkleStructure(
                vertices,
                edges,
            );
            const distributionHash = distributionMerkle.tree.getRoot();
            const epkChecksum = Encryption.calculateDataChecksum(epk, 0, 0, 0);

            const escrow = await this.blockchain.getEscrow(importId, kadWallet);

            let failed = false;
            if (escrow.distribution_root_hash !== Utilities.normalizeHex(distributionHash)) {
                log.warn(`Distribution hash for import ${importId} and DH ${kadWallet} is incorrect`);
                failed = true;
            }

            if (escrow.litigation_root_hash !== Utilities.normalizeHex(litigationRootHash)) {
                log.warn(`Litigation hash for import ${importId} and DH ${kadWallet} is incorrect`);
                failed = true;
            }

            if (!escrow.checksum.startsWith(Utilities.normalizeHex(epkChecksum))) {
                log.warn(`Checksum for import ${importId} and DH ${kadWallet} is incorrect`);
                failed = true;
            }

            const decryptionKey = Encryption.unpadKey(Encryption.globalDecrypt(epk));
            const decryptedVertices = Graph.decryptVertices(vertices, decryptionKey);
            if (!ImportUtilities.compareDocuments(decryptedVertices, originalVertices)) {
                log.warn(`Decryption key for import ${importId} and DH ${kadWallet} is incorrect`);
                failed = true;
            }

            if (failed) {
                await this.blockchain.cancelEscrow(
                    kadWallet,
                    importId,
                );
                // TODO handle failed situation
                return false;
            } else {
                await this.blockchain.verifyEscrow(
                    importId,
                    kadWallet,
                );
                log.warn('Data successfully verified, preparing to start challenges');
                this.challenger.startChallenging();
            }
            return true;
        });
    }
}

module.exports = DCService;
