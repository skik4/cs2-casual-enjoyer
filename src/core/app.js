
// Core singletons
import appInputManager from './app-input-manager.js';
import appFriendsManager from './app-friends-manager.js';
import appEventManager from './app-event-manager.js';
import appValidationManager from './app-validation-manager.js';
import appStateManager from './app-state-manager.js';

// import AppInputManager from './app-input-manager.js';
// import AppEventManager from './app-event-manager.js';
// import AppValidationManager from './app-validation-manager.js';
// import CS2Manager from '../game/cs2-manager.js';

// Game singletons
import joinManager from '../game/join-manager.js';
import cs2Manager from '../game/cs2-manager.js';

// UI and utilities
import UIManager from '../ui/ui-manager.js';
import tutorialManager from '../ui/tutorial/tutorial-manager.js';
import DOMUtils from '../utils/dom-utils.js';
import logger from '../utils/logger.js';

/**
 * Main application module
 * Coordinates all other modules and handles app lifecycle
 */
class App {
    constructor() {
        this.initialized = false;

        // Initialize managers
        this.inputManager = appInputManager;
        this.friendsManager = appFriendsManager;
        this.eventManager = appEventManager;
        this.validationManager = appValidationManager;
        this.cs2Manager = cs2Manager;
        // this.inputManager = new AppInputManager();
        // this.eventManager = new AppEventManager();
        // this.validationManager = new AppValidationManager();
        // this.cs2Manager = new CS2Manager();

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
            const updateFriendsBtn = DOMUtils.getElementById('update-friends-btn');
            if (updateFriendsBtn) updateFriendsBtn.disabled = true;

            // Setup event listeners
            this.eventManager.setupEventListeners();

            // Setup JoinManager UI callbacks
            joinManager.setUICallbacks(
                (friendId, status) => UIManager.updateDot(friendId, status),
                (friendId, status) => UIManager.updateJoinButton(friendId, status)
            );

            // Initialize CS2Manager first
            this.cs2Manager.initialize(this.inputManager);

            // Set CS2Manager for JoinManager
            joinManager.setCS2Manager(this.cs2Manager);

            // Set CS2 launch callback
            joinManager.setCS2LaunchCallback(async (friendId) => {
                return UIManager.showCS2LaunchNotification(friendId, this.cs2Manager);
            });

            // Load settings
            const savedSettings = await window.electronAPI.settings.load();
            logger.info('App', 'Settings loaded: ' + JSON.stringify(savedSettings ? {
                has_steam_id: !!savedSettings.steam_id,
                has_auth: !!savedSettings.auth,
                friend_count: savedSettings.friends_ids?.length || 0
            } : null));

            appStateManager.setState('savedSettings', savedSettings);

            // Check if this is the first run (no saved settings) and start tutorial
            const isFirstRun = !savedSettings;
            if (isFirstRun) {
                logger.info('App', 'First run detected - starting tutorial');
                // Use TutorialManager's method to wait for UI and start tutorial
                tutorialManager.waitForUIAndStartTutorial();
            } else {
                logger.info('App', 'Settings found - skipping tutorial auto-start');
            }

            if (savedSettings) {
                // Fill inputs with saved data
                const steamIdInput = DOMUtils.getElementById('steam-id');
                const authInput = DOMUtils.getElementById('auth');

                if (savedSettings.steam_id && steamIdInput) {
                    steamIdInput.value = savedSettings.steam_id;
                }

                if (savedSettings.auth && authInput) {
                    authInput.value = savedSettings.auth;
                }
                if (savedSettings.friends_ids && Array.isArray(savedSettings.friends_ids)) {
                    appStateManager.batchUpdate({
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

// Export class for testing and external access
export default App;
console.log("APP LOADED");
