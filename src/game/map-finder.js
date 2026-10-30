// Shared constants
import { API_CONFIG, GAME_MODES, MAP_FINDER_CONFIG } from "../shared/constants.js";

// Game singletons
import gsiManager from "./gsi-manager.js";
import joinJournal from "./join-journal.js";

// UI and utilities
import SteamAPI from "../steam/steam-api.js";
import SteamAPIUtils from "../steam/steam-api-utils.js";
import Validators from "../utils/validators.js";
import logger from "../utils/logger.js";

const MAP_LABELS = {
  de_dust2: "Dust II",
  de_mirage: "Mirage",
  de_inferno: "Inferno",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_vertigo: "Vertigo",
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_train: "Train",
  de_cache: "Cache",
  cs_office: "Office",
  cs_italy: "Italy",
  cs_agency: "Agency",
};

// One-shot ids waiting for their first look
const MAX_SEEDS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Human-readable name of a map
 * @param {string} map - Map code, e.g. de_dust2
 * @returns {string}
 */
export function mapLabel(map) {
  if (MAP_LABELS[map]) return MAP_LABELS[map];
  const bare = String(map || "").replace(/^[a-z]{2}_/, "");
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : String(map || "");
}

/**
 * Order servers for joining: a free slot first, then the freshest match
 * @param {import('../shared/types.js').MapServer} a
 * @param {import('../shared/types.js').MapServer} b
 * @returns {number}
 */
export function compareServers(a, b) {
  if (a.freeSlot !== b.freeSlot) return a.freeSlot ? -1 : 1;
  return (a.rounds ?? 0) - (b.rounds ?? 0);
}

/**
 * Group players on official casual servers into servers
 * @param {Iterable<import('../shared/types.js').PlayerPresence>} presences
 * @returns {import('../shared/types.js').MapServer[]}
 */
export function buildServers(presences) {
  const servers = new Map();
  for (const player of presences) {
    if (!player?.official || !player.serverId || !player.map) continue;

    let server = servers.get(player.serverId);
    if (!server) {
      server = {
        serverId: player.serverId,
        map: player.map,
        score: null,
        rounds: null,
        freeSlot: false,
        players: [],
      };
      servers.set(player.serverId, server);
    }

    server.players.push({
      steamid: player.steamid,
      personaname: player.personaname,
      connect: player.connect,
    });
    if (player.connect) server.freeSlot = true;

    // Players can be a round apart; the furthest one is the latest
    const rounds = SteamAPIUtils.parseRoundsPlayed(player.score);
    if (rounds !== null && (server.rounds === null || rounds > server.rounds)) {
      server.rounds = rounds;
      server.score = player.score;
    }
  }
  return [...servers.values()];
}

/**
 * Map finder module
 * Finds official casual servers by map through the people on them. Valve
 * publishes no list of its servers, but a player's rich presence tells the
 * map, the score and - when there is a free slot - the connect string.
 * Players come from the user's friends, a pool of people seen on official
 * servers before, friends of friends (API key only) and whoever CS2 shows or
 * lists in the user's own matches.
 */
class MapFinder {
  constructor() {
    /** @type {Map<string, {lastSeen: number, map: string}>} */
    this.pool = new Map();
    this.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    this.seeds = new Set();
    /** @type {import('../shared/types.js').MapServer[]} */
    this.servers = [];
    this.status = {
      refreshing: false,
      lastRefreshAt: 0,
      polled: 0,
      fof: "no-key",
    };
    this.deps = null;
    this.active = false;
    this.listeners = new Set();
    this._loaded = false;
    this._timer = null;
    this._saveTimer = null;
    this._fofRunning = false;
    this._fofOffset = 0;
    this._refreshAgain = false;
    this._gsiUnsubscribe = null;
    // Seeds Steam has answered about this run, so watching the same player
    // again asks nothing new
    this._checkedSeeds = new Set();
    this._checkingSeeds = false;
    this._checkSeedsAgain = false;
    this._seedTimer = null;
    this.journal = joinJournal;
  }

  /**
   * Hand the finder what it reads from the rest of the app
   * @param {Object} deps
   * @param {Function} deps.getAuth - Main API key or token
   * @param {Function} deps.getUserId - User's SteamID64
   * @param {Function} deps.getFriendIds - Friends and manually added ids to poll
   * @param {Function} deps.getRealFriendIds - Friends whose friends lists to read
   * @param {Function} deps.getFofKey - API key for friends lists, "" without one
   */
  configure(deps) {
    this.deps = deps;
    if (!this._gsiUnsubscribe) {
      this._gsiUnsubscribe = gsiManager.onChange(() => this._seedFromGsi());
    }
  }

  /**
   * Seed whoever CS2 reports in the user's own casual match: the player the
   * user spectates and, when CS2 lists them, everyone on the server. They are
   * asked about at once, whatever view is open: right now they share a server
   * with the user, which a later refresh cannot promise.
   * @private
   */
  _seedFromGsi() {
    // Players from a match in any other mode could never join a pool of
    // casual players, so Steam is not even asked about them
    if (gsiManager.getUserState()?.mode !== GAME_MODES.CASUAL) return;
    const listed = gsiManager.getListedPlayerIds();
    const before = this.seeds.size;
    for (const id of [gsiManager.getObservedSteamId(), ...listed]) {
      if (
        id &&
        this.seeds.size < MAX_SEEDS &&
        !this._checkedSeeds.has(id) &&
        !this.pool.has(id)
      ) {
        this.seeds.add(id);
      }
    }
    if (this.seeds.size === before) return;
    if (listed.length) {
      logger.info("MapFinder", "Seeded players listed by CS2", {
        listed: listed.length,
        added: this.seeds.size - before,
      });
    }
    this._checkSeeds();
  }

  /**
   * Ask Steam about the seeds now and put the ones on an official server
   * into the pool
   * @private
   */
  async _checkSeeds() {
    if (this._checkingSeeds) {
      this._checkSeedsAgain = true;
      return;
    }
    const auth = this.deps?.getAuth?.();
    if (!auth || !this.seeds.size) return;

    this._checkingSeeds = true;
    try {
      // The pool on disk comes first, or saving would replace it
      await this._load();
      do {
        this._checkSeedsAgain = false;
        const ids = [...this.seeds];
        const presence = await SteamAPI.getPresence(ids, auth);
        const added = this._addToPool(presence.values(), Date.now());
        this.journal.record("seeds", this._takeSeedAnswers(ids, presence));
        if (added) {
          this._scheduleSave();
          this._notify();
        }
      } while (this._checkSeedsAgain && this.seeds.size);
    } catch (error) {
      logger.warn("MapFinder", "Checking seeds failed", {
        error: error.message,
      });
    } finally {
      this._checkingSeeds = false;
    }
  }

  /**
   * Remember the players on official servers
   * @param {Iterable<import('../shared/types.js').PlayerPresence>} players
   * @param {number} now - Time to remember them by
   * @returns {number} - How many were not in the pool before
   * @private
   */
  _addToPool(players, now) {
    let added = 0;
    for (const player of players) {
      if (!player.official || !player.steamid) continue;
      if (!this.pool.has(player.steamid)) added++;
      this.pool.set(player.steamid, { lastSeen: now, map: player.map });
    }
    return added;
  }

  /**
   * Settle the seeds Steam answered about: one on an official server is in
   * the pool by now, and one on no server the pool wants is dropped. One on
   * a server Steam gave no address for yet - a server just started may not
   * be listed - stays for another look, as does one Steam did not answer.
   * @param {string[]} ids - Seeds that were asked about
   * @param {Map<string, import('../shared/types.js').PlayerPresence>} presence
   * @returns {{asked: number, answered: number, pooled: number, waiting: number, notInGame: number, other: number}}
   *   What became of them, for the join journal
   * @private
   */
  _takeSeedAnswers(ids, presence) {
    const counts = {
      asked: ids.length,
      answered: 0,
      pooled: 0,
      waiting: 0,
      notInGame: 0,
      other: 0,
    };
    for (const id of ids) {
      const player = presence.get(id);
      if (!player) continue;
      counts.answered++;
      if (player.serverAddressUnknown) {
        counts.waiting++;
        continue;
      }
      if (player.official) counts.pooled++;
      // Steam shows no CS2: the player left the game or hides game details
      else if (!player.inCS2) counts.notInGame++;
      else counts.other++;
      this.seeds.delete(id);
      this._checkedSeeds.add(id);
    }
    if (counts.waiting) this._scheduleSeedCheck();
    return counts;
  }

  /**
   * Look at the waiting seeds again once Steam is asked about their server
   * again: an address it did not list is asked for anew after this long
   * @private
   */
  _scheduleSeedCheck() {
    if (this._seedTimer) return;
    this._seedTimer = setTimeout(() => {
      this._seedTimer = null;
      this._checkSeeds();
    }, API_CONFIG.NO_SERVER_ADDRESS_TTL_MS);
  }

  /**
   * Start finding while the maps view is open
   */
  async start() {
    if (this.active) return;
    this.active = true;
    await this._load();
    if (!this.active) return;

    this._tick();
    this._timer = setInterval(
      () => this._tick(),
      MAP_FINDER_CONFIG.REFRESH_INTERVAL_MS
    );
  }

  /**
   * Stop polling; running join attempts read their own presence
   */
  stop() {
    this.active = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /**
   * Poll every known player once and rebuild the server list
   */
  async refresh() {
    if (this.status.refreshing) {
      this._refreshAgain = true;
      return;
    }

    const auth = this.deps?.getAuth?.();
    const userId = this.deps?.getUserId?.();
    if (!auth) return;

    this.status.refreshing = true;
    this._notify();
    try {
      const ids = this._idsToPoll(userId);
      const polledSeeds = [...this.seeds].filter((id) => ids.has(id));
      const presence = await SteamAPI.getPresence([...ids], auth);

      const now = Date.now();
      this._addToPool(presence.values(), now);
      if (polledSeeds.length) {
        this.journal.record("seeds", this._takeSeedAnswers(polledSeeds, presence));
      }
      this._prunePool(now);

      this.servers = buildServers(presence.values());
      this.status.lastRefreshAt = now;
      this.status.polled = ids.size;
      this._scheduleSave();
    } catch (error) {
      logger.error("MapFinder", "Refresh failed", { error: error.message });
    } finally {
      this.status.refreshing = false;
      this._notify();
    }

    if (this._refreshAgain) {
      this._refreshAgain = false;
      await this.refresh();
    }
  }

  /**
   * Maps with at least one known official server
   * @returns {Array<{map: string, label: string, servers: number, freeServers: number}>}
   */
  getMaps() {
    const maps = new Map();
    for (const server of this.servers) {
      const entry = maps.get(server.map) || {
        map: server.map,
        label: mapLabel(server.map),
        servers: 0,
        freeServers: 0,
      };
      entry.servers++;
      if (server.freeSlot) entry.freeServers++;
      maps.set(server.map, entry);
    }
    return [...maps.values()].sort(
      (a, b) =>
        b.freeServers - a.freeServers ||
        b.servers - a.servers ||
        a.label.localeCompare(b.label)
    );
  }

  /**
   * Known servers of a map, best to join first
   * @param {string} map - Map code
   * @returns {import('../shared/types.js').MapServer[]}
   */
  getServers(map) {
    return this.servers
      .filter((server) => server.map === map)
      .sort(compareServers);
  }

  /**
   * Players to join through, best server first
   * @param {string} map - Map code
   * @param {string|null} [serverId] - Only this server
   * @returns {string[]} - SteamID64s
   */
  getCandidateIds(map, serverId = null) {
    return this.getServers(map)
      .filter((server) => !serverId || server.serverId === serverId)
      .flatMap((server) => server.players.map((player) => player.steamid));
  }

  /**
   * Forget friends of friends and read them again, e.g. after a new API key
   */
  restartFof() {
    this.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    this.status.fof = this.deps?.getFofKey?.() ? "pending" : "no-key";
    this._scheduleSave();
    if (this.active && this._fofDue()) this._crawlFof();
    this._notify();
  }

  /**
   * Counters for the status line
   * @returns {{refreshing: boolean, lastRefreshAt: number, polled: number, fof: string, poolSize: number, fofSize: number}}
   */
  getStatus() {
    return {
      ...this.status,
      poolSize: this.pool.size,
      fofSize: this.fof.ids.length,
    };
  }

  /**
   * Subscribe to changes
   * @param {Function} listener - Called without arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Forget everything found so far and stop (used by tests)
   */
  reset() {
    this.stop();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this.pool = new Map();
    this.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    this.seeds = new Set();
    this.servers = [];
    this.status = {
      refreshing: false,
      lastRefreshAt: 0,
      polled: 0,
      fof: "no-key",
    };
    this._loaded = false;
    this._fofRunning = false;
    this._fofOffset = 0;
    this._refreshAgain = false;
    if (this._seedTimer) clearTimeout(this._seedTimer);
    this._seedTimer = null;
    this._checkedSeeds = new Set();
    this._checkingSeeds = false;
    this._checkSeedsAgain = false;
  }

  /**
   * One periodic step: read friends of friends when due, then refresh
   * @private
   */
  _tick() {
    if (this._fofDue()) this._crawlFof();
    this.refresh();
  }

  /**
   * Everyone to ask about this round, up to the cap: friends, fresh seeds,
   * the pool (most recent first), then friends of friends in the room
   * left, a different slice each round
   * @param {string} userId - User's SteamID64, never polled here
   * @returns {Set<string>}
   * @private
   */
  _idsToPoll(userId) {
    const cap = MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH;
    const ids = new Set();
    const add = (id) => {
      const steamId = String(id);
      if (ids.size < cap && steamId !== userId && Validators.validateSteamId(steamId)) {
        ids.add(steamId);
      }
    };

    (this.deps?.getFriendIds?.() || []).forEach(add);
    // Seeds go before the pool: a full pool would leave them no room
    this.seeds.forEach(add);
    [...this.pool.entries()]
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .forEach(([id]) => add(id));

    const fof = this.fof.ids;
    const room = Math.min(cap - ids.size, fof.length);
    if (room > 0) {
      for (let i = 0; i < room; i++) add(fof[(this._fofOffset + i) % fof.length]);
      this._fofOffset = (this._fofOffset + room) % fof.length;
    }
    return ids;
  }

  /**
   * @returns {boolean}
   * @private
   */
  _fofDue() {
    if (!this.deps?.getFofKey?.()) {
      // Without a key the lists cannot be read again, but whatever was read
      // before is still polled - the key may have been used once and deleted
      this.status.fof = this.fof.ids.length ? "ready" : "no-key";
      return false;
    }
    if (this._fofRunning) return false;
    const friendsCount = (this.deps.getRealFriendIds?.() || []).length;
    return (
      Date.now() - this.fof.fetchedAt >= MAP_FINDER_CONFIG.FOF_REFRESH_MS ||
      this.fof.friendsCount !== friendsCount
    );
  }

  /**
   * Read the friends lists of the user's friends. Kept for a day: friends
   * lists change slowly, and one pass costs a request per friend.
   * @private
   */
  async _crawlFof() {
    const key = this.deps.getFofKey();
    const userId = this.deps.getUserId?.();
    const friendIds = (this.deps.getRealFriendIds?.() || []).map(String);
    const own = new Set([userId, ...friendIds]);
    const found = new Set();
    let listsRead = 0;

    this._fofRunning = true;
    this.status.fof = "crawling";
    this._notify();
    try {
      for (const friendId of friendIds) {
        if (found.size >= MAP_FINDER_CONFIG.FOF_MAX_IDS) break;
        const ids = await SteamAPI.getFriendIdsOf(friendId, key);
        if (ids.length) listsRead++;
        for (const id of ids) {
          if (!own.has(id) && found.size < MAP_FINDER_CONFIG.FOF_MAX_IDS) {
            found.add(id);
          }
        }
        await sleep(MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS);
      }

      // Not one readable list: most likely a wrong key - try again later
      // rather than settle on an empty result for a day
      if (friendIds.length && listsRead === 0) {
        this.status.fof = "error";
        return;
      }
      this.fof = {
        ids: [...found],
        fetchedAt: Date.now(),
        friendsCount: friendIds.length,
      };
      this.status.fof = "ready";
      this._scheduleSave();
    } catch (error) {
      logger.error("MapFinder", "Friends of friends failed", {
        error: error.message,
      });
      this.status.fof = "error";
    } finally {
      this._fofRunning = false;
      this._notify();
    }
  }

  /**
   * Drop players not seen on an official server for too long, and keep the
   * pool to its size limit
   * @param {number} now - Current time
   * @private
   */
  _prunePool(now) {
    for (const [id, entry] of this.pool) {
      if (now - entry.lastSeen > MAP_FINDER_CONFIG.POOL_TTL_MS) this.pool.delete(id);
    }
    if (this.pool.size > MAP_FINDER_CONFIG.POOL_MAX) {
      const keep = [...this.pool.entries()]
        .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
        .slice(0, MAP_FINDER_CONFIG.POOL_MAX);
      this.pool = new Map(keep);
    }
  }

  /**
   * Load the pool and friends of friends kept from earlier runs
   * @private
   */
  async _load() {
    if (this._loaded) return;
    this._loaded = true;

    const data = await window.electronAPI?.mapFinder?.load?.();
    for (const [id, entry] of Object.entries(data?.pool || {})) {
      if (!Validators.validateSteamId(id) || !Number.isFinite(entry?.lastSeen)) {
        continue;
      }
      this.pool.set(id, {
        lastSeen: entry.lastSeen,
        map: String(entry.map || ""),
      });
    }
    if (Array.isArray(data?.fof?.ids)) {
      this.fof = {
        ids: data.fof.ids
          .map(String)
          .filter((id) => Validators.validateSteamId(id))
          .slice(0, MAP_FINDER_CONFIG.FOF_MAX_IDS),
        fetchedAt: Number(data.fof.fetchedAt) || 0,
        friendsCount: Number(data.fof.friendsCount) || 0,
      };
      if (this.fof.ids.length) this.status.fof = "ready";
    }
    this._prunePool(Date.now());
  }

  /**
   * Save shortly after the last change, not on every refresh
   * @private
   */
  _scheduleSave() {
    const api = window.electronAPI?.mapFinder;
    if (!api || this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      // The bridge reports failures as false rather than throwing
      api.save({
        version: 1,
        pool: Object.fromEntries(this.pool),
        fof: this.fof,
      });
    }, 2000);
  }

  /**
   * @private
   */
  _notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("MapFinder", "Listener failed", { error: error.message });
      }
    }
  }
}

// Singleton instance
const mapFinder = new MapFinder();

export default mapFinder;
