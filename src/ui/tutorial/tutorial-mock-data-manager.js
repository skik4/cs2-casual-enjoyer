// Shared constants
import { TUTORIAL_MOCK_FRIEND } from "../../shared/constants.js";

// Core singletons
import appStateManager from "../../core/app-state-manager.js";

// Game singletons
import joinManager from "../../game/join-manager.js";

// UI and utilities
import FriendsRenderer from "../friends-renderer.js";
import FakeFriendsManager from "../fake-friends-manager.js";
import NotificationManager from "../notification-manager.js";
import StatusManager from "../status-manager.js";
import { TUTORIAL_TIMING } from "./tutorial-timing.js";
import { TUTORIAL_STEPS } from "./tutorial-steps.js";
import { t } from "../../i18n/i18n-manager.js";

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
    const notificationElement = document.querySelector("#notifications");

    // Check if notification is not already visible
    if (
      !notificationElement ||
      notificationElement.style.display === "none" ||
      !notificationElement.style.display
    ) {
      // Use NotificationManager directly instead of simulating click
      NotificationManager.showApiKeyHelp();

      // If we're on the token page step, wait for the notification to fully load
      if (currentStep === TUTORIAL_STEPS.TOKEN_PAGE && onNotificationReady) {
        onNotificationReady();
      }
    } else if (currentStep === TUTORIAL_STEPS.TOKEN_PAGE && onNotificationReady) {
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
  } /**
   * Add tutorial mock friend to the application state
   */
  addTutorialMockFriend() {
    // Set flag in app state that tutorial mock friend should be displayed
    appStateManager.setState("showTutorialMockFriend", true);

    // Immediately re-render friends list to show mock friend
    this.rerenderFriendsList();
  }

  /**
   * Remove tutorial mock friend from the application state
   */
  removeTutorialMockFriend() {
    // Remove flag from app state
    appStateManager.setState("showTutorialMockFriend", false);

    // Immediately re-render friends list to hide mock friend
    this.rerenderFriendsList();
  }

  /**
   * Re-render the friends list with current data
   */
  rerenderFriendsList() {
    // Get current friends data from app state
    const friendsData = appStateManager.getState("friendsData");
    if (friendsData && Array.isArray(friendsData)) {
      const joinStates = joinManager.getJoinStates();
      // Manually tracked IDs have their own tab
      const { friends } = FakeFriendsManager.splitFakeFriends(friendsData);
      FriendsRenderer.renderFriendsList(friends, joinStates);
    }
  }

  /**
   * Handle step-specific mock data based on step transitions
   * @param {number} stepIndex - Current step index
   * @param {number|null} previousStepIndex - Previous step index
   */
  handleStepMockData(stepIndex, previousStepIndex = null) {
    const { TOKEN_PAGE, FRIENDS_LIST, CONNECTION } = TUTORIAL_STEPS;

    // Handle API notification based on step transitions
    if (previousStepIndex === TOKEN_PAGE && stepIndex !== TOKEN_PAGE) {
      // Leaving the token page step - close notification
      this.closeAPITokenNotification();
    } else if (stepIndex === TOKEN_PAGE && previousStepIndex !== TOKEN_PAGE) {
      // Entering the token page step - open notification
      this.openAPITokenNotification(stepIndex);
    }

    // Handle mock friend based on step transitions
    if (
      previousStepIndex !== null &&
      previousStepIndex >= FRIENDS_LIST &&
      stepIndex < FRIENDS_LIST
    ) {
      // Moving back from the friends list step or later - remove mock friend
      this.removeTutorialMockFriend();
    } else if (
      stepIndex >= FRIENDS_LIST &&
      (previousStepIndex === null || previousStepIndex < FRIENDS_LIST)
    ) {
      // Entering the friends list step or later - add mock friend
      this.addTutorialMockFriend();
    }

    // Handle join button appearance for tutorial steps
    if (stepIndex === CONNECTION && previousStepIndex !== CONNECTION) {
      // Entering the connection step - make button look like "Cancel"
      this.setTutorialButtonToCancel();
    } else if (previousStepIndex === CONNECTION && stepIndex !== CONNECTION) {
      // Leaving the connection step - make button look like "Join"
      this.setTutorialButtonToJoin();
    }

    // Handle mock connection process for the connection step
    if (stepIndex === CONNECTION && previousStepIndex !== CONNECTION) {
      // Entering Connection Process step - start mock connection
      // Add small delay to ensure previous process is fully stopped
      setTimeout(() => {
        if (stepIndex === CONNECTION) {
          // Double-check we're still on the connection step
          this.startMockConnectionProcess();
        }
      }, TUTORIAL_TIMING.MOCK_CONNECTION_START_MS);
    } else if (previousStepIndex === CONNECTION && stepIndex !== CONNECTION) {
      // Leaving Connection Process step - stop mock connection
      this.stopMockConnectionProcess();
    }
  }

  /**
   * Start mock connection process for the connection step
   * Simulates the join process with red -> yellow -> green cycle
   */
  startMockConnectionProcess() {
    // Stop any existing mock process
    this.stopMockConnectionProcess();

    const mockFriendId = TUTORIAL_MOCK_FRIEND.steamid;

    let currentStep = 0;
    const steps = [
      { status: "waiting", duration: 1200 }, // Red - checking for available slots
      { status: "connecting", duration: 1200 }, // Yellow - attempting to connect (longer)
      { status: "joined", duration: 1200 }, // Green - successfully connected
    ];

    const runStep = () => {
      // Check if process was stopped
      if (!this.mockConnectionInterval) return;

      const step = steps[currentStep % steps.length];

      // Update the status label
      StatusManager.updateLabel(mockFriendId, step.status);

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
  }

  /**
   * Stop mock connection process
   */
  stopMockConnectionProcess() {
    // Stop the process flag
    this.mockConnectionInterval = null;

    // Clear all active timeouts
    this.activeTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.activeTimeouts.clear();

    // Reset to default state if mock friend exists
    StatusManager.updateLabel(TUTORIAL_MOCK_FRIEND.steamid, "cancelled");
  }

  /**
   * Set tutorial button to "Cancel" appearance
   */
  setTutorialButtonToCancel() {
    const mockFriendId = TUTORIAL_MOCK_FRIEND.steamid;
    const btn = document.getElementById("join-btn-" + mockFriendId);
    if (btn) {
      btn.textContent = t("common.cancel");
      btn.classList.add("cancel-btn");
      btn.disabled = false;
    }
  }

  /**
   * Set tutorial button to "Join" appearance
   */
  setTutorialButtonToJoin() {
    const mockFriendId = TUTORIAL_MOCK_FRIEND.steamid;
    const btn = document.getElementById("join-btn-" + mockFriendId);
    if (btn) {
      btn.textContent = t("common.join");
      btn.classList.remove("cancel-btn");
      btn.disabled = false;
    }
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
