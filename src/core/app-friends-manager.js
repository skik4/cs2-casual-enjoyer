// Shared constants
import { API_CONFIG } from "../shared/constants.js";

// Core singletons
import appStateManager from "./app-state-manager.js";
import windowState from "./window-state.js";

// Game singletons
import joinManager from "../game/join-manager.js";
import userLocation from "../game/user-location.js";

// UI and utilities
import FriendsRenderer from "../ui/friends-renderer.js";
import NotificationManager from "../ui/notification-manager.js";
import AccountView from "../ui/account-view.js";
import FakeFriendsManager from "../ui/fake-friends-manager.js";
import SteamAPI from "../steam/steam-api.js";
import credentialState from "../steam/credential-state.js";
import Validators from "../utils/validators.js";
import DOMUtils from "../utils/dom-utils.js";
import tutorialManager from "../ui/tutorial/tutorial-manager.js";
import { TUTORIAL_TIMING } from "../ui/tutorial/tutorial-timing.js";
import logger from "../utils/logger.js";
import { t } from "../i18n/i18n-manager.js";

/**
 * Friends management module
 * Handles friends list operations and auto-refresh
 */
class AppFriendsManager {
  constructor() {
    this.inputManager = null;
    // Set once the startup refresh has started; it never starts twice
    this.initialLoadAttempted = false;
    // A round of the auto-refresh is out
    this._refreshing = false;
    this._windowFollowed = false;
  }

  /**
   * Set the input manager, which holds the credential fields
   * @param {Object} inputManager - Reference to input manager
   */
  setInputManager(inputManager) {
    this.inputManager = inputManager;
  }

  /**
   * Start the auto-refresh once per run, when the inputs check out: saved
   * settings whose token has not expired, and a saved friends list to
   * refresh. Called on every validation of the inputs.
   * @param {Object} facts - What validateInputs found
   * @param {boolean} facts.hasSaved - Saved settings hold a SteamID and a credential
   * @param {boolean} facts.validSteamId - The SteamID field holds a SteamID64
   * @param {boolean} facts.validApiKey - The credential field holds a key or token
   * @param {boolean} facts.tokenExpired - The token, in the field or saved, has expired
   */
  startAutoRefreshOnce({ hasSaved, validSteamId, validApiKey, tokenExpired }) {
    // Don't start auto-refresh if tutorial is active
    if (tutorialManager.isActive) {
      logger.info("App", "Auto-refresh not started - tutorial is active");
      return;
    }

    // Don't start auto-refresh if we already attempted initial load
    if (this.initialLoadAttempted) {
      return;
    }

    // Only start auto-refresh for users with saved settings that include friends list
    const savedFriendsIds = appStateManager.getState("savedFriendsIds");
    const hasSavedFriends = savedFriendsIds && savedFriendsIds.length > 0;
    const hasValidSavedSettings = hasSaved && !tokenExpired;

    const hasValidCurrentInputs = validSteamId && validApiKey && !tokenExpired;

    // Start auto-refresh ONLY if we have valid saved settings AND saved friends list
    if (hasValidSavedSettings && hasSavedFriends) {
      logger.info("App", "Starting auto-refresh - validation passed", {
        hasValidSavedSettings,
        hasSavedFriends,
        friendsCount: savedFriendsIds?.length || 0,
      });

      setTimeout(() => {
        this.initialLoadAttempted = true;
        this.startAutoRefresh().catch((error) => {
          logger.error("App", "Auto-refresh startup failed: " + error.message);
        });
      }, API_CONFIG.AUTO_REFRESH_START_MS);
    } else {
      logger.info("App", "Auto-refresh not started - validation failed", {
        hasValidCurrentInputs,
        hasValidSavedSettings,
        hasSavedFriends,
        isTokenExpired: tokenExpired,
      });
    }
  }

  /**
   * Fetch and render friends by their IDs
   * @param {string[]} friendIds - Array of friend Steam IDs
   * @param {string} auth - API key or token
   * @param {boolean} [keepStates=false] - Whether to preserve join states
   * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friends
   */
  async fetchAndRenderFriendsByIds(friendIds, auth, keepStates = false) {
    // Skip auto-refresh updates during tutorial
    if (keepStates && tutorialManager.isActive) {
      logger.debug(
        "App",
        "fetchAndRenderFriendsByIds skipped - tutorial is active"
      );
      return [];
    }

    if (!friendIds || !friendIds.length) {
      logger.error(
        "App",
        "No friend IDs provided to fetchAndRenderFriendsByIds"
      );
      return [];
    }

    try {
      // The user's own presence rides in the same Steam request
      const [allStatuses] = await Promise.all([
        SteamAPI.getFriendsStatuses(
          FakeFriendsManager.mergeIds(friendIds),
          auth
        ),
        this.updateUserLocation(auth),
      ]);

      const joinStates = keepStates ? joinManager.getJoinStates() : {};
      const supportedFriends = FakeFriendsManager.withFakeFriends(
        allStatuses,
        this.getFriendsWithActiveJoins(joinStates)
      );

      appStateManager.setState("friendsData", supportedFriends);
      this.renderLists(supportedFriends, joinStates);

      logger.info(
        "App",
        `Friends update completed: ${supportedFriends.length} supported friends found, ${supportedFriends.filter((f) => f.join_available).length} joinable`
      );

      return supportedFriends;
    } catch (error) {
      logger.error("App", "Fetching the friends failed", {
        error: error.message,
      });
      if (!keepStates) NotificationManager.showError(error);
      throw error;
    }
  }

  /**
   * Ask Steam where the user is, so rows can tell a friend on the user's own
   * server. Fetched in the same tick as the friends' statuses, it shares
   * their request.
   * @param {string} auth - API key or token
   * @returns {Promise<void>} - Never rejects
   */
  async updateUserLocation(auth) {
    const userId =
      this.inputManager?.getSteamId?.() ||
      appStateManager.getState("savedSettings")?.steam_id;
    if (!userId) return;
    try {
      const presence = await SteamAPI.getPresence([userId], auth);
      userLocation.setSteamPresence(presence.get(String(userId)) ?? null);
    } catch (error) {
      logger.warn("App", "Could not read the user's own presence", {
        error: error.message,
      });
    }
  }

  /**
   * Render real friends and manually tracked IDs, each in its own tab
   * @param {import('../shared/types.js').Friend[]} list - Everyone to show
   * @param {Object} joinStates - Join states by Steam ID
   */
  renderLists(list, joinStates) {
    const { friends, fakeFriends } = FakeFriendsManager.splitFakeFriends(list);
    FriendsRenderer.renderFriendsList(friends, joinStates);
    FriendsRenderer.renderFakeFriendsList(fakeFriends, joinStates);
  }

  /**
   * Friends whose join attempt is still running. The join loop keeps waiting
   * after a friend leaves casual, so they must stay listed or the card and
   * its Cancel button vanish while the loop can still join. Must be called
   * before `friendsData` is overwritten.
   * @param {Object<string, import('../shared/types.js').JoinState>} joinStates - Join states by Steam ID
   * @returns {import('../shared/types.js').Friend[]} - Last known entries or placeholders
   */
  getFriendsWithActiveJoins(joinStates) {
    const previous = new Map(
      (appStateManager.getState("friendsData") || []).map((friend) => [
        friend.steamid,
        friend,
      ])
    );

    const friends = [];
    for (const [steamid, state] of Object.entries(joinStates || {})) {
      if (!joinManager.isActive(state)) continue;
      // Map and server attempts live in the maps view, not as friends
      if (!Validators.validateSteamId(steamid)) continue;

      const entry = previous.get(steamid);
      if (entry) {
        friends.push(entry);
        continue;
      }

      const placeholder = FakeFriendsManager.createPlaceholder(steamid);
      if (state.personaname) placeholder.personaname = state.personaname;
      friends.push(placeholder);
    }

    return friends;
  }

  /**
   * Update friends list
   */
  async updateFriendsList() {
    let steam_id = this.inputManager ? this.inputManager.getSteamId() : "";
    let auth = this.inputManager ? this.inputManager.getAuth() : "";

    const savedSettings = appStateManager.getState("savedSettings");
    if ((!steam_id || !auth) && savedSettings) {
      if (!steam_id && savedSettings.steam_id)
        steam_id = savedSettings.steam_id;
      if (!auth && savedSettings.auth) auth = savedSettings.auth;
    }

    auth = Validators.extractApiKeyOrToken(auth);

    if (!steam_id || !auth) {
      NotificationManager.showError(t("errors.pleaseEnterSteamIdAndApiKey"));
      return;
    }

    const validation = Validators.validateRequiredFields({
      steamId: steam_id,
      auth,
    });
    if (!validation.valid) {
      NotificationManager.showError(validation.errors.join(". "));
      return;
    }

    const sameAccount =
      savedSettings?.steam_id === steam_id && savedSettings?.auth === auth;

    // Check if settings changed
    if (savedSettings && !sameAccount) {
      localStorage.removeItem("hide_privacy_warning");
      appStateManager.setState("usingSavedFriends", false);
    }

    const updateBtn = DOMUtils.getElementById("update-friends-btn");
    if (updateBtn) {
      updateBtn.disabled = true;
      updateBtn.textContent = t("index.updateFriendsButtonUpdating");
    }
    DOMUtils.toggleClass("refresh-friends-btn", "busy", true);

    try {
      let allFriendIds = [];
      try {
        allFriendIds = await SteamAPI.getFriendsList(steam_id, auth);
        NotificationManager.hideNotification();
      } catch (err) {
        NotificationManager.showError(err, steam_id);
        return;
      } finally {
        if (updateBtn) {
          updateBtn.disabled = false;
          updateBtn.textContent = t("index.updateFriendsButton");
        }
      }

      // Update state
      appStateManager.batchUpdate({
        savedFriendsIds: allFriendIds,
        usingSavedFriends: true,
      });

      // Get friend statuses (avatars will be loaded only for supported players)
      const statuses = await SteamAPI.getFriendsStatuses(
        FakeFriendsManager.mergeIds(allFriendIds),
        auth
      );

      // Only these fields change; the main process merges them into the file
      const updatedSettings = await window.electronAPI.settings.update({
        steam_id,
        auth,
        friends_ids: allFriendIds,
      });
      if (updatedSettings) {
        appStateManager.setState("savedSettings", updatedSettings);
      }

      // Running joins go on with the account and credential they started
      // with: another one ends them, while a reload of the same keeps them,
      // so a join waiting for a slot outlives it
      if (!sameAccount) joinManager.resetAll();
      const joinStates = joinManager.getJoinStates();
      const supportedFriends = FakeFriendsManager.withFakeFriends(
        statuses,
        this.getFriendsWithActiveJoins(joinStates)
      );

      // Render friends
      appStateManager.setState("friendsData", supportedFriends);
      this.renderLists(supportedFriends, joinStates);

      // Friends are in: the account panel gives way to the bar
      AccountView.close();
      if (this.inputManager) this.inputManager.validateInputs();

      // Only start auto-refresh if tutorial is not active
      if (!tutorialManager.isActive) {
        this.startAutoRefresh();
      } else {
        logger.info(
          "App",
          "Auto-refresh not started after update - tutorial is active"
        );
      }
    } catch (error) {
      logger.error("App", "Updating the friends list failed", {
        error: error.message,
      });
      NotificationManager.showError(error, steam_id);
    } finally {
      if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.textContent = t("index.updateFriendsButton");
      }
      DOMUtils.toggleClass("refresh-friends-btn", "busy", false);
    }
  }

  /**
   * Start auto-refresh for friends list
   */
  async startAutoRefresh() {
    // Check if tutorial is currently active
    if (tutorialManager.isActive) {
      logger.info("App", "Auto-refresh blocked - tutorial is active");
      return;
    }

    const savedFriendsIds = FakeFriendsManager.mergeIds(
      appStateManager.getState("savedFriendsIds") || []
    );
    if (
      !savedFriendsIds ||
      !Array.isArray(savedFriendsIds) ||
      savedFriendsIds.length === 0
    ) {
      logger.info("App", "No saved friends found for auto-refresh");
      return;
    }
    logger.info(
      "App",
      `Starting auto-refresh with ${savedFriendsIds.length} saved friends`
    );

    try {
      await this.fetchAndRenderFriendsByIds(
        savedFriendsIds,
        this._currentAuth(),
        true
      );

      // Clear existing interval
      appStateManager.clearRefreshInterval();
      this._followWindow();
      // A new start begins with no round out, as each start always has: a
      // round of the old one that never ends must not hold up the new one
      this._refreshing = false;

      // Set new interval
      const autoRefreshIntervalMs = appStateManager.getState(
        "autoRefreshIntervalMs"
      );
      const interval = setInterval(
        () => this._autoRefreshRound(),
        autoRefreshIntervalMs
      );

      appStateManager.setState("friendsRefreshInterval", interval);
      logger.info("App", "Auto-refresh of supported friends status started");
    } catch (error) {
      logger.error("App", "Failed to start auto-refresh", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * One round of the auto-refresh
   * @returns {Promise<void>}
   * @private
   */
  async _autoRefreshRound() {
    // Check if tutorial is active before each refresh
    if (tutorialManager.isActive) {
      logger.debug("App", "Auto-refresh skipped - tutorial is active");
      return;
    }
    // Nobody sees the list in a minimized window, and a running join asks
    // Steam about its friend itself: the list catches up on the restore
    if (windowState.isMinimized()) return;
    // A slow Steam must not pile up overlapping refreshes
    if (this._refreshing) return;
    // Steam turned the credential down: nothing to gain from asking
    // again until another one is pasted, or a reload is asked for
    if (credentialState.isRejected(this._currentAuth())) return;

    const usingSavedFriends = appStateManager.getState("usingSavedFriends");
    const currentSavedFriendsIds = FakeFriendsManager.mergeIds(
      appStateManager.getState("savedFriendsIds") || []
    );

    if (usingSavedFriends && currentSavedFriendsIds.length) {
      this._refreshing = true;
      try {
        await this.fetchAndRenderFriendsByIds(
          currentSavedFriendsIds,
          this._currentAuth(),
          true
        );
      } catch (error) {
        logger.warn("App", "Auto-refresh fetch failed", {
          error: error.message,
        });
      } finally {
        this._refreshing = false;
      }
    }
  }

  /**
   * The credential to ask with, read on every refresh: a token pasted later
   * must replace the old one, which expires after a day
   * @returns {string}
   * @private
   */
  _currentAuth() {
    return this.inputManager ? this.inputManager.getAuth() : "";
  }

  /**
   * Refresh at once when the window comes back from a minimize, while the
   * auto-refresh runs; wired once
   * @private
   */
  _followWindow() {
    if (this._windowFollowed) return;
    this._windowFollowed = true;
    windowState.follow();
    windowState.onChange((what) => {
      if (what !== "minimized" || windowState.isMinimized()) return;
      if (appStateManager.getState("friendsRefreshInterval")) {
        this._autoRefreshRound();
      }
    });
  }

  /**
   * Stop auto-refresh for friends list
   */
  stopAutoRefresh() {
    appStateManager.clearRefreshInterval();
    logger.info("App", "Auto-refresh stopped");
  }

  /**
   * Restore auto-refresh after the tutorial ends
   */
  restoreAutoRefresh() {
    // Check if we have saved friends and valid settings before starting auto-refresh
    const savedFriendsIds = appStateManager.getState("savedFriendsIds");
    const savedSettings = appStateManager.getState("savedSettings");

    if (savedFriendsIds && savedFriendsIds.length > 0 && savedSettings) {
      // Small delay to ensure tutorial cleanup is complete
      setTimeout(() => {
        this.startAutoRefresh().catch((error) => {
          logger.error("App", "Could not restart auto-refresh", {
            error: error.message,
          });
        });
      }, TUTORIAL_TIMING.AUTO_REFRESH_RESTORE_MS);
    }
  }
}

// Create singleton instance
const appFriendsManager = new AppFriendsManager();

export default appFriendsManager;
