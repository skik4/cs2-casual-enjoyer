// Shared constants
import {
  CASUAL_ROUNDS_TO_WIN,
  GAME_MODES,
  PINNED_MAPS_JOIN_ID,
} from "../shared/constants.js";
import { mapLabel } from "../shared/map-labels.js";

// Game singletons
import gsiManager from "./gsi-manager.js";
import joinManager from "./join-manager.js";
import mapFinder from "./map-finder.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * The maps the user pinned, and keeping the user on them. One join takes a
 * server of any pinned map, the first with a free slot. A casual server
 * loads another map when its match ends, so once CS2 reports the match over
 * or a casual match on a map not pinned, that join starts by itself. It
 * stays quiet in the menu, so leaving a match never pulls the user back in,
 * and the pins go once the user joins a friend or a map not pinned, or
 * cancels their join.
 */
class MapKeeper {
  constructor() {
    /** @type {string[]} Pinned map codes, in the order pinned */
    this.maps = [];
    this.listeners = new Set();
    this._gsiUnsubscribe = null;
    // CS2's last map and match state seen in a casual match
    this._lastSeen = "";
  }

  /**
   * The pinned maps
   * @returns {string[]} - Map codes, e.g. de_dust2
   */
  getMaps() {
    return [...this.maps];
  }

  /**
   * @param {string} map - Map code
   * @returns {boolean}
   */
  isKept(map) {
    return this.maps.includes(map);
  }

  /**
   * The pinned maps by name, e.g. "Dust II / Mirage"
   * @returns {string}
   */
  getLabel() {
    return this.maps.map(mapLabel).join(" / ");
  }

  /**
   * Pin a map, or unpin it if it is pinned already
   * @param {string} map - Map code
   */
  toggle(map) {
    this.maps = this.isKept(map)
      ? this.maps.filter((kept) => kept !== map)
      : [...this.maps, map];
    this._changed();
  }

  /**
   * Unpin every map
   */
  clear() {
    if (!this.maps.length) return;
    this.maps = [];
    this._changed();
  }

  /**
   * The user started a join: a friend or a map not pinned lets the pins go
   * @param {string|null} map - Map of the join, null for a friend
   */
  userJoined(map) {
    if (this.maps.length && (map === null || !this.isKept(map))) this.clear();
  }

  /**
   * The user cancelled a join: cancelling the pinned maps' own lets them go
   * @param {string} joinId - The cancelled attempt
   */
  userCancelled(joinId) {
    if (joinId === PINNED_MAPS_JOIN_ID) this.clear();
  }

  /**
   * Join a server of any pinned map, unless that join runs already. The
   * maps are read again every iteration, so pinning or unpinning one while
   * it runs counts.
   */
  join() {
    if (!this.maps.length || this._joining()) return;
    joinManager.startMapJoin({
      joinId: PINNED_MAPS_JOIN_ID,
      maps: () => this.getMaps(),
      label: () => this.getLabel(),
      getCandidateIds: () => mapFinder.getCandidateIdsForMaps(this.getMaps()),
      primeOnly: () => mapFinder.primeOnly,
      isPrime: (player) => mapFinder.isPrimePlayer(player),
      primeCheck: (serverId) =>
        mapFinder.getPrimeCheck(serverId)?.verdict ?? null,
    });
  }

  /**
   * Subscribe to the pinned maps changing
   * @param {Function} listener - Called with no arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Unpin everything and forget listeners (used by tests)
   */
  reset() {
    if (this._gsiUnsubscribe) this._gsiUnsubscribe();
    this._gsiUnsubscribe = null;
    this.maps = [];
    this._lastSeen = "";
    this.listeners.clear();
    mapFinder.setNeed("keep", false);
  }

  /**
   * The pinned maps' join needs servers known now, not when the Maps view
   * last looked - but only while a pin may start it soon (see
   * _mayJoinSoon). The rest of the time the finder would poll Steam for
   * nothing.
   * @private
   */
  _updateNeed() {
    mapFinder.setNeed("keep", this.maps.length > 0 && this._mayJoinSoon());
  }

  /**
   * Whether a pin may start its join soon. It starts one only on CS2's own
   * state: a casual match on a map not pinned, found from the menu, or a
   * casual match over. So servers must be fresh in the menu, and in a
   * casual match from match point on, when one more round can end it: a
   * round lasts long enough for the finder to look again before the match
   * ends. Before match point, in other modes, and with CS2 closed or
   * posting nothing, no join can start.
   * @returns {boolean}
   * @private
   */
  _mayJoinSoon() {
    const gsi = gsiManager.getUserState();
    if (!gsi) return false;
    if (!gsi.inMatch) return true;
    if (gsi.mode !== GAME_MODES.CASUAL) return false;
    // A score CS2 does not give leaves the end unknown: look as before
    if (gsi.phase === "gameover" || !gsi.score) return true;
    return Math.max(gsi.score.ct, gsi.score.t) >= CASUAL_ROUNDS_TO_WIN - 1;
  }

  /**
   * @returns {boolean} - Whether the pinned maps' join runs
   * @private
   */
  _joining() {
    return joinManager.isActive(
      joinManager.getJoinStates()[PINNED_MAPS_JOIN_ID]
    );
  }

  /**
   * @private
   */
  _changed() {
    if (this.maps.length && !this._gsiUnsubscribe) {
      this._gsiUnsubscribe = gsiManager.onChange(() => {
        this._check();
        this._updateNeed();
      });
    }
    // With nothing pinned any more, its join has nowhere to go
    if (!this.maps.length && this._joining()) {
      joinManager.cancelJoin(PINNED_MAPS_JOIN_ID, "unpinned");
    }
    this._updateNeed();
    this._lastSeen = "";
    this._notify();
    this._check();
  }

  /**
   * Join a pinned map once CS2 shows the user elsewhere in a casual match:
   * the match over, or a map not pinned. Only a change counts, so a join
   * that found nothing is not restarted on every state CS2 posts.
   * @private
   */
  _check() {
    if (!this.maps.length) return;
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
    if (this.isKept(gsi.mapName) && !over) return;
    if (this._joining()) return;

    logger.info("MapKeeper", "Joining a pinned map", {
      maps: this.maps,
      from: gsi.mapName,
      over,
    });
    this.join();
  }

  /**
   * @private
   */
  _notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("MapKeeper", "Pin listener failed", {
          error: error.message,
        });
      }
    }
  }
}

const mapKeeper = new MapKeeper();
export default mapKeeper;
