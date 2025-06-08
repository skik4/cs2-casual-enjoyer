import SteamAPI from '../steam/steam-api.js';
import UIManager from '../ui/ui-manager.js';
import joinManager from '../game/join-manager.js';
import Validators from '../utils/validators.js';
import ErrorHandler from '../utils/error-handler.js';
import DOMUtils from '../utils/dom-utils.js';

import appStateManager from './app-state-manager.js';
import logger from '../utils/logger.js';

/**
 * Friends management module
 * Handles friends list operations and auto-refresh
 */
class AppFriendsManager {
    constructor() {
        this.inputManager = null;
        this.eventManager = null;
        this.validationManager = null;
    }

    /**
     * Set manager references
     * @param {Object} inputManager - Reference to input manager
     * @param {Object} eventManager - Reference to event manager
     * @param {Object} validationManager - Reference to validation manager
     */
    setManagers(inputManager, eventManager, validationManager) {
        this.inputManager = inputManager;
        this.eventManager = eventManager;
        this.validationManager = validationManager;
    }

    /**
     * Fetch and render friends by their IDs
     * @param {string[]} friendIds - Array of friend Steam IDs
     * @param {string} auth - API key or token
     * @param {boolean} [keepStates=false] - Whether to preserve join states
     * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friends
     */
    async fetchAndRenderFriendsByIds(friendIds, auth, keepStates = false) {
        if (!friendIds || !friendIds.length) {
            logger.error('App', "No friend IDs provided to fetchAndRenderFriendsByIds");
            return [];
        }

        try {
            const allStatuses = await SteamAPI.getFriendsStatuses(friendIds, auth);

            const supportedFriends = allStatuses.filter(friend => friend.in_casual_mode);

            appStateManager.setState('friendsData', supportedFriends);
            const joinStates = keepStates ? joinManager.getJoinStates() : {};
            UIManager.renderFriendsList(supportedFriends, joinStates);

            // Setup friend listeners after rendering
            if (this.eventManager) {
                this.eventManager.setupFriendListeners();
            }

            logger.info('App', `Friends update completed: ${supportedFriends.length} supported friends found, ${supportedFriends.filter(f => f.join_available).length} joinable`);

            return supportedFriends;
        } catch (error) {
            ErrorHandler.logError('App.fetchAndRenderFriendsByIds', error);
            if (!keepStates) UIManager.showError(error.message || error);
            throw error;
        }
    }

    /**
     * Update friends list
     */
    async updateFriendsList() {
        let steam_id = this.inputManager ? this.inputManager.getSteamId() : '';
        let auth = this.inputManager ? this.inputManager.getAuth() : '';

        const savedSettings = appStateManager.getState('savedSettings');
        if ((!steam_id || !auth) && savedSettings) {
            if (!steam_id && savedSettings.steam_id) steam_id = savedSettings.steam_id;
            if (!auth && savedSettings.auth) auth = savedSettings.auth;
        }

        auth = SteamAPI.extractApiKeyOrToken(auth);

        if (!steam_id || !auth) {
            UIManager.showError("Please enter your SteamID64 and API Key");
            return;
        }

        const validation = Validators.validateRequiredFields({ steamId: steam_id, auth });
        if (!validation.valid) {
            UIManager.showError(validation.errors.join('. '));
            return;
        }

        // Check if settings changed
        if (savedSettings &&
            (savedSettings.steam_id !== steam_id || savedSettings.auth !== auth)) {
            localStorage.removeItem('hide_privacy_warning');
            appStateManager.setState('usingSavedFriends', false);
        }

        const updateBtn = DOMUtils.getElementById('update-friends-btn');
        if (updateBtn) {
            updateBtn.disabled = true;
            updateBtn.textContent = "Updating...";
        }

        try {
            let allFriendIds = [];
            try {
                allFriendIds = await SteamAPI.getFriendsList(steam_id, auth);
                UIManager.hideNotification();
            } catch (err) {
                UIManager.showError(err, steam_id);
                return;
            } finally {
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.textContent = "Update Friends List";
                }
            }
            if (!allFriendIds.length) {
                UIManager.showError("No friends found in your friends list.", steam_id);
                return;
            }

            // Update state
            appStateManager.batchUpdate({
                savedFriendsIds: allFriendIds,
                usingSavedFriends: true
            });

            // Get friend statuses (avatars will be loaded only for supported players)
            const statuses = await SteamAPI.getFriendsStatuses(allFriendIds, auth);
            const supportedFriends = statuses.filter(friend => friend.in_casual_mode);

            // Save settings without avatars (they will be loaded on demand)
            const saveResult = await window.electronAPI.settings.save({
                steam_id,
                auth: auth,
                friends_ids: allFriendIds
            });

            // Reset join states
            joinManager.resetAll();

            // Render friends
            appStateManager.setState('friendsData', supportedFriends);
            const joinStates = joinManager.getJoinStates();
            UIManager.renderFriendsList(supportedFriends, joinStates);

            // Setup friend listeners after rendering
            if (this.eventManager) {
                this.eventManager.setupFriendListeners();
            }

            // Hide the hint since we now have friends data
            if (this.validationManager) {
                this.validationManager.updateHintVisibility(false, true);
            }

            this.startAutoRefresh();
        } catch (error) {
            ErrorHandler.logError('App.updateFriendsList', error);
            UIManager.showError(error.message || error, steam_id);
        } finally {
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = "Update Friends List";
            }
        }
    }

    /**
     * Start auto-refresh for friends list
     */
    async startAutoRefresh() {
        const auth = this.inputManager ? this.inputManager.getAuth() : '';

        const savedFriendsIds = appStateManager.getState('savedFriendsIds');
        if (!savedFriendsIds || !Array.isArray(savedFriendsIds) || savedFriendsIds.length === 0) {
            logger.info('App', 'No saved friends found for auto-refresh');
            return;
        }
        logger.info('App', `Starting auto-refresh with ${savedFriendsIds.length} saved friends`);

        try {
            await this.fetchAndRenderFriendsByIds(savedFriendsIds, auth, true);

            // Clear existing interval
            appStateManager.clearRefreshInterval();

            // Set new interval
            const autoRefreshIntervalMs = appStateManager.getState('autoRefreshIntervalMs');
            const interval = setInterval(async () => {
                const usingSavedFriends = appStateManager.getState('usingSavedFriends');
                const currentSavedFriendsIds = appStateManager.getState('savedFriendsIds');

                if (usingSavedFriends && currentSavedFriendsIds.length) {
                    try {
                        await this.fetchAndRenderFriendsByIds(currentSavedFriendsIds, auth, true);
                    } catch (error) {
                        logger.warn('App', "Auto-refresh fetch failed", { error: error.message });
                    }
                }
            }, autoRefreshIntervalMs);

            appStateManager.setState('friendsRefreshInterval', interval);
            logger.info('App', "Auto-refresh of supported friends status started");
        } catch (error) {
            logger.error('App', "Failed to start auto-refresh", { error: error.message });
            throw error;
        }
    }
}

export default AppFriendsManager;
