const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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
    static readSettings() {
        try {
            if (fs.existsSync(SETTINGS_PATH)) {
                const data = fs.readFileSync(SETTINGS_PATH, 'utf-8');
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
    static writeSettings(data) {
        try {
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
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
                preload: path.join(__dirname, '..', 'main', 'preload.js')
            }
        });

        // Load the main HTML file
        const htmlPath = path.join(__dirname, '..', '..', 'index.html');
        win.loadFile(htmlPath);
        win.setMenuBarVisibility(false);

        // Handle external links
        win.webContents.setWindowOpenHandler(({ url }) => {
            const { shell } = require('electron');
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
     * @param {BrowserWindow} win - Window instance
     */
    static setupWindowControls(win) {
        ipcMain.on('window-minimize', () => {
            if (win && !win.isDestroyed()) {
                win.minimize();
            }
        });

        ipcMain.on('window-close', () => {
            if (win && !win.isDestroyed()) {
                win.close();
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
    initialize() {
        // Setup IPC handlers
        IPCManager.setupHandlers();

        // Create main window
        this.mainWindow = WindowManager.createMainWindow();
        
        // Setup window controls
        WindowManager.setupWindowControls(this.mainWindow);
    }    /**
     * Handle app activation
     */
    handleActivation() {
        // Create new window if none exist
        if (BrowserWindow.getAllWindows().length === 0) {
            this.initialize();
        }
    }
}

// Application instance
const appManager = new AppManager();

// App event handlers
app.whenReady().then(() => {
    appManager.initialize();
});

app.on('window-all-closed', () => {
    app.quit();
});