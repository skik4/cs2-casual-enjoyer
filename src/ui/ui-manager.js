import StatusManager from './status-manager.js';
import FriendsRenderer from './friends-renderer.js';
import NotificationManager from './notification-manager.js';
import { getTutorialManager } from './tutorial/tutorial-manager.js';

/**
 * UI Manager module
 * Facade that delegates to specialized UI managers
 */
class UIManager {    /**
     * Cache for last rendered friends (for re-rendering on filter)
     */
    static get lastRenderedFriends() {
        return FriendsRenderer.lastRenderedFriends;
    }

    // Status Management Methods - delegate to StatusManager
    /**
     * Get the appropriate CSS class for a status dot
     * @param {string} status - Join status
     * @returns {string} - CSS class for the status dot
     */
    static getStatusDotClass(status) {
        return StatusManager.getStatusDotClass(status);
    }

    /**
     * Update the status dot appearance based on join status
     * @param {string} friend_id - Steam ID of the friend
     * @param {string} status - Join status
     */
    static updateDot(friend_id, status) {
        return StatusManager.updateDot(friend_id, status);
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

    // Notification Methods - delegate to NotificationManager
    /**
     * Show a notification with close button
     * @param {string} html - HTML content of the notification
     * @param {string} type - Type of notification
     */
    static showNotification(html, type = 'info') {
        return NotificationManager.showNotification(html, type);
    }

    /**
     * Show persistent notification about token (steamid and expiration)
     * @param {{steamid: string, expires: number, expiresDate: Date}} tokenInfo
     */
    static showTokenInfoNotification(tokenInfo) {
        return NotificationManager.showTokenInfoNotification(tokenInfo);
    }

    /**
     * Hide token info notification
     */
    static hideTokenInfoNotification() {
        return NotificationManager.hideTokenInfoNotification();
    }

    /**
     * Show error to the user
     * @param {string|Error} message - Error message
     * @param {string} steamId - Steam ID for context
     */
    static showError(message, steamId = '') {
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
     * @param {Function} onLaunch - Callback for launch CS2 action
     * @param {CS2Manager} cs2Manager - CS2Manager instance for checking game status
     * @returns {Promise<boolean>} - True if user chooses to launch CS2, false if cancelled
     */
    static showCS2LaunchNotification(friendId, onLaunch, cs2Manager) {
        return NotificationManager.showCS2LaunchNotification(friendId, onLaunch, cs2Manager);
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
    static showSteamIdHelp() {
        return NotificationManager.showSteamIdHelp();
    }

    /**
     * Show help notification for API Key
     */
    static showApiKeyHelp() {
        return NotificationManager.showApiKeyHelp();
    }

    /**
     * Start the tutorial
     */
    static startTutorial() {
        const tutorialManager = getTutorialManager();
        return tutorialManager.start();
    }

    /**
     * Stop the tutorial
     */
    static stopTutorial() {
        const tutorialManager = getTutorialManager();
        return tutorialManager.stop();
    }
}

export default UIManager;