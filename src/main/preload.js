const { contextBridge, ipcRenderer } = require('electron');

/**
 * Electron API bridge for renderer process
 * Provides secure access to main process functionality
 */
const electronAPI = {
    /**
     * Window control methods
     */
    window: {
        minimize: () => ipcRenderer.send('window-minimize'),
        close: () => ipcRenderer.send('window-close')
    },

    /**
     * Settings management methods
     */
    settings: {
        load: () => ipcRenderer.invoke('settings-load'),
        save: (data) => ipcRenderer.invoke('settings-save', data)
    },

    /**
     * Logging methods
     */
    log: (level, message, data) => {
        ipcRenderer.send('log-message', level, message, data);
    },

    /**
     * App information methods
     */
    app: {
        getVersion: () => ipcRenderer.invoke('get-app-version')
    },

    // Legacy methods for backward compatibility
    minimize: () => ipcRenderer.send('window-minimize'),
    close: () => ipcRenderer.send('window-close'),
    loadSettings: () => ipcRenderer.invoke('settings-load'),
    saveSettings: (data) => ipcRenderer.invoke('settings-save', data),
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
};

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI); 