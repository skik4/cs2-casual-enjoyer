// Shared constants
import { TUTORIAL_MOCK_FRIEND } from '../../shared/constants.js';

// Core singletons
import appStateManager from '../../core/app-state-manager.js';

// UI and utilities
import NotificationManager from '../notification-manager.js';

/**
 * Tutorial Mock Data Manager
 * Handles mock friend and API notifications for tutorial demonstration
 */
export class TutorialMockDataManager {
    constructor() {
        this.mockConnectionInterval = null;
        this.activeTimeouts = new Set(); // Track all active timeouts
    }

    /**
     * Open API token notification if not already open
     * @param {number} currentStep - Current tutorial step
     * @param {Function} onNotificationReady - Callback when notification is ready
     */
    openAPITokenNotification(currentStep, onNotificationReady = null) {
        const notificationElement = document.querySelector('#notifications');

        // Check if notification is not already visible
        if (!notificationElement || notificationElement.style.display === 'none' || !notificationElement.style.display) {
            // Use NotificationManager directly instead of simulating click
            NotificationManager.showApiKeyHelp();

            // If we're on step 2, wait for the notification to fully load
            if (currentStep === 2 && onNotificationReady) {
                onNotificationReady();
            }
        } else if (currentStep === 2 && onNotificationReady) {
            // Notification is already open, call callback immediately
            onNotificationReady();
        }
    }

    /**
     * Close API token notification if open
     */
    closeAPITokenNotification() {
        // Use NotificationManager directly instead of simulating button click
        NotificationManager.hideNotification();
    }    /**
     * Add tutorial mock friend to the application state
     */
    addTutorialMockFriend() {
        // Set flag in app state that tutorial mock friend should be displayed
        appStateManager.setState('showTutorialMockFriend', true);

        // Immediately re-render friends list to show mock friend
        this.rerenderFriendsList();
    }

    /**
     * Remove tutorial mock friend from the application state
     */
    removeTutorialMockFriend() {
        // Remove flag from app state
        appStateManager.setState('showTutorialMockFriend', false);

        // Immediately re-render friends list to hide mock friend
        this.rerenderFriendsList();
    }

    /**
     * Re-render the friends list with current data
     */
    rerenderFriendsList() {
        // Get current friends data from app state
        const friendsData = appStateManager.getState('friendsData');
        if (friendsData && Array.isArray(friendsData)) {
            // Dynamically import to avoid circular dependencies
            import('../../game/join-manager.js').then(({ default: joinManager }) => {
                const joinStates = joinManager.getJoinStates();
                import('../friends-renderer.js').then(({ default: FriendsRenderer }) => {
                    FriendsRenderer.renderFriendsList(friendsData, joinStates);
                });
            });
        }
    }

    /**
     * Handle step-specific mock data based on step transitions
     * @param {number} stepIndex - Current step index
     * @param {number|null} previousStepIndex - Previous step index
     */
    handleStepMockData(stepIndex, previousStepIndex = null) {
        // Handle API notification based on step transitions
        if (previousStepIndex === 2 && stepIndex !== 2) {
            // Leaving step 2 (Get Steam Web API Token) - close notification
            this.closeAPITokenNotification();
        } else if (stepIndex === 2 && previousStepIndex !== 2) {
            // Entering step 2 (Get Steam Web API Token) - open notification
            this.openAPITokenNotification(stepIndex);
        }

        // Handle mock friend based on step transitions
        if (previousStepIndex !== null && previousStepIndex >= 6 && stepIndex < 6) {
            // Moving back from Friends List Display step (6) or later - remove mock friend
            this.removeTutorialMockFriend();
        } else if (stepIndex >= 6 && (previousStepIndex === null || previousStepIndex < 6)) {
            // Entering Friends List Display step (6) or later - add mock friend
            this.addTutorialMockFriend();
        }

        // Handle mock connection process for step 8 (Connection Process)
        if (stepIndex === 8 && previousStepIndex !== 8) {
            // Entering Connection Process step - start mock connection
            // Add small delay to ensure previous process is fully stopped
            setTimeout(() => {
                if (stepIndex === 8) { // Double-check we're still on step 8
                    this.startMockConnectionProcess();
                }
            }, 50);
        } else if (previousStepIndex === 8 && stepIndex !== 8) {
            // Leaving Connection Process step - stop mock connection
            this.stopMockConnectionProcess();
        }
    }

    /**
     * Start mock connection process for tutorial step 8 (Connection Process)
     * Simulates the join process with red -> yellow -> green cycle
     */
    startMockConnectionProcess() {
        // Stop any existing mock process
        this.stopMockConnectionProcess();

        const mockFriendId = TUTORIAL_MOCK_FRIEND.steamid;

        // Import StatusManager dynamically to avoid circular dependency
        import('../status-manager.js').then(({ default: StatusManager }) => {
            let currentStep = 0;
            const steps = [
                { status: 'waiting', duration: 1200 },     // Red - checking for available slots
                { status: 'connecting', duration: 2400 },  // Yellow - attempting to connect (longer)
                { status: 'joined', duration: 1200 }       // Green - successfully connected
            ];

            const runStep = () => {
                // Check if process was stopped
                if (!this.mockConnectionInterval) return;

                const step = steps[currentStep % steps.length];

                // Update the status dot
                StatusManager.updateDot(mockFriendId, step.status);

                // Schedule next step
                const timeoutId = setTimeout(() => {
                    // Remove this timeout from tracking set
                    this.activeTimeouts.delete(timeoutId);

                    currentStep++;
                    if (this.mockConnectionInterval) {
                        runStep();
                    }
                }, step.duration);

                // Track this timeout for cleanup
                this.activeTimeouts.add(timeoutId);
            };

            // Start the process
            this.mockConnectionInterval = true;
            runStep();
        });
    }

    /**
     * Stop mock connection process
     */
    stopMockConnectionProcess() {
        // Stop the process flag
        this.mockConnectionInterval = null;

        // Clear all active timeouts
        this.activeTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.activeTimeouts.clear();

        // Reset to default state if mock friend exists
        const mockFriendId = TUTORIAL_MOCK_FRIEND.steamid;
        import('../status-manager.js').then(({ default: StatusManager }) => {
            StatusManager.updateDot(mockFriendId, 'cancelled');
        });
    }

    /**
     * Clean up all mock data
     */
    cleanup() {
        this.closeAPITokenNotification();
        this.removeTutorialMockFriend();
        this.stopMockConnectionProcess();
    }
}

// Singleton instance
const tutorialMockDataManager = new TutorialMockDataManager();

export default tutorialMockDataManager;