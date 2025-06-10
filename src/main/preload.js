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
    },

    /**
     * Logging methods - bridge renderer logs to main process
     */
    log: {
        error: (context, message, data) => ipcRenderer.send('log-error', context, message, data),
        warn: (context, message, data) => ipcRenderer.send('log-warn', context, message, data),
        info: (context, message, data) => ipcRenderer.send('log-info', context, message, data),
        debug: (context, message, data) => ipcRenderer.send('log-debug', context, message, data)
    }
};

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
