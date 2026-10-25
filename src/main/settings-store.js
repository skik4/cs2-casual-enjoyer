import { promises as fs } from "fs";

/**
 * settings.json, owned by the main process. The renderer sends patches
 * rather than whole files, and patches are applied one at a time on top of
 * what is on disk - so two parts of the app saving different fields at the
 * same moment can no longer overwrite each other.
 */
class SettingsStore {
  /**
   * @param {string} filePath - settings.json
   * @param {{info: Function, error: Function}} logger - Logger
   */
  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
    this._queue = Promise.resolve();
  }

  /**
   * Read the settings
   * @returns {Promise<Object|null>} - Settings, or null when there are none
   */
  async read() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf-8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger.error("Error reading settings", { error: error.message });
      }
      return null;
    }
  }

  /**
   * Merge a patch into the settings: a key set to null is removed, any other
   * value replaces the stored one, keys not in the patch stay as they are
   * @param {Object} patch - Fields to change
   * @returns {Promise<Object|null>} - Settings after the change, null on failure
   */
  update(patch) {
    const apply = async () => {
      const next = { ...((await this.read()) || {}) };
      for (const [key, value] of Object.entries(patch || {})) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), "utf-8");
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
}

export default SettingsStore;
