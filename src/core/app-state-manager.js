// Shared constants
import { API_CONFIG } from "../shared/constants.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * State manager for the application
 * Holds the state the managers share
 */
class AppStateManager {
  constructor() {
    this.state = {
      friendsData: [],
      friendsRefreshInterval: null,
      savedSettings: null,
      usingSavedFriends: false,
      savedFriendsIds: [],
      autoRefreshIntervalMs: API_CONFIG.AUTO_REFRESH_INTERVAL_MS,
      initialLoadAttempted: false,
    };
  }

  /**
   * Get state value by key
   * @param {string} key - State key
   * @returns {any} - State value
   */
  getState(key) {
    return this.state[key];
  }

  /**
   * Set state value
   * @param {string} key - State key
   * @param {any} value - New value
   */
  setState(key, value) {
    logger.logStateChange(key, this.state[key], value);
    this.state[key] = value;
  }

  /**
   * Update multiple state values at once
   * @param {Object} updates - Object with key-value pairs to update
   */
  batchUpdate(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.setState(key, value);
    }
  }

  /**
   * Clear the friends refresh interval
   */
  clearRefreshInterval() {
    const interval = this.getState("friendsRefreshInterval");
    if (interval) {
      clearInterval(interval);
      this.setState("friendsRefreshInterval", null);
      logger.debug("StateManager", "Friends refresh interval cleared");
    }
  }
}

// Create singleton instance
const appStateManager = new AppStateManager();

export default appStateManager;
