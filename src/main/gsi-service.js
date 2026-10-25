import crypto from "crypto";
import { promises as fs } from "fs";

// Shared constants
import { GSI_CONFIG, GSI_SETUP } from "../shared/constants.js";

// GSI building blocks
import { startGsiServer } from "./gsi-server.js";
import { installGsiConfig } from "./gsi-config.js";
import { locateCs2 } from "./cs2-locator.js";

/**
 * CS2 Game State Integration service for the main process.
 * Starts the local endpoint, writes the cfg CS2 needs to post to it and
 * forwards every posted state. The token and port live in a file of their
 * own: CS2 keeps using the cfg it read at startup, so both have to stay the
 * same across app restarts.
 */
class GsiService {
  /**
   * @param {Object} options
   * @param {string} options.storePath - File keeping the token and port
   * @param {{info: Function, warn: Function, error: Function}} options.logger - Logger
   * @param {Function} [options.locate] - Resolves the CS2 folder, or null
   * @param {number} [options.defaultPort] - Port tried when none is stored
   */
  constructor({
    storePath,
    logger,
    locate = locateCs2,
    defaultPort = GSI_CONFIG.DEFAULT_PORT,
  }) {
    this.storePath = storePath;
    this.logger = logger;
    this.locate = locate;
    this.defaultPort = defaultPort;
    this.server = null;
    this._startPromise = null;
  }

  /**
   * Start once; later calls get the same result
   * @param {Function} onState - Called with each game state CS2 posts
   * @returns {Promise<import('../shared/types.js').GsiSetupStatus>}
   */
  start(onState) {
    if (!this._startPromise) this._startPromise = this._start(onState);
    return this._startPromise;
  }

  /**
   * Setup status, once start has finished
   * @returns {Promise<import('../shared/types.js').GsiSetupStatus>}
   */
  getStatus() {
    return this._startPromise || Promise.resolve({ setup: GSI_SETUP.ERROR });
  }

  /**
   * Close the endpoint
   * @returns {Promise<void>} - Resolves once the port is released
   */
  stop() {
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  /**
   * @param {Function} onState - Called with each game state CS2 posts
   * @returns {Promise<import('../shared/types.js').GsiSetupStatus>}
   * @private
   */
  async _start(onState) {
    try {
      const stored = await this._readStore();
      const token = stored.token || crypto.randomBytes(16).toString("hex");

      const { server, port } = await startGsiServer({
        port: stored.port || this.defaultPort,
        token,
        onState,
      });
      this.server = server;
      if (token !== stored.token || port !== stored.port) {
        // Not fatal: GSI still works this run, the next one just rewrites the cfg
        await this._writeStore({ token, port }).catch((error) =>
          this.logger.warn("Could not save GSI token and port", {
            error: error.message,
          })
        );
      }
      this.logger.info("GSI endpoint listening", { port });

      const cs2Dir = await this.locate();
      if (!cs2Dir) {
        this.logger.warn("CS2 installation not found, GSI cfg not written");
        return { setup: GSI_SETUP.CS2_NOT_FOUND, port };
      }

      const { cfgPath, changed } = await installGsiConfig(cs2Dir, {
        port,
        token,
      });
      this.logger.info(changed ? "GSI cfg written" : "GSI cfg up to date", {
        cfgPath,
      });
      return { setup: GSI_SETUP.READY, port, cfgPath, changed };
    } catch (error) {
      this.logger.error("GSI setup failed", { error: error.message });
      return { setup: GSI_SETUP.ERROR };
    }
  }

  /**
   * @returns {Promise<{token?: string, port?: number}>}
   * @private
   */
  async _readStore() {
    try {
      const data = JSON.parse(await fs.readFile(this.storePath, "utf-8"));
      return {
        token: /^[0-9a-f]{32}$/.test(data?.token) ? data.token : undefined,
        port: Number.isInteger(data?.port) ? data.port : undefined,
      };
    } catch {
      return {};
    }
  }

  /**
   * @param {{token: string, port: number}} data
   * @private
   */
  async _writeStore(data) {
    await fs.writeFile(this.storePath, JSON.stringify(data, null, 2), "utf-8");
  }
}

export default GsiService;
