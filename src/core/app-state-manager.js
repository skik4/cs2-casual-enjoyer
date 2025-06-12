// Shared constants
import { API_CONFIG } from "../shared/constants.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * Reactive state manager for the application
 * Provides centralized state management with subscription capabilities
 */
class AppStateManager {
  constructor() {
    this.state = {
      friendsData: [],
      friendsRefreshInterval: null,
      savedSettings: null,
      usingSavedFriends: false,
      savedFriendsIds: [],
      savedAvatars: {},
      autoRefreshIntervalMs: API_CONFIG.AUTO_REFRESH_INTERVAL_MS,
      initialLoadAttempted: false,
      isLoading: false,
      lastError: null,
    };

    this.subscribers = new Map();
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
   * Set state value and notify subscribers
   * @param {string} key - State key
   * @param {any} value - New value
   */
  setState(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Log state changes
    logger.logStateChange(key, oldValue, value);

    if (oldValue !== value) {
      this.notifySubscribers(key, value, oldValue);
    }
  }

  /**
   * Subscribe to state changes
   * @param {string} key - State key to watch
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }

    this.subscribers.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const keySubscribers = this.subscribers.get(key);
      if (keySubscribers) {
        keySubscribers.delete(callback);
        if (keySubscribers.size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  /**
   * Notify all subscribers of a state change
   * @param {string} key - State key that changed
   * @param {any} newValue - New value
   * @param {any} oldValue - Previous value
   */
  notifySubscribers(key, newValue, oldValue) {
    const keySubscribers = this.subscribers.get(key);
    if (keySubscribers) {
      keySubscribers.forEach((callback) => {
        try {
          callback(newValue, oldValue, key);
        } catch (error) {
          logger.error("StateManager", "Error in state subscriber", {
            key,
            error: error.message,
          });
        }
      });
    }
  }

  /**
   * Update multiple state values at once
   * @param {Object} updates - Object with key-value pairs to update
   */
  batchUpdate(updates) {
    const changedKeys = [];

    for (const [key, value] of Object.entries(updates)) {
      const oldValue = this.state[key];
      this.state[key] = value;

      // Log state changes
      logger.logStateChange(key, oldValue, value);

      if (oldValue !== value) {
        changedKeys.push({ key, value, oldValue });
      }
    }

    // Notify all changed keys
    changedKeys.forEach(({ key, value, oldValue }) => {
      this.notifySubscribers(key, value, oldValue);
    });

    if (changedKeys.length > 0) {
      logger.debug("StateManager", `Batch update completed`, {
        changedKeys: changedKeys.map((c) => c.key),
        updateCount: changedKeys.length,
      });
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

  /**
   * Get all current state (for debugging)
   * @returns {Object} - Current state object
   */
  getAllState() {
    return { ...this.state };
  }
}

// Create singleton instance
const appStateManager = new AppStateManager();

export default appStateManager;
