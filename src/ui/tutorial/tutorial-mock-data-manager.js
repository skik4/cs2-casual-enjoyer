import NotificationManager from '../notification-manager.js';

/**
 * Tutorial mock friend data for demonstration purposes
 */
const TUTORIAL_MOCK_FRIEND = {
    steamid: 'tutorial-mock-friend-76561198072344234',
    personaname: 'Gabe Newell',
    avatar: 'https://avatars.steamstatic.com/d5d4e1bc94e8dd0d7cfc3b42cd9b4e46e1c3dfc9_medium.jpg',
    avatarmedium: 'https://avatars.steamstatic.com/d5d4e1bc94e8dd0d7cfc3b42cd9b4e46e1c3dfc9_medium.jpg',
    avatarfull: 'https://avatars.steamstatic.com/d5d4e1bc94e8dd0d7cfc3b42cd9b4e46e1c3dfc9_full.jpg',
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
    }

    /**
     * Add tutorial mock friend to the friends list for demonstration
     */
    addTutorialMockFriend() {
        const friendsContainer = document.querySelector('#friends');
        if (!friendsContainer) return;

        // Check if mock friend already exists
        const existingMockFriend = document.querySelector(`#friend-${TUTORIAL_MOCK_FRIEND.steamid}`);
        if (existingMockFriend) return;

        // Import FriendsRenderer dynamically to avoid circular dependencies
        import('../friends-renderer.js').then(({ default: FriendsRenderer }) => {
            const mockFriendElement = FriendsRenderer.createFriendElement(
                TUTORIAL_MOCK_FRIEND,
                null, // no join state
                false, // not missing
                TUTORIAL_MOCK_FRIEND.avatarfull
            );

            // Add mock friend to the beginning of the list
            if (friendsContainer.firstChild) {
                friendsContainer.insertBefore(mockFriendElement, friendsContainer.firstChild);
            } else {
                friendsContainer.appendChild(mockFriendElement);
            }
        });
    }

    /**
     * Remove tutorial mock friend from the friends list
     */
    removeTutorialMockFriend() {
        const mockFriendElement = document.querySelector(`#friend-${TUTORIAL_MOCK_FRIEND.steamid}`);
        if (mockFriendElement) {
            mockFriendElement.remove();
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
