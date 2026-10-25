import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { WINDOW_CONFIG } from "../shared/constants.js";
import GsiService from "./gsi-service.js";
import SettingsStore from "./settings-store.js";
import { isAllowedExternalUrl } from "./external-links.js";
import {
  readMapFinderStore,
  writeMapFinderStore,
} from "./map-finder-store.js";

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

const settingsStore = new SettingsStore(SETTINGS_PATH, MainLogger);

/**
 * Open a URL in the OS if its scheme is one the app uses
 * @param {string} url - URL to open
 * @returns {boolean} - Whether it was handed to the OS
 */
function openExternalSafely(url) {
  if (!isAllowedExternalUrl(url)) {
    MainLogger.warn("Refused to open URL", { url });
    return false;
  }
  shell.openExternal(url);
  return true;
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

    // Links never open inside the app: web and Steam links go to the OS,
    // anything else is dropped, and the window never navigates away
    win.webContents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      event.preventDefault();
      openExternalSafely(url);
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

    // Settings handlers: the renderer reads the file and sends patches
    ipcMain.handle("settings-load", () => settingsStore.read());
    ipcMain.handle("settings-update", (event, patch) =>
      settingsStore.update(patch)
    );

    // App info handlers
    ipcMain.handle("get-app-version", () => {
      return app.getVersion();
    });

    // External links: steam:// joins and launches, https pages
    ipcMain.handle("open-external", (event, url) => {
      try {
        return openExternalSafely(url);
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
