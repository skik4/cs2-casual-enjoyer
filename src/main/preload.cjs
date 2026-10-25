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
