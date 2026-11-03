// Shared constants
import { GAME_MODES } from "../shared/constants.js";

// Game singletons
import gsiManager from "./gsi-manager.js";

// Steam modules
import SteamAPIUtils from "../steam/steam-api-utils.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * Where the user plays right now, so that rows can block joining a game the
 * user is already in. The server comes from the user's Steam presence. CS2's
 * own state wins whenever it is fresh, because Steam's copy lags: it keeps
 * showing a server for a while after the user leaves it, and the old map
 * after the server has moved on to its next one.
 */
class UserLocation {
  constructor() {
    /** @type {import('../shared/types.js').PlayerPresence|null} */
    this.steamPresence = null;
    this.listeners = new Set();
    this._lastKey = "";
    this._gsiUnsubscribe = null;
  }

  /**
   * Take in the user's own presence as Steam shows it
   * @param {import('../shared/types.js').PlayerPresence|null} presence - null
   *   when Steam could not be asked
   */
  setSteamPresence(presence) {
    this.steamPresence = presence ?? null;
    this._notifyIfChanged();
  }

  /**
   * The game server the user is on
   * @returns {string|null}
   */
  getServerId() {
    const gsi = gsiManager.getUserState();
    // Back in the menu the user is on no server, whatever Steam still shows
    if (gsi && !gsi.inMatch) return null;
    const presence = this.steamPresence;
    return presence?.inCS2 && presence.serverId ? String(presence.serverId) : null;
  }

  /**
   * The user's match as CS2 itself reports it
   * @returns {{map: string, over: boolean}|null} - null without a fresh CS2
   *   state, or outside a match
   */
  getOwnMatch() {
    const gsi = gsiManager.getUserState();
    if (!gsi?.inMatch || !gsi.mapName) return null;
    return { map: gsi.mapName, over: gsi.phase === "gameover" };
  }

  /**
   * The casual map the user is playing while the match on it runs. Once it
   * is over the server moves on to another map, so it no longer counts.
   * @returns {string|null} - Map code, e.g. de_dust2
   */
  getMap() {
    const gsi = gsiManager.getUserState();
    if (gsi) {
      const own = this.getOwnMatch();
      return own && gsi.mode === GAME_MODES.CASUAL && !own.over ? own.map : null;
    }
    const presence = this.steamPresence;
    return presence?.official && !SteamAPIUtils.isMatchOver(presence.score)
      ? presence.map
      : null;
  }

  /**
   * Subscribe to changes of where the user is
   * @param {Function} listener - Called with no arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    if (!this._gsiUnsubscribe) {
      this._gsiUnsubscribe = gsiManager.onChange(() => this._notifyIfChanged());
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Forget the user's presence and listeners (used by tests)
   */
  reset() {
    if (this._gsiUnsubscribe) this._gsiUnsubscribe();
    this._gsiUnsubscribe = null;
    this.steamPresence = null;
    this.listeners.clear();
    this._lastKey = "";
  }

  /**
   * @private
   */
  _notifyIfChanged() {
    const own = this.getOwnMatch();
    const key = [this.getServerId(), this.getMap(), own?.map, own?.over].join("\n");
    if (key === this._lastKey) return;
    this._lastKey = key;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("UserLocation", "Location listener failed", {
          error: error.message,
        });
      }
    }
  }
}

const userLocation = new UserLocation();
export default userLocation;
