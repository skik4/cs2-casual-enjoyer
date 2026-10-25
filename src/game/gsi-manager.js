// Shared constants
import { GAME_MODES, GSI_CONFIG, GSI_SETUP } from "../shared/constants.js";

// UI and utilities
import Validators from "../utils/validators.js";
import logger from "../utils/logger.js";

/**
 * Read what one CS2 game state says about the user's game
 * @param {Object} payload - Game state as posted by CS2
 * @returns {Omit<import('../shared/types.js').GsiUserState, 'mapLoadedAt'>}
 */
export function interpretGsiPayload(payload) {
  const map = payload?.map;
  // The map block exists only while the game is on a server
  const inMatch = typeof map?.name === "string" && map.name.length > 0;
  const mode = inMatch && typeof map.mode === "string" ? map.mode : null;

  return {
    steamId: payload?.provider?.steamid ? String(payload.provider.steamid) : null,
    inMatch,
    inMenu: !inMatch,
    mode,
    mapName: inMatch ? map.name : null,
    phase: inMatch && typeof map.phase === "string" ? map.phase : null,
    activity:
      typeof payload?.player?.activity === "string"
        ? payload.player.activity
        : null,
    inCompetitiveOrPremier:
      mode === GAME_MODES.COMPETITIVE || mode === GAME_MODES.PREMIER,
  };
}

/**
 * Game State Integration module
 * Holds the latest state CS2 posted about the user's own game. CS2 pushes it
 * the moment something changes, so while it is fresh it beats Steam's copy of
 * the same facts, which lags by seconds. Silence proves nothing - CS2 may be
 * closed, loading, or not have read the cfg yet - so callers fall back to the
 * Steam Web API whenever there is no fresh state.
 */
class GSIManager {
  constructor() {
    this.lastPayload = null;
    this.receivedAt = 0;
    this.mapLoadedAt = 0;
    /** @type {import('../shared/types.js').GsiSetupStatus|null} */
    this.setupStatus = null;
    this.getExpectedSteamId = null;
    this.listeners = new Set();
    this._staleTimer = null;
    this._unsubscribe = null;
  }

  /**
   * Start receiving game states from the main process
   * @param {Function} getExpectedSteamId - Returns the SteamID64 entered in the app
   */
  async initialize(getExpectedSteamId) {
    this.getExpectedSteamId = getExpectedSteamId;

    const api = window.electronAPI?.gsi;
    if (!api) {
      logger.warn("GSIManager", "GSI bridge not available");
      return;
    }

    if (!this._unsubscribe) {
      this._unsubscribe = api.onState((payload) => this.handlePayload(payload));
    }

    this.setupStatus = await api.getStatus();
    logger.info("GSIManager", "GSI setup status", this.setupStatus);
    this._notify();
  }

  /**
   * Take in one game state posted by CS2
   * @param {Object} payload - Game state
   * @param {number} [now] - Receive time
   */
  handlePayload(payload, now = Date.now()) {
    if (!payload || typeof payload !== "object") return;

    const previous = this.isFresh(now)
      ? interpretGsiPayload(this.lastPayload)
      : null;
    const current = interpretGsiPayload(payload);
    if (
      current.inMatch &&
      (!previous?.inMatch || previous.mapName !== current.mapName)
    ) {
      this.mapLoadedAt = now;
    }

    this.lastPayload = payload;
    this.receivedAt = now;
    this._armStaleTimer();
    this._notify();
  }

  /**
   * Whether CS2 posted recently enough for its state to count
   * @param {number} [now] - Current time
   * @returns {boolean}
   */
  isFresh(now = Date.now()) {
    return (
      this.lastPayload !== null && now - this.receivedAt <= GSI_CONFIG.FRESH_MS
    );
  }

  /**
   * The user's game as CS2 reports it, or null when there is no fresh state
   * for the account entered in the app
   * @param {number} [now] - Current time
   * @returns {import('../shared/types.js').GsiUserState|null}
   */
  getUserState(now = Date.now()) {
    if (!this.isFresh(now) || this._isOtherAccount()) return null;
    return {
      ...interpretGsiPayload(this.lastPayload),
      mapLoadedAt: this.mapLoadedAt,
    };
  }

  /**
   * The player CS2 shows while the user spectates, e.g. after dying in
   * casual. That player is on the user's own server, so a nearby candidate
   * for the map finder.
   * @param {number} [now] - Current time
   * @returns {string|null} - SteamID64, or null while CS2 shows the user
   */
  getObservedSteamId(now = Date.now()) {
    if (!this.isFresh(now)) return null;
    const own = this.lastPayload?.provider?.steamid;
    const observed = this.lastPayload?.player?.steamid;
    if (!own || !observed || String(observed) === String(own)) return null;
    return Validators.validateSteamId(String(observed)) ? String(observed) : null;
  }

  /**
   * Every player CS2 lists in its state, keyed by SteamID64. Valve documents
   * the list for observers and GOTV only, so it is often absent; whoever it
   * lists is in the match the user is in or watches.
   * @param {number} [now] - Current time
   * @returns {string[]} - SteamID64s, the user's own left out
   */
  getListedPlayerIds(now = Date.now()) {
    if (!this.isFresh(now)) return [];
    const players = this.lastPayload?.allplayers;
    if (!players || typeof players !== "object") return [];
    const own = String(this.lastPayload?.provider?.steamid ?? "");
    return Object.keys(players).filter(
      (id) => id !== own && Validators.validateSteamId(id)
    );
  }

  /**
   * State for the status indicator
   * @param {number} [now] - Current time
   * @returns {"active"|"other-account"|"restart"|"waiting"|"unavailable"|"error"}
   */
  getIndicatorState(now = Date.now()) {
    if (this.isFresh(now)) {
      return this._isOtherAccount() ? "other-account" : "active";
    }

    switch (this.setupStatus?.setup) {
      case GSI_SETUP.READY:
        // A cfg written this run is unknown to a CS2 that is already running
        return this.setupStatus.changed && !this.lastPayload
          ? "restart"
          : "waiting";
      case GSI_SETUP.CS2_NOT_FOUND:
        return "unavailable";
      case GSI_SETUP.ERROR:
        return "error";
      default:
        // No status yet, or no bridge at all
        return window.electronAPI?.gsi ? "waiting" : "unavailable";
    }
  }

  /**
   * Subscribe to state changes, including CS2 going quiet
   * @param {Function} listener - Called without arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Forget everything received so far and detach from the bridge (used by tests)
   */
  reset() {
    if (this._staleTimer) clearTimeout(this._staleTimer);
    if (this._unsubscribe) this._unsubscribe();
    this._staleTimer = null;
    this._unsubscribe = null;
    this.lastPayload = null;
    this.receivedAt = 0;
    this.mapLoadedAt = 0;
    this.setupStatus = null;
    this.getExpectedSteamId = null;
  }

  /**
   * Whether CS2 runs on an account other than the one entered in the app
   * @returns {boolean}
   * @private
   */
  _isOtherAccount() {
    const reported = this.lastPayload?.provider?.steamid;
    const expected = this.getExpectedSteamId?.();
    return Boolean(
      reported &&
        Validators.validateSteamId(expected) &&
        String(reported) !== expected
    );
  }

  /**
   * Nothing else tells listeners that CS2 stopped posting
   * @private
   */
  _armStaleTimer() {
    if (this._staleTimer) clearTimeout(this._staleTimer);
    this._staleTimer = setTimeout(() => {
      this._staleTimer = null;
      this._notify();
    }, GSI_CONFIG.FRESH_MS + 1);
  }

  /**
   * @private
   */
  _notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("GSIManager", "GSI listener failed", {
          error: error.message,
        });
      }
    }
  }
}

// Singleton instance
const gsiManager = new GSIManager();

export default gsiManager;
