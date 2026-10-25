// Shared constants
import { API_CONFIG } from "../shared/constants.js";

// Game singletons
import gsiManager from "./gsi-manager.js";

// UI and utilities
import SteamAPI from "../steam/steam-api.js";
import Validators from "../utils/validators.js";
import logger from "../utils/logger.js";

/**
 * Manages CS2 launch functionality.
 * The user's own state comes from CS2's Game State Integration while it is
 * fresh and from the Steam Web API otherwise.
 */
class CS2Manager {
  constructor() {
    this.appInputManager = null;
    this.isInitialized = false;
    this.statusCheckInterval = null;
    this.isMonitoring = false;
    this._pendingLobbyResolve = null;
    this._launchTimeout = null;
    this._gsiUnsubscribe = null;
  }

  /**
   * Initialize the CS2Manager with required dependencies
   * @param {Object} appInputManager - App input manager instance
   */
  initialize(appInputManager) {
    this.appInputManager = appInputManager;
    this.isInitialized = true;
    logger.info("CS2Manager", "CS2Manager initialized");
  }

  /**
   * The user's game as CS2 itself reports it
   * @returns {import('../shared/types.js').GsiUserState|null} - Null when CS2
   * has not posted a fresh state for the user's account
   */
  getGsiUserState() {
    return gsiManager.getUserState();
  }

  /**
   * Check if the current user is playing CS2
   * @returns {Promise<boolean|null>} - Whether the user is playing CS2, or null
   * when Steam could not be asked
   */
  async checkUserInCS2() {
    if (!this.isInitialized || !this.appInputManager) {
      logger.warn("CS2Manager", "Not initialized or missing appInputManager", {
        isInitialized: this.isInitialized,
        hasAppInputManager: !!this.appInputManager,
      });
      return false;
    }

    // A fresh state from CS2 is proof enough, and costs no request
    if (this.getGsiUserState()) {
      logger.debug("CS2Manager", "CS2 status from GSI: playing");
      return true;
    }

    try {
      const steamId = this.appInputManager.getSteamId();
      const auth = this.appInputManager.getAuth();

      logger.debug("CS2Manager", "Checking CS2 status for user", { steamId });

      if (!steamId || !auth) {
        logger.warn("CS2Manager", "Missing steamId or auth", {
          hasSteamId: !!steamId,
          hasAuth: !!auth,
        });
        return false;
      }

      const extractedAuth = Validators.extractApiKeyOrToken(auth);
      const result = await SteamAPI.isPlayerInCS2(steamId, extractedAuth);

      logger.info("CS2Manager", "CS2 status result", { steamId, result });
      return result;
    } catch (error) {
      logger.error("CS2Manager", "Error checking CS2 status", {
        error: error.message,
      });
      // Unknown rather than "not in CS2": callers decide how to treat it.
      return null;
    }
  }

  /**
   * Check if the current user is playing CS2 and in lobby
   * @returns {Promise<boolean|null>} - Whether the user is playing CS2 and in
   * lobby, or null when Steam could not be asked
   */
  async checkUserInCS2AndLobby() {
    if (!this.isInitialized || !this.appInputManager) {
      logger.warn(
        "CS2Manager",
        "Not initialized or missing appInputManager for lobby check",
        {
          isInitialized: this.isInitialized,
          hasAppInputManager: !!this.appInputManager,
        }
      );
      return false;
    }

    const gsiState = this.getGsiUserState();
    if (gsiState) {
      logger.debug("CS2Manager", "CS2 lobby status from GSI", {
        inMenu: gsiState.inMenu,
      });
      return gsiState.inMenu;
    }

    try {
      const steamId = this.appInputManager.getSteamId();
      const auth = this.appInputManager.getAuth();

      logger.debug("CS2Manager", "Checking CS2 and lobby status for user", {
        steamId,
      });

      if (!steamId || !auth) {
        logger.warn("CS2Manager", "Missing steamId or auth for lobby check", {
          hasSteamId: !!steamId,
          hasAuth: !!auth,
        });
        return false;
      }

      const extractedAuth = Validators.extractApiKeyOrToken(auth);
      const result = await SteamAPI.isPlayerInCS2(steamId, extractedAuth, true); // requireLobby = true

      logger.info("CS2Manager", "CS2 and lobby status result", {
        steamId,
        result,
      });
      return result;
    } catch (error) {
      logger.error("CS2Manager", "Error checking CS2 and lobby status", {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Launch CS2 using Steam protocol
   */
  launchCS2() {
    try {
      const launchUrl = "steam://run/730/";
      if (window.electronAPI?.shell?.openExternal) {
        window.electronAPI.shell.openExternal(launchUrl);
      } else {
        window.open(launchUrl);
      }
      logger.info("CS2Manager", "Launching CS2...", { launchUrl });
    } catch (error) {
      logger.error("CS2Manager", "Error launching CS2", {
        error: error.message,
      });
    }
  }

  /**
   * Start monitoring CS2 status with callback
   * @param {Function} onStatusChange - Callback function called when CS2 status changes
   * @param {number} intervalMs - Check interval in milliseconds (default: 3000)
   * @returns {boolean} - Whether monitoring started successfully
   */
  startStatusMonitoring(onStatusChange, intervalMs = 3000) {
    if (!this.isInitialized || !this.appInputManager) {
      logger.warn("CS2Manager", "Cannot start monitoring - not initialized", {
        isInitialized: this.isInitialized,
        hasAppInputManager: !!this.appInputManager,
      });
      return false;
    }

    if (this.isMonitoring) {
      logger.warn("CS2Manager", "Monitoring already active");
      return false;
    }

    this.isMonitoring = true;
    logger.info("CS2Manager", "Starting CS2 status monitoring", { intervalMs });

    this.statusCheckInterval = setInterval(async () => {
      try {
        const isInCS2AndLobby = await this.checkUserInCS2AndLobby();
        logger.debug("CS2Manager", "Status monitoring check", {
          isInCS2AndLobby,
        });

        if (onStatusChange) {
          onStatusChange(isInCS2AndLobby);
        }
      } catch (error) {
        logger.error("CS2Manager", "Error during status monitoring", {
          error: error.message,
        });
      }
    }, intervalMs);

    // CS2 posts reaching the menu the moment it happens; the interval above
    // remains the fallback while GSI is not delivering
    this._gsiUnsubscribe = gsiManager.onChange(() => {
      if (this.getGsiUserState()?.inMenu && onStatusChange) {
        logger.debug("CS2Manager", "GSI reports CS2 in the main menu");
        onStatusChange(true);
      }
    });

    return true;
  }

  /**
   * Stop monitoring CS2 status
   */
  stopStatusMonitoring() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
      logger.info("CS2Manager", "CS2 status monitoring stopped");
    }
    if (this._gsiUnsubscribe) {
      this._gsiUnsubscribe();
      this._gsiUnsubscribe = null;
    }
    // The launch deadline only makes sense while monitoring runs, and every
    // way a wait ends (success, cancel, destroy) comes through here.
    if (this._launchTimeout) {
      clearTimeout(this._launchTimeout);
      this._launchTimeout = null;
    }
    // Kept outside the guard so the flag cannot drift from reality and
    // permanently block startStatusMonitoring.
    this.isMonitoring = false;
  }

  /**
   * Launch CS2 and monitor until user is in game and lobby
   * @param {Function} onProgress - Progress callback (optional), called with
   * "launching", then "ready" on success or "timeout" when the deadline passes
   * @param {number} timeoutMs - How long to wait for the lobby before giving up
   * @returns {Promise<boolean>} - Whether user successfully entered CS2 and lobby
   */
  async launchAndWaitForLobby(
    onProgress = null,
    timeoutMs = API_CONFIG.CS2_LAUNCH_TIMEOUT_MS
  ) {
    // A new launch supersedes an unfinished one; settle the old waiter
    // instead of orphaning it.
    if (this._pendingLobbyResolve) {
      this.cancelLaunchOperations();
    }

    return new Promise((resolve) => {
      // Remember the waiter so a cancel can settle it, instead of leaving
      // the caller suspended on a promise that can never resolve.
      this._pendingLobbyResolve = resolve;
      const isCurrentWait = () => this._pendingLobbyResolve === resolve;

      // Launch CS2
      this.launchCS2();

      if (onProgress) {
        onProgress("launching");
      }

      // Start monitoring for lobby entry
      const onStatusChange = (isInCS2AndLobby) => {
        // A check started before a cancel can finish after a newer wait
        // began; it must not settle or stop that wait.
        if (!isCurrentWait()) return;
        // null (Steam could not be asked) is not proof of being in the lobby.
        if (!isInCS2AndLobby) return;

        this._pendingLobbyResolve = null;
        this.stopStatusMonitoring();
        logger.info("CS2Manager", "User successfully entered CS2 and lobby");
        if (onProgress) {
          onProgress("ready");
        }
        resolve(true);
      };

      const monitoringStarted = this.startStatusMonitoring(onStatusChange);
      if (!monitoringStarted) {
        logger.error(
          "CS2Manager",
          "Failed to start monitoring for lobby entry"
        );
        this._pendingLobbyResolve = null;
        resolve(false);
        return;
      }

      // Without a deadline a CS2 that never starts keeps this polling forever.
      this._launchTimeout = setTimeout(() => {
        this._launchTimeout = null;
        if (!isCurrentWait()) return;

        logger.warn("CS2Manager", "CS2 did not reach the lobby in time", {
          timeoutMs,
        });
        this._pendingLobbyResolve = null;
        this.stopStatusMonitoring();
        if (onProgress) {
          onProgress("timeout");
        }
        resolve(false);
      }, timeoutMs);
    });
  }

  /**
   * Settle a pending launchAndWaitForLobby waiter, if there is one
   * @param {boolean} value - Value to resolve the pending promise with
   * @private
   */
  _settlePendingLobbyWait(value) {
    const resolve = this._pendingLobbyResolve;
    if (!resolve) return;
    this._pendingLobbyResolve = null;
    resolve(value);
  }

  /**
   * Cancel any ongoing launch/monitoring operations
   */
  cancelLaunchOperations() {
    this.stopStatusMonitoring();
    this._settlePendingLobbyWait(false);
    logger.info("CS2Manager", "Launch operations cancelled");
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopStatusMonitoring();
    this._settlePendingLobbyWait(false);
    this.appInputManager = null;
    this.isInitialized = false;
    logger.info("CS2Manager", "CS2Manager destroyed");
  }
}

// Singleton instance
const cs2Manager = new CS2Manager();

export default cs2Manager;
