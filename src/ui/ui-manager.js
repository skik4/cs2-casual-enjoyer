import StatusManager from "./status-manager.js";
import FriendsRenderer from "./friends-renderer.js";
import NotificationManager from "./notification-manager.js";

/**
 * UI Manager module
 * Facade that delegates to specialized UI managers
 */
class UIManager {
  /**
   * Cache for last rendered friends (for re-rendering on filter)
   */
  static get lastRenderedFriends() {
    return FriendsRenderer.lastRenderedFriends;
  }

  // Status Management Methods - delegate to StatusManager
  /**
   * Show a join status in its row's label and in the join bar
   * @param {string} id - Friend's Steam ID, or a map or server join id
   * @param {string} status - Join status
   */
  static updateLabel(id, status) {
    return StatusManager.updateLabel(id, status);
  }

  /**
   * Update the join button appearance and behavior
   * @param {string} friend_id - Steam ID of the friend
   * @param {string} status - Join status
   */
  static updateJoinButton(friend_id, status) {
    return StatusManager.updateJoinButton(friend_id, status);
  }

  // Friends Rendering Methods - delegate to FriendsRenderer
  /**
   * Render the list of friends in the UI
   * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
   * @param {Object} joinStates - Map of join states by friend Steam ID
   */
  static renderFriendsList(friends, joinStates = {}) {
    return FriendsRenderer.renderFriendsList(friends, joinStates);
  }

  /**
   * Render the manually tracked IDs in their own tab
   * @param {import('../shared/types.js').Friend[]} friends - Manually tracked entries
   * @param {Object} joinStates - Map of join states by Steam ID
   */
  static renderFakeFriendsList(friends, joinStates = {}) {
    return FriendsRenderer.renderFakeFriendsList(friends, joinStates);
  }

  /**
   * Last rendered manually tracked IDs
   */
  static get lastRenderedFakeFriends() {
    return FriendsRenderer.lastRenderedFakeFriends;
  }

  // Notification Methods - delegate to NotificationManager
  /**
   * Show a notification with close button
   * @param {string} html - HTML content of the notification
   * @param {string} type - Type of notification
   */
  static async showNotification(html, type = "info") {
    return await NotificationManager.showNotification(html, type);
  }

  /**
   * Show error to the user
   * @param {string|Error} message - Error message
   * @param {string} steamId - Steam ID for context
   */
  static showError(message, steamId = "") {
    return NotificationManager.showError(message, steamId);
  }

  /**
   * Hide notification
   */
  static hideNotification() {
    return NotificationManager.hideNotification();
  }

  /**
   * Show CS2 launch notification
   * @param {string} friendId - Steam ID of the friend being joined
   * @param {CS2Manager} cs2Manager - CS2Manager instance for handling launch operations
   * @returns {Promise<boolean>} - True if user chooses to launch CS2, false if cancelled
   */
  static showCS2LaunchNotification(friendId, cs2Manager) {
    return NotificationManager.showCS2LaunchNotification(friendId, cs2Manager);
  }

  /**
   * Hide CS2 launch notification
   */
  static hideCS2LaunchNotification() {
    return NotificationManager.hideCS2LaunchNotification();
  }

  // Help Methods - delegate to NotificationManager
  /**
   * Show help notification for Steam ID
   */
  static async showSteamIdHelp() {
    return await NotificationManager.showSteamIdHelp();
  }

  /**
   * Show help notification for API Key
   */
  static async showApiKeyHelp() {
    return await NotificationManager.showApiKeyHelp();
  }
}

export default UIManager;
