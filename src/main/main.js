import { app, BrowserWindow, ipcMain, shell } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import GsiService from "./gsi-service.js";
import {
  readMapFinderStore,
  writeMapFinderStore,
} from "./map-finder-store.js";

// Constants
const WINDOW_CONFIG = {
  WIDTH: 850,
  HEIGHT: 900,
  MIN_WIDTH: 850,
  MIN_HEIGHT: 800,
};

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const GSI_STORE_PATH = path.join(app.getPath("userData"), "gsi.json");
const MAP_FINDER_STORE_PATH = path.join(
  app.getPath("userData"),
  "map-finder.json"
);

/**
 * Simple main process logger
 */
class MainLogger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [MAIN] [${level.toUpperCase()}] ${message}`;

    console.log(logMessage);
    if (data) {
      console.log("Data:", data);
    }
  }

  static info(message, data = null) {
    this.log("info", message, data);
  }

  static warn(message, data = null) {
    this.log("warn", message, data);
  }

  static error(message, data = null) {
    this.log("error", message, data);
  }

  static debug(message, data = null) {
    this.log("debug", message, data);
  }
}

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
      if (
        await fs
          .access(SETTINGS_PATH)
          .then(() => true)
          .catch(() => false)
      ) {
        const data = await fs.readFile(SETTINGS_PATH, "utf-8");
        MainLogger.info("Settings loaded successfully");
        return JSON.parse(data);
      }
    } catch (error) {
      MainLogger.error("Error reading settings", error);
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
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2), "utf-8");
      MainLogger.info("Settings saved successfully");
      return true;
    } catch (error) {
      MainLogger.error("Error writing settings", error);
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
        preload: fileURLToPath(new URL("preload.cjs", import.meta.url)),
      },
    });

    // Load the main HTML file
    const htmlPath = fileURLToPath(
      new URL("../../index.html", import.meta.url)
    );
    win.loadFile(htmlPath);
    win.setMenuBarVisibility(false);

    // Handle external links
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    // Show window after content is loaded to prevent flash
    win.webContents.on("did-finish-load", () => {
      win.show();
    });

    return win;
  }

  /**
   * Setup window control IPC handlers
   * @param {BrowserWindow} window - Window instance
   */
  static setupWindowControls(window) {
    ipcMain.on("window-minimize", () => {
      if (window && !window.isDestroyed()) {
        window.minimize();
      }
    });

    ipcMain.on("window-close", () => {
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
   * @param {GsiService} gsiService - CS2 Game State Integration service
   */
  static setupHandlers(gsiService) {
    // GSI setup status; resolves once the service has finished starting
    ipcMain.handle("gsi-get-status", () => gsiService.getStatus());

    // Map finder: the player pool and friends of friends kept between runs
    ipcMain.handle("map-finder-load", () =>
      readMapFinderStore(MAP_FINDER_STORE_PATH)
    );
    ipcMain.handle("map-finder-save", (event, data) =>
      writeMapFinderStore(MAP_FINDER_STORE_PATH, data)
    );

    // Settings handlers
    ipcMain.handle("settings-load", () => {
      return SettingsManager.readSettings();
    });

    ipcMain.handle("settings-save", (event, data) => {
      return SettingsManager.writeSettings(data);
    });

    // App info handlers
    ipcMain.handle("get-app-version", () => {
      return app.getVersion();
    });

    // External links handler (open directly, no protocol filtering by request)
    ipcMain.handle("open-external", (event, url) => {
      try {
        shell.openExternal(url);
        return true;
      } catch (error) {
        MainLogger.error("Failed to open external URL", { url, error });
        return false;
      }
    });

    // Logging handlers - receive logs from renderer process
    ipcMain.on("log-error", (event, context, message, data) => {
      MainLogger.error(`[${context}] ${message}`, data);
    });

    ipcMain.on("log-warn", (event, context, message, data) => {
      MainLogger.warn(`[${context}] ${message}`, data);
    });

    ipcMain.on("log-info", (event, context, message, data) => {
      MainLogger.info(`[${context}] ${message}`, data);
    });

    ipcMain.on("log-debug", (event, context, message, data) => {
      MainLogger.debug(`[${context}] ${message}`, data);
    });
  }
}

/**
 * Application lifecycle management
 */
class AppManager {
  constructor() {
    this.mainWindow = null;
    this.gsiService = new GsiService({
      storePath: GSI_STORE_PATH,
      logger: MainLogger,
    });
  }

  /**
   * Initialize the application
   */
  async initialize() {
    // Setup IPC handlers
    IPCManager.setupHandlers(this.gsiService);

    // Create main window
    this.mainWindow = WindowManager.createMainWindow();

    // Setup window controls
    WindowManager.setupWindowControls(this.mainWindow);

    // Optional: without GSI the renderer reads the user's state from the
    // Steam Web API, so this is not awaited and never blocks the window
    this.gsiService.start((state) => {
      const win = this.mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send("gsi-state", state);
      }
    });
  }
}

// Application instance
const appManager = new AppManager();

// App event handlers
app.whenReady().then(async () => {
  MainLogger.info("Electron app ready, initializing main process...");
  await appManager.initialize();
  MainLogger.info("Main process initialized, creating application window");
});

app.on("window-all-closed", () => {
  MainLogger.info("All windows closed, quitting application");
  app.quit();
});

app.on("will-quit", () => {
  appManager.gsiService.stop();
});
