import JoinManager from '../game/join-manager.js';
import UIManager from '../ui/ui-manager.js';
import stateManager from './state-manager.js';
import logger from '../utils/logger.js';
import AppInputManager from './app-input-manager.js';
import AppFriendsManager from './app-friends-manager.js';
import AppEventManager from './app-event-manager.js';
import AppValidationManager from './app-validation-manager.js';

/**
 * Main application module
 * Coordinates all other modules and handles app lifecycle
 */
class App {
    constructor() {
        this.initialized = false;
        
        // Initialize managers
        this.inputManager = new AppInputManager();
        this.friendsManager = new AppFriendsManager();
        this.eventManager = new AppEventManager();
        this.validationManager = new AppValidationManager();
        
        // Set up cross-references
        this.inputManager.setValidationManager(this.validationManager);
        this.friendsManager.setManagers(this.inputManager, this.eventManager, this.validationManager);
        this.eventManager.setManagers(this.inputManager, this.friendsManager);
        this.validationManager.setFriendsManager(this.friendsManager);
    }

    /**
     * Initialize the application
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Disable update button initially
            const updateFriendsBtn = document.getElementById('updateFriendsBtn');
            if (updateFriendsBtn) updateFriendsBtn.disabled = true;            
            
            // Setup event listeners
            this.eventManager.setupEventListeners();

            // Setup JoinManager UI callbacks
            JoinManager.setUICallbacks(
                (friendId, status) => UIManager.updateDot(friendId, status),
                (friendId, status) => UIManager.updateJoinButton(friendId, status)
            );

            // Load settings
            const savedSettings = await window.electronAPI.settings.load();
            logger.info('App', 'Settings loaded: ' + JSON.stringify(savedSettings ? {
                has_steam_id: !!savedSettings.steam_id,
                has_auth: !!savedSettings.auth,
                friend_count: savedSettings.friends_ids?.length || 0
            } : null));

            stateManager.setState('savedSettings', savedSettings);

            if (savedSettings) {
                // Fill inputs with saved data
                const steamIdInput = document.getElementById('steam_id');
                const authInput = document.getElementById('auth');

                if (savedSettings.steam_id && steamIdInput) {
                    steamIdInput.value = savedSettings.steam_id;
                }

                if (savedSettings.auth && authInput) {
                    authInput.value = savedSettings.auth;
                }                
                if (savedSettings.friends_ids && Array.isArray(savedSettings.friends_ids)) {
                    stateManager.batchUpdate({
                        savedFriendsIds: savedSettings.friends_ids,
                        usingSavedFriends: true
                    });
                }
            }

            // Call validateInputs at the end to set proper status and UI state
            this.inputManager.validateInputs();

            this.initialized = true;
        } catch (error) {
            logger.error('App', 'Error during app initialization: ' + error.message);
            UIManager.showError('Failed to initialize app: ' + error.message);
        }
    }
}

// Create app instance and initialize when DOM is ready
const app = new App();

document.addEventListener('DOMContentLoaded', async () => {
    await app.initialize();
});

// Export for external access
export default app;
