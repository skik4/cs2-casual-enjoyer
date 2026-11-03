// Game singletons
import joinManager from "../game/join-manager.js";
import mapKeeper from "../game/map-keeper.js";

// Core singletons
import appStateManager from "../core/app-state-manager.js";

// UI and utilities
import FriendsRenderer from "./friends-renderer.js";
import NotificationManager from "./notification-manager.js";
import FakeFriendsManager from "./fake-friends-manager.js";
import { FRIENDS_TEMPLATES } from "./html-templates.js";
import DOMUtils from "../utils/dom-utils.js";
import Validators from "../utils/validators.js";
import ErrorHandler from "../utils/error-handler.js";
import tutorialManager from "./tutorial/tutorial-manager.js";
import { t } from "../i18n/i18n-manager.js";

/**
 * How long a remove button waits for the confirming second click
 */
const REMOVE_CONFIRM_MS = 3000;

/**
 * Fake friends view
 * The Fake Friends tab: the form that adds an ID the user tracks by hand,
 * and the join, cancel and remove buttons of the rows. FakeFriendsManager
 * keeps the IDs themselves.
 */
class FakeFriendsView {
  /** The user's own SteamID, which cannot be added */
  static getOwnSteamId = () => "";
  /** What follows a saved ID */
  static onAdded = () => {};
  // Pending confirmations of remove buttons
  static removeTimers = new WeakMap();

  /**
   * Wire the add form and the list, once at startup
   * @param {Object} options
   * @param {Function} options.getOwnSteamId - The user's own SteamID
   * @param {Function} options.onAdded - Called once an ID is saved
   */
  static initialize({ getOwnSteamId, onAdded }) {
    this.getOwnSteamId = getOwnSteamId;
    this.onAdded = onAdded;

    // Fake friend controls
    const addFakeFriendBtn = DOMUtils.getElementById("add-fake-friend-btn");
    const fakeFriendInput = DOMUtils.getElementById("fake-friend-steamid");
    if (addFakeFriendBtn && fakeFriendInput) {
      addFakeFriendBtn.addEventListener("click", () =>
        this.addFakeFriend(fakeFriendInput)
      );
      fakeFriendInput.addEventListener("input", () =>
        this.setFakeFriendError(fakeFriendInput, null)
      );
    }

    this.setupFakeFriendListeners();
  }

  /**
   * Join, cancel and remove buttons of the manually added IDs. The list
   * container stays in place, so one delegated listener serves every render.
   */
  static setupFakeFriendListeners() {
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
        // Following a friend, the user no longer keeps a map
        mapKeeper.userJoined(null);
        joinManager.startJoin(steamId);
      }
    });
  }

  /**
   * Turn a remove button into a confirmation for a few seconds
   * @param {HTMLElement} button - Remove button
   */
  static armRemoveButton(button) {
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
  static disarmRemoveButton(button) {
    clearTimeout(this.removeTimers.get(button));
    this.removeTimers.delete(button);
    button.classList.remove("confirm-remove");
    button.innerHTML = FRIENDS_TEMPLATES.REMOVE_FAKE_ICON();
  }

  /**
   * Stop tracking a manually added ID and drop it from the list at once
   * @param {string} steamId - SteamID64 to remove
   */
  static async removeFakeFriend(steamId) {
    if (tutorialManager.stateManager.getIsActive()) return;

    let removed;
    try {
      removed = await FakeFriendsManager.removeId(steamId);
    } catch (error) {
      ErrorHandler.logError("FakeFriendsView.removeFakeFriend", error);
      NotificationManager.showError(error.message || error);
      return;
    }
    if (!removed) return;

    // A running attempt for an ID that is no longer listed would be invisible
    joinManager.cancelJoin(steamId);

    // The next poll no longer asks about it; until then, stop showing it
    const remaining = FriendsRenderer.lastRenderedFakeFriends.filter(
      (friend) => friend.steamid !== steamId
    );
    FriendsRenderer.renderFakeFriendsList(remaining, joinManager.getJoinStates());
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
  static setFakeFriendError(input, messageKey) {
    DOMUtils.setText("fake-friend-error", messageKey ? t(messageKey) : "");
    DOMUtils.toggleClass("fake-friend-error", "hidden", !messageKey);
    input.classList.toggle("invalid-input", Boolean(messageKey));
  }

  /**
   * Validate and persist a manually tracked Steam ID
   * @param {HTMLInputElement} input - Steam ID input
   */
  static async addFakeFriend(input) {
    if (tutorialManager.stateManager.getIsActive()) return;

    const steamId = input.value.trim();

    if (!Validators.validateSteamId(steamId)) {
      this.setFakeFriendError(input, "friends.invalidSteamId");
      return;
    }

    if (steamId === this.getOwnSteamId()) {
      this.setFakeFriendError(input, "friends.alreadyInList");
      return;
    }

    let added;
    try {
      added = await FakeFriendsManager.addId(steamId);
    } catch (error) {
      ErrorHandler.logError("FakeFriendsView.addFakeFriend", error);
      NotificationManager.showError(error.message || error);
      return;
    }

    if (!added) {
      this.setFakeFriendError(input, "friends.alreadyInList");
      return;
    }

    this.setFakeFriendError(input, null);
    input.value = "";
    NotificationManager.showNotification(
      `<span>${t("friends.fakeFriendAdded")}</span>`,
      "info"
    );

    this.onAdded();
  }
}

export default FakeFriendsView;
