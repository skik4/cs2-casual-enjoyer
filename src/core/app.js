// Core singletons
import appInputManager from "./app-input-manager.js";
import appFriendsManager from "./app-friends-manager.js";
import appEventManager from "./app-event-manager.js";
import appValidationManager from "./app-validation-manager.js";
import appStateManager from "./app-state-manager.js";

// Game singletons
import joinManager from "../game/join-manager.js";
import cs2Manager from "../game/cs2-manager.js";

// UI and utilities
import UIManager from "../ui/ui-manager.js";
import tutorialManager from "../ui/tutorial/tutorial-manager.js";
import DOMUtils from "../utils/dom-utils.js";
import logger from "../utils/logger.js";
import { applyI18nToDom } from "../i18n/dom-i18n.js";

/**
 * Main application module
 * Coordinates all other modules and handles app lifecycle
 */
class App {
  constructor() {
    logger.info("App", "Creating App instance...");
    this.initialized = false;

    logger.info("App", "Initializing core managers...");
    // Initialize managers
    this.inputManager = appInputManager;
    this.friendsManager = appFriendsManager;
    this.eventManager = appEventManager;
    this.validationManager = appValidationManager;
    this.cs2Manager = cs2Manager;

    logger.info("App", "Setting up cross-references between managers...");
    // Set up cross-references
    this.inputManager.setValidationManager(this.validationManager);
    this.friendsManager.setManagers(
      this.inputManager,
      this.eventManager,
      this.validationManager
    );
    this.eventManager.setManagers(this.inputManager, this.friendsManager);
    this.validationManager.setFriendsManager(this.friendsManager);
    logger.info("App", "App instance created successfully");
  }
  /**
   * Initialize the application
   */ async initialize() {
    if (this.initialized) {
      logger.info("App", "Application already initialized, skipping");
      return;
    }
    logger.info("App", "Starting frontend application initialization...");

    try {
      logger.info("App", "Step 1: Applying static UI strings (data-i18n)");
      applyI18nToDom();

      logger.info("App", "Step 2: Disabling UI elements during initialization");
      // Disable update button initially
      const updateFriendsBtn = DOMUtils.getElementById("update-friends-btn");
      if (updateFriendsBtn) {
        updateFriendsBtn.disabled = true;
        logger.info("App", "Update friends button disabled");
      } else {
        logger.warn("App", "Update friends button not found");
      }
      logger.info("App", "Step 3: Setting up event listeners");
      // Setup event listeners
      this.eventManager.setupEventListeners();
      logger.info("App", "Event listeners configured successfully");

      logger.info("App", "Step 4: Configuring JoinManager UI callbacks");
      // Setup JoinManager UI callbacks
      joinManager.setUICallbacks(
        (friendId, status) => UIManager.updateDot(friendId, status),
        (friendId, status) => UIManager.updateJoinButton(friendId, status)
      );
      logger.info("App", "JoinManager UI callbacks set");

      logger.info("App", "Step 5: Initializing CS2Manager");
      // Initialize CS2Manager first
      this.cs2Manager.initialize(this.inputManager);
      logger.info("App", "CS2Manager initialized");

      logger.info("App", "Step 6: Connecting JoinManager with CS2Manager");
      // Set CS2Manager for JoinManager
      joinManager.setCS2Manager(this.cs2Manager);
      logger.info("App", "JoinManager connected to CS2Manager");

      logger.info("App", "Step 7: Setting CS2 launch callback");
      // Set CS2 launch callback
      joinManager.setCS2LaunchCallback(async (friendId) => {
        return UIManager.showCS2LaunchNotification(friendId, this.cs2Manager);
      });
      logger.info("App", "CS2 launch callback configured");

      logger.info("App", "Step 8: Loading saved settings from storage");
      // Load settings
      const savedSettings = await window.electronAPI.settings.load();
      logger.info(
        "App",
        "Settings loaded: " +
          JSON.stringify(
            savedSettings
              ? {
                  has_steam_id: !!savedSettings.steam_id,
                  has_auth: !!savedSettings.auth,
                  friend_count: savedSettings.friends_ids?.length || 0,
                }
              : null
          )
      );

      appStateManager.setState("savedSettings", savedSettings);
      logger.info("App", "Settings loaded and state updated");

      logger.info("App", "Step 9: Checking for first-time run and tutorial");
      // Check if this is the first run (no saved settings) and start tutorial
      const isFirstRun = !savedSettings;
      if (isFirstRun) {
        logger.info("App", "First run detected - starting tutorial");
        // Use TutorialManager's method to wait for UI and start tutorial
        tutorialManager.waitForUIAndStartTutorial();
      } else {
        logger.info("App", "Settings found - skipping tutorial auto-start");
      }
      if (savedSettings) {
        logger.info("App", "Step 10: Restoring saved configuration to UI");
        // Fill inputs with saved data
        const steamIdInput = DOMUtils.getElementById("steam-id");
        const authInput = DOMUtils.getElementById("auth");

        if (savedSettings.steam_id && steamIdInput) {
          steamIdInput.value = savedSettings.steam_id;
          logger.info("App", "Steam ID restored to input field");
        }

        if (savedSettings.auth && authInput) {
          authInput.value = savedSettings.auth;
          logger.info("App", "Auth token restored to input field");
        }
        if (
          savedSettings.friends_ids &&
          Array.isArray(savedSettings.friends_ids)
        ) {
          appStateManager.batchUpdate({
            savedFriendsIds: savedSettings.friends_ids,
            usingSavedFriends: true,
          });
          logger.info(
            "App",
            `${savedSettings.friends_ids.length} saved friends restored to state`
          );
        }
      } else {
        logger.info("App", "Step 9: No saved settings to restore");
      }
      logger.info("App", "Step 11: Final validation and UI state setup");
      // Call validateInputs at the end to set proper status and UI state
      this.inputManager.validateInputs();
      logger.info("App", "Input validation completed");
      // Initialize app version display (moved from inline script for CSP)
      try {
        if (window.electronAPI && window.electronAPI.app.getVersion) {
          const version = await window.electronAPI.app.getVersion();
          const el = document.getElementById("app-version");
          if (el && version) el.textContent = "v" + version + " ";
        }
      } catch (e) {
        logger.warn("App", "Unable to read app version", e?.message);
      }
      this.initialized = true;
      logger.info(
        "App",
        "Frontend application initialization completed successfully!"
      );
    } catch (error) {
      logger.error(
        "App",
        "Error during frontend app initialization: " + error.message
      );
      logger.error("App", "Stack trace: " + error.stack);
      UIManager.showError(
        (await import("../i18n/strings.js")).default.common
          .failedToInitializeAppPrefix + error.message
      );
    }
  }
}

// Create app instance and initialize when DOM is ready
logger.info("App", "Creating renderer process app instance...");
const app = new App();

document.addEventListener("DOMContentLoaded", async () => {
  logger.info(
    "App",
    "DOM ready, beginning frontend application initialization..."
  );
  await app.initialize();
});

// Export class for testing and external access
export default App;
logger.info("App", "Frontend app module loaded and ready");
