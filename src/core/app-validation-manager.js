import AppStateManager from './app-state-manager.js';
import logger from '../utils/logger.js';

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
    checkAndStartAutoRefresh(hasSaved, validSteamId, validApiKey, isTokenExpired) {
        const initialLoadAttempted = AppStateManager.getState('initialLoadAttempted');
        
        // Don't start auto-refresh if we already attempted initial load
        if (initialLoadAttempted) {
            return;
        }

        // Only start auto-refresh for users with saved settings that include friends list
        const savedFriendsIds = AppStateManager.getState('savedFriendsIds');
        const hasSavedFriends = savedFriendsIds && savedFriendsIds.length > 0;
        const hasValidSavedSettings = hasSaved && !isTokenExpired;

        // Show hint for new users with valid inputs but no saved friends
        const hasValidCurrentInputs = validSteamId && validApiKey && !isTokenExpired;
        this.updateHintVisibility(hasValidCurrentInputs, hasSavedFriends);

        // Start auto-refresh ONLY if we have valid saved settings AND saved friends list
        if (hasValidSavedSettings && hasSavedFriends) {
            logger.info('App', 'Starting auto-refresh - validation passed', {
                hasValidSavedSettings,
                hasSavedFriends,
                friendsCount: savedFriendsIds?.length || 0
            });

            setTimeout(() => {
                AppStateManager.setState('initialLoadAttempted', true);
                if (this.friendsManager) {
                    this.friendsManager.startAutoRefresh()
                        .catch(error => {
                            logger.error('App', 'Auto-refresh startup failed: ' + error.message);
                        });
                }
            }, 500);
        } else {
            logger.info('App', 'Auto-refresh not started - validation failed', {
                hasValidCurrentInputs,
                hasValidSavedSettings,
                hasSavedFriends,
                isTokenExpired
            });
        }
    }

    /**
     * Update hint visibility based on user state
     */
    updateHintVisibility(hasValidInputs, hasSavedFriends) {
        const hintElement = document.getElementById('update-hint');
        if (!hintElement) return;

        // Show hint if user has valid inputs but no saved friends list
        if (hasValidInputs && !hasSavedFriends) {
            hintElement.classList.add('show');
        } else {
            hintElement.classList.remove('show');
        }
    }
}

export default AppValidationManager;
