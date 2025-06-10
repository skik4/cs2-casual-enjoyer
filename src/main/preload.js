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
        load: async () => {
            try {
                return await ipcRenderer.invoke('settings-load');
            } catch (error) {
                console.error('Failed to load settings:', error);
                return null;
            }
        },
        save: async (data) => {
            try {
                return await ipcRenderer.invoke('settings-save', data);
            } catch (error) {
                console.error('Failed to save settings:', error);
                return false;
            }
        }
    },

    /**
     * Logging methods
     */
    log: {
        info: (message, data) => ipcRenderer.send('log-message', 'info', message, data),
        warn: (message, data) => ipcRenderer.send('log-message', 'warn', message, data),
        error: (message, data) => ipcRenderer.send('log-message', 'error', message, data),
        debug: (message, data) => ipcRenderer.send('log-message', 'debug', message, data)
    },

    /**
     * App information methods
     */
    app: {
        getVersion: async () => {
            try {
                return await ipcRenderer.invoke('get-app-version');
            } catch (error) {
                console.error('Failed to get app version:', error);
                return 'unknown';
            }
        }
    }
};

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
