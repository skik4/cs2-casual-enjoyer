// Core singletons
import appStateManager from "./app-state-manager.js";

// UI and utilities
import tutorialManager from "../ui/tutorial/tutorial-manager.js";
import logger from "../utils/logger.js";

/**
 * Validation and auto-refresh management module
 * Handles validation logic and auto-refresh startup
 */
class AppValidationManager {
  constructor() {
    this.friendsManager = null;
  }

  /**
   * Set friends manager reference
   * @param {Object} friendsManager - Reference to friends manager
   */
  setFriendsManager(friendsManager) {
    this.friendsManager = friendsManager;
  }

  /**
   * Check validation and start auto-refresh if conditions are met
   */
  checkAndStartAutoRefresh(
    hasSaved,
    validSteamId,
    validApiKey,
    isTokenExpired
  ) {
    // Don't start auto-refresh if tutorial is active
    if (tutorialManager.isActive) {
      logger.info("App", "Auto-refresh not started - tutorial is active");
      return;
    }

    const initialLoadAttempted = appStateManager.getState(
      "initialLoadAttempted"
    );

    // Don't start auto-refresh if we already attempted initial load
    if (initialLoadAttempted) {
      return;
    }

    // Only start auto-refresh for users with saved settings that include friends list
    const savedFriendsIds = appStateManager.getState("savedFriendsIds");
    const hasSavedFriends = savedFriendsIds && savedFriendsIds.length > 0;
    const hasValidSavedSettings = hasSaved && !isTokenExpired;

    const hasValidCurrentInputs =
      validSteamId && validApiKey && !isTokenExpired;

    // Start auto-refresh ONLY if we have valid saved settings AND saved friends list
    if (hasValidSavedSettings && hasSavedFriends) {
      logger.info("App", "Starting auto-refresh - validation passed", {
        hasValidSavedSettings,
        hasSavedFriends,
        friendsCount: savedFriendsIds?.length || 0,
      });

      setTimeout(() => {
        appStateManager.setState("initialLoadAttempted", true);
        if (this.friendsManager) {
          this.friendsManager.startAutoRefresh().catch((error) => {
            logger.error(
              "App",
              "Auto-refresh startup failed: " + error.message
            );
          });
        }
      }, 500);
    } else {
      logger.info("App", "Auto-refresh not started - validation failed", {
        hasValidCurrentInputs,
        hasValidSavedSettings,
        hasSavedFriends,
        isTokenExpired,
      });
    }
  }

}

// Singleton instance
const appValidationManager = new AppValidationManager();

export default appValidationManager;

// export default AppValidationManager;
