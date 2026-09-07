// Game singletons
import joinManager from "../game/join-manager.js";

// Core singletons
import appStateManager from "./app-state-manager.js";

// UI and utilities
import UIManager from "../ui/ui-manager.js";
import VirtualFriendsManager from "../ui/virtual-friends-manager.js";
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
      tutorialBtn.addEventListener("click", () => tutorialManager.start());
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

    // Virtual friend controls
    const addVirtualFriendBtn = DOMUtils.getElementById(
      "add-virtual-friend-btn"
    );
    const virtualFriendInput = DOMUtils.getElementById(
      "virtual-friend-steamid"
    );
    if (addVirtualFriendBtn && virtualFriendInput) {
      addVirtualFriendBtn.addEventListener("click", () =>
        this.addVirtualFriend(virtualFriendInput)
      );
      virtualFriendInput.addEventListener("input", () =>
        this.setVirtualFriendError(virtualFriendInput, null)
      );
    }

    // Setup friend listeners using event delegation
    this.setupFriendListeners();
  }

  /**
   * Show or clear the virtual friend validation error
   * @param {HTMLInputElement} input - Steam ID input
   * @param {string|null} messageKey - i18n key, or null to clear the error
   */
  setVirtualFriendError(input, messageKey) {
    DOMUtils.setText("virtual-friend-error", messageKey ? t(messageKey) : "");
    DOMUtils.toggleClass("virtual-friend-error", "hidden", !messageKey);
    input.classList.toggle("invalid-input", Boolean(messageKey));
  }

  /**
   * Validate and persist a manually tracked Steam ID
   * @param {HTMLInputElement} input - Steam ID input
   */
  async addVirtualFriend(input) {
    if (tutorialManager.stateManager.getIsActive()) return;

    const steamId = input.value.trim();

    if (!Validators.validateSteamId(steamId)) {
      this.setVirtualFriendError(input, "friends.invalidSteamId");
      return;
    }

    const ownSteamId =
      (this.inputManager && this.inputManager.getSteamId()) ||
      appStateManager.getState("savedSettings")?.steam_id;
    if (steamId === ownSteamId) {
      this.setVirtualFriendError(input, "friends.alreadyInList");
      return;
    }

    let added;
    try {
      added = await VirtualFriendsManager.addId(steamId);
    } catch (error) {
      ErrorHandler.logError("AppEventManager.addVirtualFriend", error);
      UIManager.showError(error.message || error);
      return;
    }

    if (!added) {
      this.setVirtualFriendError(input, "friends.alreadyInList");
      return;
    }

    this.setVirtualFriendError(input, null);
    input.value = "";
    UIManager.showNotification(
      `<span>${t("friends.virtualFriendAdded")}</span>`,
      "info"
    );

    // Pick the new ID up on the next poll so its real Steam status shows
    if (this.friendsManager) {
      this.friendsManager.startAutoRefresh().catch((error) => {
        ErrorHandler.logError("AppEventManager.addVirtualFriend", error);
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
