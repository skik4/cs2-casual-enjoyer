import UIManager from '../ui/ui-manager.js';
import joinManager from '../game/join-manager.js';
import DOMUtils from '../utils/dom-utils.js';
import { getTutorialManager } from '../ui/tutorial/tutorial-manager.js';

/**
 * Event management module
 * Handles all DOM event listeners and event delegation
 */
class AppEventManager {
    constructor() {
        this.inputManager = null;
        this.friendsManager = null;
        this.friendsClickHandler = null;
    }

    /**
     * Set manager references
     * @param {Object} inputManager - Reference to input manager
     * @param {Object} friendsManager - Reference to friends manager
     */
    setManagers(inputManager, friendsManager) {
        this.inputManager = inputManager;
        this.friendsManager = friendsManager;
    }

    /**
     * Setup all app event listeners
     */
    setupEventListeners() {
        const updateFriendsBtn = DOMUtils.getElementById('update-friends-btn');
        const steamIdInput = DOMUtils.getElementById('steam-id');
        const authInput = DOMUtils.getElementById('auth');

        if (updateFriendsBtn && this.friendsManager) {
            updateFriendsBtn.addEventListener('click', () => this.friendsManager.updateFriendsList());
        }

        if (steamIdInput && this.inputManager) {
            steamIdInput.addEventListener('input', this.inputManager.validateInputs.bind(this.inputManager));
            steamIdInput.addEventListener('paste', this.inputManager.handleSteamIdPaste.bind(this.inputManager));
        }
        if (authInput && this.inputManager) {
            authInput.addEventListener('input', this.inputManager.handleAuthInput.bind(this.inputManager));
        }

        // Help links
        const steamIdHelp = DOMUtils.getElementById('steam-id-help');
        if (steamIdHelp) {
            steamIdHelp.addEventListener('click', (e) => {
                e.preventDefault();
                UIManager.showSteamIdHelp();
            });
        }

        const apiKeyHelp = DOMUtils.getElementById('api-key-help');
        if (apiKeyHelp) {
            apiKeyHelp.addEventListener('click', (e) => {
                e.preventDefault();
                UIManager.showApiKeyHelp();
            });
        }

        // Friend filter input - use incremental update to preserve animations
        const filterInput = DOMUtils.getElementById('friend-filter-input');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                if (UIManager.lastRenderedFriends) {
                    const joinStates = joinManager.getJoinStates();
                    // Use the same incremental update as normal rendering
                    UIManager.renderFriendsList(UIManager.lastRenderedFriends, joinStates);
                }
            });
        }

        // Setup friend listeners using event delegation
        this.setupFriendListeners();
    }

    /**
     * Setup event listeners for friend join buttons using event delegation
     */
    setupFriendListeners() {
        const friendsContainer = DOMUtils.getElementById('friends');
        if (!friendsContainer) return;

        // Remove existing listener if it exists
        if (this.friendsClickHandler) {
            friendsContainer.removeEventListener('click', this.friendsClickHandler);
        }

        // Create new click handler
        this.friendsClickHandler = (event) => {
            const button = event.target.closest('[id^="join-btn-"]');
            if (!button) return;

            const steamId = button.id.replace('join-btn-', '');
            if (!steamId) return;

            // Check if tutorial is active and on step 7 (Join to Friend Game)
            const tutorialManager = getTutorialManager();
            if (tutorialManager.stateManager.getIsActive() &&
                tutorialManager.stateManager.getCurrentStep() === 7) {
                // This is the tutorial join step - don't perform real join
                event.preventDefault();
                event.stopPropagation();

                // Move to next tutorial step instead
                tutorialManager.nextStep();
                return;
            }

            if (button.classList.contains('cancel-btn')) {
                joinManager.cancelJoin(steamId);
            } else {
                joinManager.startJoin(steamId);
            }
        };

        // Add event listener using delegation
        friendsContainer.addEventListener('click', this.friendsClickHandler);
    }
}

export default AppEventManager;
