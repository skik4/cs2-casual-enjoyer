// Shared constants
import { GAME_MODES } from "../shared/constants.js";

// Game singletons
import gsiManager from "./gsi-manager.js";
import joinManager, { getMapJoinId } from "./join-manager.js";
import mapFinder, { mapLabel } from "./map-finder.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * Keeps the user on one map. A casual server loads another map when its
 * match ends; with a map kept, the app then joins another server of that
 * map by itself. It goes by what CS2 reports: the kept map's match ending,
 * or a match on another map. It stays quiet in the menu, so leaving a match
 * never pulls the user back in, and lets go once the user joins something
 * else or cancels its join.
 */
class MapKeeper {
  constructor() {
    /** @type {string|null} */
    this.map = null;
    this.listeners = new Set();
    this._gsiUnsubscribe = null;
    // CS2's last map and match state seen in a casual match
    this._lastSeen = "";
  }

  /**
   * The kept map
   * @returns {string|null} - Map code, e.g. de_dust2
   */
  getMap() {
    return this.map;
  }

  /**
   * Keep a map, or stop keeping one
   * @param {string|null} map - Map code, null to stop
   */
  keep(map) {
    const next = map ?? null;
    if (next === this.map) return;
    this.map = next;
    this._lastSeen = "";
    if (this.map && !this._gsiUnsubscribe) {
      this._gsiUnsubscribe = gsiManager.onChange(() => this._check());
    }
    // Its join needs servers known now, not when the Maps view last looked
    mapFinder.setNeed("keep", Boolean(this.map));
    this._notify();
    this._check();
  }

  /**
   * Keep a map, or stop keeping it if it is kept already
   * @param {string} map - Map code
   */
  toggle(map) {
    this.keep(this.map === map ? null : map);
  }

  /**
   * The user started a join: one anywhere but the kept map lets it go
   * @param {string|null} map - Map of the join, null for a friend
   */
  userJoined(map) {
    if (this.map && map !== this.map) this.keep(null);
  }

  /**
   * The user cancelled a join: cancelling the kept map's own lets it go
   * @param {string} joinId - The cancelled attempt
   */
  userCancelled(joinId) {
    if (this.map && joinId === getMapJoinId(this.map)) this.keep(null);
  }

  /**
   * Subscribe to the kept map changing
   * @param {Function} listener - Called with no arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Stop keeping and forget listeners (used by tests)
   */
  reset() {
    if (this._gsiUnsubscribe) this._gsiUnsubscribe();
    this._gsiUnsubscribe = null;
    this.map = null;
    this._lastSeen = "";
    this.listeners.clear();
    mapFinder.setNeed("keep", false);
  }

  /**
   * Join the kept map again once CS2 shows the user elsewhere in a casual
   * match: the kept map's match over, or another map loaded. Only a change
   * counts, so a join that found nothing is not restarted on every state
   * CS2 posts.
   * @private
   */
  _check() {
    if (!this.map) return;
    const gsi = gsiManager.getUserState();
    // In the menu, loading or another mode there is nothing to rejoin
    if (!gsi?.inMatch || gsi.mode !== GAME_MODES.CASUAL) {
      this._lastSeen = "";
      return;
    }
    const over = gsi.phase === "gameover";
    const seen = `${gsi.mapName}\n${over}`;
    if (seen === this._lastSeen) return;
    this._lastSeen = seen;
    if (gsi.mapName === this.map && !over) return;

    const map = this.map;
    const joinId = getMapJoinId(map);
    if (joinManager.isActive(joinManager.getJoinStates()[joinId])) return;

    logger.info("MapKeeper", "Joining the kept map again", {
      map,
      from: gsi.mapName,
      over,
    });
    joinManager.startMapJoin({
      map,
      serverId: null,
      label: mapLabel(map),
      getCandidateIds: () => mapFinder.getCandidateIds(map),
    });
  }

  /**
   * @private
   */
  _notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("MapKeeper", "Keep listener failed", {
          error: error.message,
        });
      }
    }
  }
}

const mapKeeper = new MapKeeper();
export default mapKeeper;
