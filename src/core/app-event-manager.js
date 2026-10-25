// Game singletons
import joinManager from "../game/join-manager.js";

// Core singletons
import appStateManager from "./app-state-manager.js";

// UI and utilities
import UIManager from "../ui/ui-manager.js";
import FakeFriendsManager from "../ui/fake-friends-manager.js";
import ViewTabs from "../ui/view-tabs.js";
import { FRIENDS_TEMPLATES } from "../ui/html-templates.js";

/**
 * How long a remove button waits for the confirming second click
 */
const REMOVE_CONFIRM_MS = 3000;
import DOMUtils from "../utils/dom-utils.js";
import Validators from "../utils/validators.js";
import ErrorHandler from "../utils/error-handler.js";
import tutorialManager from "../ui/tutorial/tutorial-manager.js";
import { t } from "../i18n/i18n-manager.js";

/**
 * Event management module
 * Handles all DOM event listeners and event delegation
 */
class AppEventManager {
  constructor() {
    this.inputManager = null;
    this.friendsManager = null;
    this.friendsClickHandler = null;
    // Pending confirmations of remove buttons
    this.removeTimers = new WeakMap();
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
    const updateFriendsBtn = DOMUtils.getElementById("update-friends-btn");
    const tutorialBtn = DOMUtils.getElementById("tutorial-btn");
    const languageBtn = DOMUtils.getElementById("language-btn");
    const minimizeBtn = DOMUtils.getElementById("window-minimize");
    const closeBtn = DOMUtils.getElementById("window-close");
    const steamIdInput = DOMUtils.getElementById("steam-id");
    const authInput = DOMUtils.getElementById("auth");

    if (updateFriendsBtn && this.friendsManager) {
      updateFriendsBtn.addEventListener("click", () =>
        this.friendsManager.updateFriendsList()
      );
    }

    if (tutorialBtn) {
      tutorialBtn.addEventListener("click", () => {
        // The tutorial walks through the friends view
        ViewTabs.show("friends");
        tutorialManager.start();
      });
    }

    if (languageBtn) {
      import("../i18n/dom-i18n.js").then((mod) => {
        languageBtn.addEventListener("click", () => mod.toggleLanguageAndApply());
      });
    }

    if (minimizeBtn && window.electronAPI?.window?.minimize) {
      minimizeBtn.addEventListener("click", () =>
        window.electronAPI.window.minimize()
      );
    }

    if (closeBtn && window.electronAPI?.window?.close) {
      closeBtn.addEventListener("click", () => window.electronAPI.window.close());
    }

    if (steamIdInput && this.inputManager) {
      steamIdInput.addEventListener(
        "input",
        this.inputManager.validateInputs.bind(this.inputManager)
      );
      steamIdInput.addEventListener(
        "paste",
        this.inputManager.handleSteamIdPaste.bind(this.inputManager)
      );
    }
    if (authInput && this.inputManager) {
      authInput.addEventListener(
        "input",
        this.inputManager.handleAuthInput.bind(this.inputManager)
      );
    }

    // Help links
    const steamIdHelp = DOMUtils.getElementById("steam-id-help");
    if (steamIdHelp) {
      steamIdHelp.addEventListener("click", (e) => {
        e.preventDefault();
        UIManager.showSteamIdHelp();
      });
    }

    const apiKeyHelp = DOMUtils.getElementById("api-key-help");
    if (apiKeyHelp) {
      apiKeyHelp.addEventListener("click", (e) => {
        e.preventDefault();
        UIManager.showApiKeyHelp();
      });
    }

    // Friend filter input - use incremental update to preserve animations
    const filterInput = DOMUtils.getElementById("friend-filter-input");
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        if (UIManager.lastRenderedFriends) {
          const joinStates = joinManager.getJoinStates();
          // Use the same incremental update as normal rendering
          UIManager.renderFriendsList(
            UIManager.lastRenderedFriends,
            joinStates
          );
        }
      });
    }

    // Fake friend controls
    const addFakeFriendBtn = DOMUtils.getElementById(
      "add-fake-friend-btn"
    );
    const fakeFriendInput = DOMUtils.getElementById(
      "fake-friend-steamid"
    );
    if (addFakeFriendBtn && fakeFriendInput) {
      addFakeFriendBtn.addEventListener("click", () =>
        this.addFakeFriend(fakeFriendInput)
      );
      fakeFriendInput.addEventListener("input", () =>
        this.setFakeFriendError(fakeFriendInput, null)
      );
    }

    // Setup friend listeners using event delegation
    this.setupFriendListeners();
    this.setupFakeFriendListeners();
  }

  /**
   * Join, cancel and remove buttons of the manually added IDs. The list
   * container stays in place, so one delegated listener serves every render.
   */
  setupFakeFriendListeners() {
    const container = DOMUtils.getElementById("fake-friends");
    if (!container) return;

    container.addEventListener("click", (event) => {
      const removeButton = event.target.closest('[id^="remove-fake-btn-"]');
      if (removeButton) {
        // The × looks like a close button, and a removal cannot be undone,
        // so the first click only asks for a second one
        if (removeButton.classList.contains("confirm-remove")) {
          this.disarmRemoveButton(removeButton);
          this.removeFakeFriend(removeButton.id.replace("remove-fake-btn-", ""));
        } else {
          this.armRemoveButton(removeButton);
        }
        return;
      }

      const joinButton = event.target.closest('[id^="join-btn-"]');
      if (!joinButton) return;
      const steamId = joinButton.id.replace("join-btn-", "");
      if (joinButton.classList.contains("cancel-btn")) {
        joinManager.cancelJoin(steamId);
      } else {
        joinManager.startJoin(steamId);
      }
    });
  }

  /**
   * Turn a remove button into a confirmation for a few seconds
   * @param {HTMLElement} button - Remove button
   */
  armRemoveButton(button) {
    clearTimeout(this.removeTimers.get(button));
    button.classList.add("confirm-remove");
    button.textContent = t("friends.confirmRemove");
    this.removeTimers.set(
      button,
      setTimeout(() => this.disarmRemoveButton(button), REMOVE_CONFIRM_MS)
    );
  }

  /**
   * Put a remove button back to its icon
   * @param {HTMLElement} button - Remove button
   */
  disarmRemoveButton(button) {
    clearTimeout(this.removeTimers.get(button));
    this.removeTimers.delete(button);
    button.classList.remove("confirm-remove");
    button.innerHTML = FRIENDS_TEMPLATES.REMOVE_FAKE_ICON();
  }

  /**
   * Stop tracking a manually added ID and drop it from the list at once
   * @param {string} steamId - SteamID64 to remove
   */
  async removeFakeFriend(steamId) {
    if (tutorialManager.stateManager.getIsActive()) return;

    let removed;
    try {
      removed = await FakeFriendsManager.removeId(steamId);
    } catch (error) {
      ErrorHandler.logError("AppEventManager.removeFakeFriend", error);
      UIManager.showError(error.message || error);
      return;
    }
    if (!removed) return;

    // A running attempt for an ID that is no longer listed would be invisible
    joinManager.cancelJoin(steamId);

    // The next poll no longer asks about it; until then, stop showing it
    const remaining = UIManager.lastRenderedFakeFriends.filter(
      (friend) => friend.steamid !== steamId
    );
    UIManager.renderFakeFriendsList(remaining, joinManager.getJoinStates());
    appStateManager.setState(
      "friendsData",
      (appStateManager.getState("friendsData") || []).filter(
        (friend) => friend.steamid !== steamId
      )
    );
  }

  /**
   * Show or clear the fake friend validation error
   * @param {HTMLInputElement} input - Steam ID input
   * @param {string|null} messageKey - i18n key, or null to clear the error
   */
  setFakeFriendError(input, messageKey) {
    DOMUtils.setText("fake-friend-error", messageKey ? t(messageKey) : "");
    DOMUtils.toggleClass("fake-friend-error", "hidden", !messageKey);
    input.classList.toggle("invalid-input", Boolean(messageKey));
  }

  /**
   * Validate and persist a manually tracked Steam ID
   * @param {HTMLInputElement} input - Steam ID input
   */
  async addFakeFriend(input) {
    if (tutorialManager.stateManager.getIsActive()) return;

    const steamId = input.value.trim();

    if (!Validators.validateSteamId(steamId)) {
      this.setFakeFriendError(input, "friends.invalidSteamId");
      return;
    }

    const ownSteamId =
      (this.inputManager && this.inputManager.getSteamId()) ||
      appStateManager.getState("savedSettings")?.steam_id;
    if (steamId === ownSteamId) {
      this.setFakeFriendError(input, "friends.alreadyInList");
      return;
    }

    let added;
    try {
      added = await FakeFriendsManager.addId(steamId);
    } catch (error) {
      ErrorHandler.logError("AppEventManager.addFakeFriend", error);
      UIManager.showError(error.message || error);
      return;
    }

    if (!added) {
      this.setFakeFriendError(input, "friends.alreadyInList");
      return;
    }

    this.setFakeFriendError(input, null);
    input.value = "";
    UIManager.showNotification(
      `<span>${t("friends.fakeFriendAdded")}</span>`,
      "info"
    );

    // Pick the new ID up on the next poll so its real Steam status shows
    if (this.friendsManager) {
      this.friendsManager.startAutoRefresh().catch((error) => {
        ErrorHandler.logError("AppEventManager.addFakeFriend", error);
      });
    }
  }

  /**
   * Setup event listeners for friend join buttons using event delegation
   */
  setupFriendListeners() {
    const friendsContainer = DOMUtils.getElementById("friends");
    if (!friendsContainer) return;

    // Remove existing listener if it exists
    if (this.friendsClickHandler) {
      friendsContainer.removeEventListener("click", this.friendsClickHandler);
    }

    // Create new click handler
    this.friendsClickHandler = (event) => {
      const button = event.target.closest('[id^="join-btn-"]');
      if (!button) return;

      const steamId = button.id.replace("join-btn-", "");
      if (!steamId) return;

      // Check if tutorial is active
      if (tutorialManager.stateManager.getIsActive()) {
        const currentStep = tutorialManager.stateManager.getCurrentStep();

        // Step 8 (Connection Process) - move to next step
        if (currentStep === 7) {
          event.preventDefault();
          event.stopPropagation();
          tutorialManager.nextStep();
          return;
        }

        // Steps 6, 8, 9 - do nothing but prevent default action
        if (currentStep === 6 || currentStep === 8 || currentStep === 9) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (button.classList.contains("cancel-btn")) {
        joinManager.cancelJoin(steamId);
      } else {
        joinManager.startJoin(steamId);
      }
    };

    // Add event listener using delegation
    friendsContainer.addEventListener("click", this.friendsClickHandler);
  }
}

// Singleton instance
const appEventManager = new AppEventManager();

export default appEventManager;

// export default AppEventManager;
