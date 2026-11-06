const { contextBridge, ipcRenderer } = require("electron");

/**
 * Electron API bridge for renderer process
 * Provides secure access to main process functionality
 */
const electronAPI = {
  /**
   * Window control methods
   */
  window: {
    minimize: () => ipcRenderer.send("window-minimize"),
    close: () => ipcRenderer.send("window-close"),
    /**
     * Whether the window is minimized now
     * @returns {Promise<boolean>} - False when the main process cannot say
     */
    isMinimized: async () => {
      try {
        return await ipcRenderer.invoke("window-is-minimized");
      } catch (error) {
        console.error("Failed to get the window state:", error);
        return false;
      }
    },
    /**
     * Subscribe to the window being minimized and restored
     * @param {Function} callback - Called with true on minimize, false on restore
     * @returns {Function} - Unsubscribe
     */
    onMinimized: (callback) => {
      const listener = (_event, minimized) => callback(minimized);
      ipcRenderer.on("window-minimized", listener);
      return () => ipcRenderer.removeListener("window-minimized", listener);
    },
  },

  /**
   * Settings management methods
   */
  settings: {
    load: async () => {
      try {
        return await ipcRenderer.invoke("settings-load");
      } catch (error) {
        console.error("Failed to load settings:", error);
        return null;
      }
    },
    /**
     * Merge fields into the stored settings; null removes a field
     * @param {Object} patch - Fields to change
     * @returns {Promise<Object|null>} - Settings after the change, null on failure
     */
    update: async (patch) => {
      try {
        return await ipcRenderer.invoke("settings-update", patch);
      } catch (error) {
        console.error("Failed to save settings:", error);
        return null;
      }
    },
  },

  /**
   * App information methods
   */
  app: {
    getVersion: async () => {
      try {
        return await ipcRenderer.invoke("get-app-version");
      } catch (error) {
        console.error("Failed to get app version:", error);
        return "unknown";
      }
    },
  },

  /**
   * Logging methods - bridge renderer logs to main process
   */
  log: {
    error: (context, message, data) =>
      ipcRenderer.send("log-error", context, message, data),
    warn: (context, message, data) =>
      ipcRenderer.send("log-warn", context, message, data),
    info: (context, message, data) =>
      ipcRenderer.send("log-info", context, message, data),
    debug: (context, message, data) =>
      ipcRenderer.send("log-debug", context, message, data),
  },

  /**
   * CS2 Game State Integration
   */
  gsi: {
    getStatus: async () => {
      try {
        return await ipcRenderer.invoke("gsi-get-status");
      } catch (error) {
        console.error("Failed to get GSI status:", error);
        return null;
      }
    },
    /**
     * Subscribe to game states posted by CS2
     * @param {Function} callback - Called with each state
     * @returns {Function} - Unsubscribe
     */
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("gsi-state", listener);
      return () => ipcRenderer.removeListener("gsi-state", listener);
    },
  },

  /**
   * Updates of the installed app, from the GitHub releases
   */
  updates: {
    getStatus: async () => {
      try {
        return await ipcRenderer.invoke("update-get-status");
      } catch (error) {
        console.error("Failed to get the update status:", error);
        return null;
      }
    },
    /**
     * Subscribe to the updater's status
     * @param {Function} callback - Called with each status
     * @returns {Function} - Unsubscribe
     */
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on("update-status", listener);
      return () => ipcRenderer.removeListener("update-status", listener);
    },
    /**
     * Ask GitHub for a newer version now
     * @returns {Promise<"available"|"latest"|"failed"|"off">} - What it found
     */
    check: async () => {
      try {
        return await ipcRenderer.invoke("update-check");
      } catch (error) {
        console.error("Failed to check for updates:", error);
        return "failed";
      }
    },
    /**
     * Download the new version the updater offers
     * @returns {Promise<boolean>} - Whether there was one to download
     */
    download: async () => {
      try {
        return await ipcRenderer.invoke("update-download");
      } catch (error) {
        console.error("Failed to download the update:", error);
        return false;
      }
    },
    /**
     * Restart into the downloaded version
     * @returns {Promise<boolean>} - Whether there was one to install
     */
    install: async () => {
      try {
        return await ipcRenderer.invoke("update-install");
      } catch (error) {
        console.error("Failed to install the update:", error);
        return false;
      }
    },
  },

  /**
   * Map finder: the player pool on disk
   */
  mapFinder: {
    load: async () => {
      try {
        return await ipcRenderer.invoke("map-finder-load");
      } catch (error) {
        console.error("Failed to load map finder data:", error);
        return null;
      }
    },
    save: async (data) => {
      try {
        return await ipcRenderer.invoke("map-finder-save", data);
      } catch (error) {
        console.error("Failed to save map finder data:", error);
        return false;
      }
    },
  },

  /**
   * Steam's own log of the games it runs
   */
  steamLog: {
    /**
     * When Steam logged CS2 changing game server, from a moment on
     * @param {number} since - Epoch ms
     * @returns {Promise<{usable: boolean, changes: number[]}>} - Unusable
     *   when the main process cannot say
     */
    serverChangesSince: async (since) => {
      try {
        return await ipcRenderer.invoke("steam-log-server-changes", since);
      } catch (error) {
        console.error("Failed to read Steam's game log:", error);
        return { usable: false, changes: [] };
      }
    },
  },

  /**
   * Join journal: what happens during join attempts, appended to a local file
   */
  joinJournal: {
    append: async (lines) => {
      try {
        return await ipcRenderer.invoke("join-journal-append", lines);
      } catch (error) {
        console.error("Failed to write the join journal:", error);
        return false;
      }
    },
  },

  /**
   * Shell helpers
   */
  shell: {
    openExternal: async (url) => {
      try {
        return await ipcRenderer.invoke("open-external", url);
      } catch (error) {
        console.error("Failed to open external URL:", error);
        return false;
      }
    },
  },
};

// Expose API to renderer process
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
