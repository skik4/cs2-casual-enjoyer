import NotificationManager from '../notification-manager.js';
import appStateManager from '../../core/app-state-manager.js';

/**
 * Tutorial mock friend data for demonstration purposes
 * Based on real Steam API response data
 */
const TUTORIAL_MOCK_FRIEND = {
    steamid: '76561197960287930',
    personaname: 'Rabscuttle',
    avatar: 'https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426.jpg',
    avatarmedium: 'https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_medium.jpg',
    avatarfull: 'https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg',
    avatarhash: 'c5d56249ee5d28a07db4ac9f7f60af961fab5426',
    profileurl: 'https://steamcommunity.com/id/GabeLoganNewell/',
    communityvisibilitystate: 2,
    profilestate: 1,
    personastate: 0,
    status: 'Playing Casual on Dust 2',
    in_casual_mode: true,
    join_available: true
};

/**
 * Tutorial Mock Data Manager
 * Handles mock friend and API notifications for tutorial demonstration
 */
export class TutorialMockDataManager {
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

        // Remove mock friend on final step (Tutorial Complete!)
        if (stepIndex === 9) {
            this.removeTutorialMockFriend();
        }
    }

    /**
     * Clean up all mock data
     */
    cleanup() {
        this.closeAPITokenNotification();
        this.removeTutorialMockFriend();
    }
}

export { TUTORIAL_MOCK_FRIEND };
