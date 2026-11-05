import { safeStorage } from "electron";
import { promises as fs } from "fs";

/**
 * The fields that hold a credential: the Steam Web API token or key the app
 * runs on, and the key the Maps tab reads friends lists with
 */
const SECRET_FIELDS = ["auth", "fof_api_key"];

/**
 * settings.json, owned by the main process. The renderer sends patches
 * rather than whole files, and patches are applied one at a time on top of
 * what is on disk - so two parts of the app saving different fields at the
 * same moment can no longer overwrite each other.
 *
 * The credential fields are encrypted on the way to disk and decrypted on
 * the way back, so the IPC and the renderer only ever see plain values.
 * Electron's safeStorage does it with the operating system's own keys -
 * DPAPI on Windows - so the file is of no use to another Windows account,
 * or to the same account on another PC, instead of handing the token to
 * whoever can read it. Its asynchronous calls are used: the synchronous
 * ones are deprecated since Electron 45 and go away in 46, and a value
 * they wrote still decrypts here. On disk a plain value is a string and an encrypted
 * one is an object with the single key "encrypted" holding the ciphertext
 * as base64, so the two can never be confused: a file written before
 * encryption existed still reads, and is encrypted by its next write. A
 * value that cannot be decrypted reads as absent, and the app asks for the
 * credential again.
 *
 * safeStorage works only once the app is ready. The store is reached only
 * through the settings IPC, which main.js registers after ready and which
 * only the renderer calls, so no field is read or written before then.
 */
class SettingsStore {
  /**
   * @param {string} filePath - settings.json
   * @param {{info: Function, warn: Function, error: Function}} logger - Logger
   */
  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
    this._queue = Promise.resolve();
    this._saidPlainText = false;
  }

  /**
   * Read the settings, credentials decrypted
   * @returns {Promise<Object|null>} - Settings, or null when there are none
   */
  async read() {
    let stored;
    try {
      stored = JSON.parse(await fs.readFile(this.filePath, "utf-8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger.error("Error reading settings", { error: error.message });
      }
      return null;
    }
    return this._decryptSecrets(stored);
  }

  /**
   * Merge a patch into the settings: a key set to null is removed, any other
   * value replaces the stored one, keys not in the patch stay as they are
   * @param {Object} patch - Fields to change, credentials plain
   * @returns {Promise<Object|null>} - Settings after the change, null on failure
   */
  update(patch) {
    const apply = async () => {
      const next = { ...((await this.read()) || {}) };
      for (const [key, value] of Object.entries(patch || {})) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      await fs.writeFile(
        this.filePath,
        JSON.stringify(await this._encryptSecrets(next), null, 2),
        "utf-8"
      );
      this.logger.info("Settings saved", { keys: Object.keys(patch || {}) });
      return next;
    };

    const result = this._queue.then(apply).catch((error) => {
      this.logger.error("Error writing settings", { error: error.message });
      return null;
    });
    this._queue = result;
    return result;
  }

  /**
   * The settings as they go to disk: every credential that is a string is
   * encrypted. Anything else in those fields is left as it came.
   * @param {Object} settings - Settings with plain credentials
   * @returns {Promise<Object>} - A copy with the credentials encrypted
   * @private
   */
  async _encryptSecrets(settings) {
    const result = { ...settings };
    for (const field of SECRET_FIELDS) {
      if (typeof result[field] !== "string") continue;
      const encrypted = await this._encrypt(result[field], field);
      if (encrypted) result[field] = encrypted;
    }
    return result;
  }

  /**
   * @param {string} value - Credential
   * @param {string} field - Its field, for the log
   * @returns {Promise<{encrypted: string}|null>} - The stored shape, or null to keep the value as it is
   * @private
   */
  async _encrypt(value, field) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      // Said once: the app goes on as it did before encryption existed
      if (!this._saidPlainText) {
        this._saidPlainText = true;
        this.logger.warn(
          "Encryption is not available on this system, credentials are kept in plain text"
        );
      }
      return null;
    }
    try {
      const buffer = await safeStorage.encryptStringAsync(value);
      return { encrypted: buffer.toString("base64") };
    } catch (error) {
      // The field name and the reason only: a credential never goes to the log
      this.logger.error(
        `Could not encrypt ${field}, keeping it in plain text`,
        {
          error: error.message,
        }
      );
      return null;
    }
  }

  /**
   * The settings as the app sees them: encrypted credentials decrypted, and
   * one that cannot be decrypted left out
   * @param {*} stored - What the file holds
   * @returns {Promise<*>} - The same, with plain credentials
   * @private
   */
  async _decryptSecrets(stored) {
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return stored;
    }
    const result = { ...stored };
    for (const field of SECRET_FIELDS) {
      if (!isEncrypted(result[field])) continue;
      const value = await this._decrypt(result[field], field);
      if (value === null) delete result[field];
      else result[field] = value;
    }
    return result;
  }

  /**
   * @param {{encrypted: string}} stored - Encrypted value as it is on disk
   * @param {string} field - Its field, for the log
   * @returns {Promise<string|null>} - The credential, or null when it cannot be read
   * @private
   */
  async _decrypt(stored, field) {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new Error("encryption is not available on this system");
      }
      // shouldReEncrypt, the other half of the answer, needs no handling:
      // every write encrypts afresh, so a rotated key is picked up by the
      // next one
      const { result } = await safeStorage.decryptStringAsync(
        Buffer.from(stored.encrypted, "base64")
      );
      return result;
    } catch (error) {
      // Most likely a settings file copied from another Windows account or
      // PC, whose keys this one does not have: the app asks for it again
      this.logger.error(
        `Could not decrypt ${field}, it will be asked for again`,
        {
          error: error.message,
        }
      );
      return null;
    }
  }
}

/**
 * Whether a stored value is in the encrypted shape. A plain credential is
 * always a string, so an object is never one.
 * @param {*} value - Value as it is on disk
 * @returns {boolean}
 */
function isEncrypted(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.encrypted === "string"
  );
}

export default SettingsStore;
