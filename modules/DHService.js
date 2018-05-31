const config = require('./Config');
const BN = require('bn.js');

const Utilities = require('./Utilities');
const Models = require('../models');
const Encryption = require('./Encryption');
const MerkleTree = require('./Merkle');
const Challenge = require('./Challenge');
const Graph = require('./Graph');

const log = Utilities.getLogger();

/**
 * DH operations (handling new offers, etc.)
 */
class DHService {
    /**
     * Default constructor
     * @param ctx IoC context
     */
    constructor(ctx) {
        this.importer = ctx.importer;
        this.blockchain = ctx.blockchain;
        this.network = ctx.network;
        this.web3 = ctx.web3;
        this.graphStorage = ctx.graphStorage;
    }

    /**
     * Handles new offer
     *
     */
    async handleOffer(
        importId,
        dcNodeId,
        totalEscrowTime,
        maxTokenAmount,
        minStakeAmount,
        minReputation,
        dataSizeBytes,
        dataHash,
        predeterminedBid,
    ) {
        try {
            // Check if mine offer and if so ignore it.
            const offerModel = await Models.offers.findOne({ where: { id: importId } });
            if (offerModel) {
                const offer = offerModel.get({ plain: true });
                log.trace(`Mine offer (ID ${offer.data_hash}). Ignoring.`);
                return;
            }

            // Check if already applied.
            let bidModel = await Models.bids.findOne({ where: { import_id: importId } });
            if (bidModel) {
                log.info(`I already sent my bid for offer: ${importId}.`);
                return;
            }

            const maxDataSizeBytes = new BN(config.dh_max_data_size_bytes, 10);

            const profile = await this.blockchain.getProfile(config.node_wallet);

            maxTokenAmount = new BN(maxTokenAmount);
            minStakeAmount = new BN(minStakeAmount);
            dataSizeBytes = new BN(dataSizeBytes);
            const totalEscrowTimePerMinute = Math.round(totalEscrowTime / 60000);
            const myPrice = new BN(profile.token_amount)
                .mul(dataSizeBytes)
                .mul(new BN(totalEscrowTimePerMinute));
            const myStake = new BN(profile.stake_amount)
                .mul(dataSizeBytes)
                .mul(new BN(totalEscrowTimePerMinute));


            if (maxTokenAmount.lt(myPrice)) {
                log.info(`Offer ${importId} too expensive for me.`);
                return;
            }

            if (minStakeAmount.gt(myStake)) {
                log.info(`Skipping offer ${importId}. Stake too high.`);
                return;
            }

            if (maxDataSizeBytes.lt(dataSizeBytes)) {
                log.trace(`Skipping offer because of data size. Offer data size in bytes is ${dataSizeBytes}.`);
                return;
            }

            if (!predeterminedBid && !Utilities.getImportDistance(myPrice, 1, myStake)) {
                log.info(`Offer ${importId}, not in mine distance. Not going to participate.`);
                return;
            }

            log.trace(`Adding a bid for offer ${importId}.`);

            // From smart contract:
            // uint scope = this_offer.data_size * this_offer.total_escrow_time;
            // require((this_offer.min_stake_amount  <= this_DH.stake_amount * scope) &&
            //          (this_DH.stake_amount * scope <= profile[msg.sender].balance));
            const profileBalance = new BN(profile.balance, 10);
            const condition = myStake;

            if (profileBalance.lt(condition)) {
                await this.blockchain.increaseBiddingApproval(condition.sub(profileBalance));
                await this.blockchain.depositToken(condition.sub(profileBalance));
            }

            await this.blockchain.addBid(importId, config.identity);
            // await blockchainc.increaseBiddingApproval(myStake);
            const addedBidEvent = await this.blockchain.subscribeToEvent('AddedBid', importId);
            const dcWallet = await this.blockchain.getDcWalletFromOffer(importId);
            this._saveBidToStorage(
                addedBidEvent,
                dcNodeId.substring(2, 42),
                dcWallet,
                myPrice,
                totalEscrowTime,
                myStake,
                dataSizeBytes,
                importId,
            );

            await this.blockchain.subscribeToEvent('OfferFinalized', importId);
            // Now check if bid taken.
            // emit BidTaken(bytes32 import_id, address DH_wallet);
            const eventModelBid = await Models.events.findOne({
                where:
                    {
                        event: 'BidTaken',
                        import_id: importId,
                    },
            });
            if (!eventModelBid) {
                // Probably contract failed since no event fired.
                log.info(`BidTaken not received for offer ${importId}.`);
                return;
            }

            const eventBid = eventModelBid.get({ plain: true });
            const eventBidData = JSON.parse(eventBid.data);

            if (eventBidData.DH_wallet !== config.node_wallet) {
                log.info(`Bid not taken for offer ${importId}.`);
                return;
            }

            bidModel = await Models.bids.findOne({ where: { import_id: importId } });
            const bid = bidModel.get({ plain: true });
            this.network.kademlia().replicationRequest(
                {
                    import_id: importId,
                    wallet: config.node_wallet,
                },
                bid.dc_id, (err) => {
                    if (err) {
                        log.warn(`Failed to send replication request ${err}`);
                        // TODO Cancel bid here.
                    }
                },
            );
        } catch (error) {
            log.error(`Failed to handle offer. ${error}`);
        }
    }

    _saveBidToStorage(
        event,
        dcNodeId,
        dcWallet,
        chosenPrice,
        totalEscrowTime,
        stake,
        dataSizeBytes,
        importId,
    ) {
        Models.bids.create({
            bid_index: event.bid_index,
            price: chosenPrice.toString(),
            import_id: importId,
            dc_wallet: dcWallet,
            dc_id: dcNodeId,
            total_escrow_time: totalEscrowTime.toString(),
            stake: stake.toString(),
            data_size_bytes: dataSizeBytes.toString(),
        }).then((bid) => {
            log.info(`Created new bid for offer ${importId}. Waiting for reveal... `);
        }).catch((err) => {
            log.error(`Failed to insert new bid. ${err}`);
        });
    }

    async handleImport(data) {
        /*
            payload: {
                edges: data.edges,
                import_id: data.import_id,
                dc_wallet: config.blockchain.wallet_address,
                public_key: data.encryptedVertices.public_key,
                vertices: data.encryptedVertices.vertices,
            },
         */
        const bidModel = await Models.bids.findOne({ where: { import_id: data.import_id } });
        if (!bidModel) {
            log.warn(`Couldn't find bid for import ID ${data.import_id}.`);
            return;
        }
        // TODO: Check data before signing escrow.
        const bid = bidModel.get({ plain: true });

        try {
            await this.importer.importJSON(data);
        } catch (err) {
            log.warn(`Failed to import JSON successfully. ${err}.`);
            return;
        }

        data.edges = Graph.sortVertices(data.edges);
        data.encryptedVertices.vertices = Graph.sortVertices(data.encryptedVertices.vertices);

        const leaves = [];
        const hash_pairs = [];
        await this.importer.merkleStructure(
            data.encryptedVertices.vertices, data.edges,
            leaves, hash_pairs,
        );

        leaves.sort();
        const tree = new MerkleTree(leaves);
        const rootHash = Utilities.sha3(tree.getRoot());
        log.trace(`[DH] Root hash calculated. Root hash: ${rootHash}`);

        log.trace('[DH] Replication finished');

        try {
            await this.blockchain.increaseApproval(bid.stake);
            await this.blockchain.verifyEscrow(
                bid.dc_wallet,
                bid.import_id,
                bid.price,
                bid.stake,
                bid.total_escrow_time,
            );

            let encryptedVertices = data.encryptedVertices.vertices;
            // sort vertices
            encryptedVertices.sort(((a, b) => {
                if (a._key < b._key) {
                    return -1;
                } else if (a._key > b._key) {
                    return 1;
                }
                return 0;
            }));
            // filter CLASS vertices
            encryptedVertices = encryptedVertices.filter(vertex => vertex.vertex_type !== 'CLASS'); // Dump class objects.

            const litigationBlocks = Challenge.getBlocks(encryptedVertices, 32);
            const litigationBlocksMerkleTree = new MerkleTree(litigationBlocks);

            const keyPair = Encryption.generateKeyPair(512);
            const decryptedVertices = encryptedVertices.map((encVertex) => {
                const key = data.encryptedVertices.public_key;
                encVertex.data = Encryption.decryptObject(encVertex.data, key);
                return encVertex;
            });
            Graph.encryptVerticesWithKeys(decryptedVertices, keyPair.privateKey, keyPair.publicKey);

            const encLeaves = [];
            const encHashPairs = [];
            await this.importer.merkleStructure(
                decryptedVertices, data.edges,
                encLeaves, encHashPairs,
            );
            const distributionMerkleTree = new MerkleTree(leaves);

            const epk = Encryption.packEPK(keyPair.publicKey);
            const epkChecksum = Encryption.calculateDataChecksum(epk, 0, 0, 0);

            // Store holding information and generate keys for eventual
            // data replication.
            const holdingData = await Models.holding_data.create({
                id: data.import_id,
                source_wallet: bid.dc_wallet,
                data_public_key: keyPair.privateKey,
                data_private_key: keyPair.privateKey,
            });

            if (!holdingData) {
                log.warn('Failed to store holding data info.');
            }

            log.important('Finished negotiation. Job starting. Waiting for challenges.');
            this.network.kademlia().replicationFinished({ status: 'success' }, bid.dc_id);
        } catch (error) {
            log.error(`Failed to verify escrow. ${error}.`);
        }
    }

    async handleDataLocationRequest(dataLocationRequestObject) {
        /*
            dataLocationRequestObject = {
                message: {
                    id: ID,
                    wallet: DV_WALLET,
                    nodeId: KAD_ID
                    query: [
                        {
                                path: _path,
                                value: _value,
                                opcode: OPCODE
                        },
                        ...
                    ]
                }
                messageSignature: {
                    v: …,
                    r: …,
                    s: …
                }
             }
         */

        const { message, messageSignature } = dataLocationRequestObject;

        // Check if mine publish.
        if (message.nodeId === config.identity &&
            message.wallet === config.node_wallet) {
            log.trace('Received mine publish. Ignoring.');
            return;
        }

        if (!Utilities.isMessageSigned(this.web3, message, messageSignature)) {
            log.warn(`We have a forger here. Signature doesn't match for message: ${message}`);
        }

        // Handle query here.
        const { query } = message;
        const imports = await this.graphStorage.findImportIds(query);
        if (imports.length === 0) {
            // I don't want to participate
            log.trace(`No imports found for request ${message.id}`);
            return;
        }

        /*
            dataLocationResponseObject = {
                message: {
                    id: ID,
                    wallet: DH_WALLET,
                    nodeId: KAD_ID,
                    imports: [
                                importId1,
                                importId2
                            ],
                    dataSize: DATA_BYTE_SIZE,
                    dataPrice: TOKEN_AMOUNT,
                    stakeFactor: X
                }
                messageSignature: {
                    c: …,
                    r: …,
                    s: …
                }
            }
         */

        const messageResponse = {
            id: message.id,
            wallet: config.node_wallet,
            nodeId: config.identity,
            imports,
            dataSize: 500,
            dataPrice: 100000,
            stakeFactor: 1000,
        };

        const messageResponseSignature =
            Utilities.generateRsvSignature(
                JSON.stringify(messageResponse),
                this.web3,
                config.node_private_key,
            );

        const dataLocationResponseObject = {
            message: messageResponse,
            messageSignature: messageResponseSignature,
        };

        this.network.kademlia().sendDataLocationResponse(
            dataLocationResponseObject,
            message.nodeId,
        );

        // Store message in DB to know later prices.
    }

    async handleDataReadRequest(message) {
        /*
        message: {
            wallet: DH_WALLET,
            nodeId: KAD_ID,
            imports: [
                         importId: …
                    ],
            dataSize: DATA_BYTE_SIZE,
            stakeFactor: X
        }
        */

        // TODO: Data read request should have own ID created by DH when placed the offer.
        // TODO: No need to send imports. Should be stored in request
        // TODO in order to avoid getting a different import.

        const { nodeId, wallet, imports } = message;

        // TODO: Only one import ID used. Later we'll support replication from multiple imports.
        const import_id = JSON.parse(imports)[0];

        const verticesPromise = this.graphStorage.findVerticesByImportId(import_id);
        const edgesPromise = this.graphStorage.findEdgesByImportId(import_id);

        const values = await Promise.all([verticesPromise, edgesPromise]);
        const vertices = values[0];
        const edges = values[1];

        // Get replication key and then encrypt data.
        const holdingDataModel = await Models.holding_data.find({ where: { id: import_id } });

        if (!holdingDataModel) {
            throw Error(`Didn't find import with ID. ${import_id}`);
        }

        const holdingData = holdingDataModel.get({ plain: true });
        const replicationPrivateKey = holdingData.data_private_key;
        const replicationPublicKey = holdingData.data_public_key;

        const encryptVerticesWithKeys = (vertices, privateKey, publicKey) => {
            for (const id in vertices) {
                const vertex = vertices[id];
                if (vertex.data) {
                    vertex.data = Encryption.encryptObject(vertex.data, privateKey);
                }
            }
        };

        encryptVerticesWithKeys(
            vertices.filter(vertex => vertex.vertex_type !== 'CLASS'),
            replicationPrivateKey,
            replicationPublicKey,
        );

        // TODO: Sign escrow here.

        // TODO: dataReadResponseObject might be redundant
        // TODO since same info can be gathered from escrow.
        /*
            dataReadResponseObject = {
                message: {
                    id: REPLY_ID
                    wallet: DH_WALLET,
                    nodeId: KAD_ID
                    agreementStatus: CONFIRMED/REJECTED,
                    purchaseId: PURCHASE_ID,
                    encryptedData: { … }
                },
                messageSignature: {
                    c: …,
                    r: …,
                    s: …
               }
            }
         */

        const replyMessage = {
            wallet: this.config.wallet,
            nodeId: this.config.identity,
            agreementStatus: 'CONFIRMED',
            purchaseId: 'PURCHASE_ID',
            encryptedData: {
                vertices,
                edges,
            },
            importId: import_id, // TODO: Temporal. Remove it.
        };
        const dataReadResponseObject = {
            message: replyMessage,
            messageSignature: Utilities.generateRsvSignature(
                JSON.stringify(replyMessage),
                this.web3,
                this.config.node_private_key,
            ),
        };

        this.network.kademlia().sendDataReadResponse(dataReadResponseObject, nodeId);
    }

    listenToOffers() {
        this.blockchain.subscribeToEventPermanent(['AddedPredeterminedBid', 'OfferCreated']);
    }
}

module.exports = DHService;
