import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Constants
const WINDOW_CONFIG = {
    WIDTH: 850,
    HEIGHT: 900,
    MIN_WIDTH: 850,
    MIN_HEIGHT: 800
};

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

/**
 * Settings management utilities
 */
class SettingsManager {
    /**
     * Read settings from file
     * @returns {Object|null} - Settings object or null if not found
     */
    static async readSettings() {
        try {
            if (await fs.access(SETTINGS_PATH).then(() => true).catch(() => false)) {
                const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error reading settings:', error);
        }
        return null;
    }

    /**
     * Write settings to file
     * @param {Object} data - Settings data to write
     * @returns {boolean} - Success status
     */
    static async writeSettings(data) {
        try {
            await fs.writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('Error writing settings:', error);
            return false;
        }
    }
}

/**
 * Window management utilities
 */
class WindowManager {
    /**
     * Create the main application window
     * @returns {BrowserWindow} - The created window
     */
    static createMainWindow() {
        const win = new BrowserWindow({
            width: WINDOW_CONFIG.WIDTH,
            height: WINDOW_CONFIG.HEIGHT,
            minWidth: WINDOW_CONFIG.MIN_WIDTH,
            minHeight: WINDOW_CONFIG.MIN_HEIGHT,
            frame: false,
            resizable: true,
            maximizable: true,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: fileURLToPath(new URL('preload.js', import.meta.url))
            }
        });

        // Load the main HTML file
        const htmlPath = fileURLToPath(new URL('../../index.html', import.meta.url));
        win.loadFile(htmlPath);
        win.setMenuBarVisibility(false);

        // Handle external links
        win.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        // Show window after content is loaded to prevent flash
        win.webContents.on('did-finish-load', () => {
            win.show();
        });

        return win;
    }

    /**
     * Setup window control IPC handlers
     * @param {BrowserWindow} window - Window instance
     */
    static setupWindowControls(window) {
        ipcMain.on('window-minimize', () => {
            if (window && !window.isDestroyed()) {
                window.minimize();
            }
        });

        ipcMain.on('window-close', () => {
            if (window && !window.isDestroyed()) {
                window.close();
            }
        });
    }
}

/**
 * IPC handlers setup
 */
class IPCManager {
    /**
     * Setup all IPC handlers
     */
    static setupHandlers() {
        // Settings handlers
        ipcMain.handle('settings-load', () => {
            return SettingsManager.readSettings();
        });

        ipcMain.handle('settings-save', (event, data) => {
            return SettingsManager.writeSettings(data);
        });

        // App info handlers
        ipcMain.handle('get-app-version', () => {
            return app.getVersion();
        });

        // Logging handler
        ipcMain.on('log-message', (event, level, message, data) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
        });
    }
}

/**
 * Application lifecycle management
 */
class AppManager {
    constructor() {
        this.mainWindow = null;
    }

    /**
     * Initialize the application
     */
    async initialize() {
        // Setup IPC handlers
        IPCManager.setupHandlers();

        // Create main window
        this.mainWindow = WindowManager.createMainWindow();

        // Setup window controls
        WindowManager.setupWindowControls(this.mainWindow);
    }
}

// Application instance
const appManager = new AppManager();

// App event handlers
app.whenReady().then(async () => {
    await appManager.initialize();
});

app.on('window-all-closed', () => {
    app.quit();
});