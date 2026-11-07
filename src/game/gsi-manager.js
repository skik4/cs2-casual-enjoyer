// Shared constants
import {
  GSI_CONFIG,
  GSI_SETUP,
  INTERRUPTIBLE_MODES,
} from "../shared/constants.js";

// Whether CS2 is open, from Steam's own game log
import cs2Process from "./cs2-process.js";

// UI and utilities
import Validators from "../utils/validators.js";
import logger from "../utils/logger.js";

/**
 * Rounds each side has won, as the map block of a game state gives them
 * (map.team_ct.score and map.team_t.score, names found in CS2's client.dll)
 * @param {Object} map - The map block
 * @returns {{ct: number, t: number}|null} - Null when CS2 does not say
 */
function readScore(map) {
  const ct = map?.team_ct?.score;
  const t = map?.team_t?.score;
  return Number.isInteger(ct) && Number.isInteger(t) ? { ct, t } : null;
}

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
    steamId: payload?.provider?.steamid
      ? String(payload.provider.steamid)
      : null,
    inMatch,
    inMenu: !inMatch,
    mode,
    mapName: inMatch ? map.name : null,
    phase: inMatch && typeof map.phase === "string" ? map.phase : null,
    score: inMatch ? readScore(map) : null,
    activity:
      typeof payload?.player?.activity === "string"
        ? payload.player.activity
        : null,
    // Whether it is offline training only Steam can tell
    inProtectedMatch: inMatch && !INTERRUPTIBLE_MODES.includes(mode),
  };
}

/**
 * Game State Integration module
 * Holds the latest state CS2 posted about the user's own game. CS2 pushes it
 * the moment something changes, so while it is fresh it beats Steam's copy of
 * the same facts, which lags by seconds. Silence proves nothing - CS2 may be
 * closed, loading, or not have read the cfg yet - so callers fall back to the
 * Steam Web API whenever there is no fresh state. A state stops counting the
 * moment Steam's game log shows CS2 closed after it (see cs2-process.js).
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
    this._cs2Unsubscribe = null;
  }

  /**
   * Start receiving game states from the main process
   * @param {Function} getExpectedSteamId - Returns the SteamID64 entered in the app
   */
  async initialize(getExpectedSteamId) {
    this.getExpectedSteamId = getExpectedSteamId;

    // Whether CS2 is open comes from Steam's game log, GSI or not. CS2
    // closing ends its last state at once, and closing the CS2 that was
    // open before the cfg was written ends the call for a restart.
    if (!this._cs2Unsubscribe) {
      this._cs2Unsubscribe = cs2Process.onChange(() => this._notify());
    }
    const cs2Known = cs2Process.start();

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
    // The indicator's first state already knows whether to ask for a restart
    await cs2Known;
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
    // A CS2 that posts is open, whatever Steam's game log says
    cs2Process.noteGameState(now);
    this._notify();
  }

  /**
   * Whether CS2 posted recently enough for its state to count
   * @param {number} [now] - Current time
   * @returns {boolean}
   */
  isFresh(now = Date.now()) {
    return (
      this.lastPayload !== null &&
      now - this.receivedAt <= GSI_CONFIG.FRESH_MS &&
      !cs2Process.closedSince(this.receivedAt)
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
    return Validators.validateSteamId(String(observed))
      ? String(observed)
      : null;
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
        // A cfg written this run is unknown to a CS2 that was open already.
        // Steam's game log tells whether one is; without it the indicator
        // asks for the restart, which is harmless.
        return this._mayNeedRestart() ? "restart" : "waiting";
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
    if (this._cs2Unsubscribe) this._cs2Unsubscribe();
    this._staleTimer = null;
    this._unsubscribe = null;
    this._cs2Unsubscribe = null;
    this.lastPayload = null;
    this.receivedAt = 0;
    this.mapLoadedAt = 0;
    this.setupStatus = null;
    this.getExpectedSteamId = null;
  }

  /**
   * Whether CS2 may still use a cfg older than the one this run wrote: the
   * cfg changed, CS2 has not posted, and Steam's game log does not say that
   * the CS2 open when the app started has closed. A CS2 started later reads
   * the new cfg, and one that has posted has read it.
   * @returns {boolean}
   * @private
   */
  _mayNeedRestart() {
    return Boolean(
      this.setupStatus?.setup === GSI_SETUP.READY &&
        this.setupStatus.changed &&
        !this.lastPayload &&
        cs2Process.openSinceAppStart() !== false
    );
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
