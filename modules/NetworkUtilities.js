const fs = require('fs');
const ms = require('ms');
const os = require('os');
const path = require('path');
const assert = require('assert');
const boscar = require('boscar');
const hdkey = require('hdkey');
const utilities = require('./Utilities');
const config = require('./Config');
const kadence = require('@kadenceproject/kadence');
const { EventEmitter } = require('events');
const { fork } = require('child_process');
const Control = require('./Control');

class NetworkUtilities {
    constructor(ctx) {
        this.solvers = [];
        this.log = ctx.logger;
    }

    /**
     * Checks existence of SSL certificate and if not, generates one
     * @return {Promise<boolean>}
     */
    async setSelfSignedCertificate() {
        if (!fs.existsSync(`../keys/${config.ssl_key_path}`)) {
            const result = await utilities.generateSelfSignedCertificate(config);
            if (result) {
                this.log.info('SSL generated');
                return true;
            }
        }
        this.log.info('SSL checked successfully');
        return true;
    }

    /**
     * Mining a new identity
     * @return {Promise<void>}
     */
    async solveIdentity() {
        const events = new EventEmitter();
        const start = Date.now();

        let time;
        let attempts = 0;
        const status = setInterval(() => {
            this.log.info(`Still solving identity, currently ${attempts} of ${kadence.constants.MAX_NODE_INDEX} possible indices tested in the last ${ms(Date.now() - start)}`);
        }, 60000);

        this.log.info(`Solving identity derivation index with ${config.cpus} solver processes, this can take a while...`);

        events.on('attempt', () => attempts += 1);

        try {
            this.index = await this.spawnIdentityDerivationProcesses(this.xprivkey, events);
            time = Date.now() - start;
        } catch (err) {
            this.log.error(err.message.toLowerCase());
            this.log.info(`Delete/move ${config.private_extended_key_path} and restart`);
            process.exit(1);
        }

        events.removeAllListeners();
        clearInterval(status);

        this.log.info(`Solved identity derivation index ${this.index} in ${ms(time)}`);
        utilities.saveToConfig('child_derivation_index', this.index);
        config.child_derivation_index = this.index;
    }

    /**
     * Creates child processes to mine an identity
     * @param xprivkey
     * @param events
     * @return {Promise<any>}
     */
    async spawnIdentityDerivationProcesses(xprivkey, events) {
        // How many processes can we run
        const cpus = parseInt(config.cpus, 10);

        if (cpus === 0) {
            return this.log.info('There are no derivation processes running');
        }
        if (os.cpus().length < cpus) {
            return this.log.error('Refusing to start more solvers than cpu cores');
        }

        for (let c = 0; c < cpus; c += 1) {
            const index = Math.floor(kadence.constants.MAX_NODE_INDEX / cpus) * c;
            const solver = this.forkIdentityDerivationSolver(c, xprivkey, index, events);

            this.solvers.push(solver);

            solver.once('exit', (code) => {
                if (code === 0) {
                    this.log.info(`Derivation solver ${c} exited normally`);
                } else {
                    this.log.error(`Derivation solver ${c} exited with code ${code}`);
                }
            });
        }

        return new Promise((resolve) => {
            events.once('index', (i) => {
                events.removeAllListeners();
                this.solvers.forEach(s => s.kill('SIGTERM'));
                resolve(i);
            });
        });
    }

    /**
    * Creating child process for mining an identity
    * @param c
    * @param xprv
    * @param index
    * @param events
    * @return {*}
    */
    forkIdentityDerivationSolver(c, xprv, index, events) {
        this.log.info(`Forking derivation process ${c}`);

        const solver = fork(path.join(__dirname, 'workers', 'identity.js'), [], {
            stdio: [0, 1, 2, 'ipc'],
            env: process.env,
        });

        solver.on('message', (msg) => {
            if (msg.error) {
                return this.log.error(`Derivation ${c} error, ${msg.error}`);
            }

            if (msg.attempts) {
                return events.emit('attempt');
            }
            events.emit('index', msg.index);
        });

        solver.on('error', (err) => {
            this.log.error(`Derivation ${c} error, ${err.message}`);
        });

        solver.send([xprv, index]);
        return solver;
    }

    /**
    * Register interface for controlling the node - using socket or port
    * @param config
    */
    registerControlInterface(config, node) {
        assert(
            !(parseInt(config.control_port_enabled, 10) &&
            parseInt(config.control_sock_enabled, 10)),
            'ControlSock and ControlPort cannot both be enabled',
        );

        const controller = new boscar.Server(new Control(node));

        if (parseInt(config.control_port_enabled, 10)) {
            this.log.notify(`Binding controller to port ${config.control_port}`);
            controller.listen(parseInt(config.control_port, 10), '0.0.0.0');
        }

        if (parseInt(config.control_sock_enabled, 10)) {
            this.log.notify(`Binding controller to path ${config.control_sock}`);
            controller.listen(config.control_sock);
        }
    }

    /**
     * Get identity keys
     * @param xprivkey - extended private key
     * @return {{childkey: *, parentkey: *}}
     */
    getIdentityKeys(xprivkey) {
        // Start initializing identity keys
        const parentkey = hdkey.fromExtendedKey(xprivkey)
            .derive(kadence.constants.HD_KEY_DERIVATION_PATH);
        const childkey = parentkey.deriveChild(parseInt(config.child_derivation_index, 10));
        return {
            childkey,
            parentkey,
        };
    }

    /**
     * Verifies if we are on the test network and otherconfig checks
     */
    verifyConfiguration(config) {
        if (parseInt(config.traverse_nat_enabled, 10) && parseInt(config.onion_enabled, 10)) {
            this.log.error('Refusing to start with both TraverseNatEnabled and OnionEnabled - this is a privacy risk');
            process.exit(1);
        }
    }

    /**
     * Validate identity and solve if not valid
     * @param identity
     * @param xprivkey
     */
    async checkIdentity(identity, xprivkey) {
        this.xprivkey = xprivkey;
        this.identity = identity;
        if (!identity.validate(this.xprivkey, this.index)) {
            this.log.warn(`Identity is not yet generated. Identity derivation not yet solved - ${this.index} is invalid`);
            await this.solveIdentity();
        }
    }
}

module.exports = NetworkUtilities;
