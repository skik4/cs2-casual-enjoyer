// Shared constants
import { GAME_MODES, MAP_FINDER_CONFIG } from "../shared/constants.js";
import { mapLabel } from "../shared/map-labels.js";

// Game singletons
import gsiManager from "./gsi-manager.js";
import joinJournal from "./join-journal.js";
import userLocation from "./user-location.js";

// UI and utilities
import SteamAPI from "../steam/steam-api.js";
import { isMatchOver, parseRoundsPlayed } from "../steam/rich-presence.js";
import credentialState from "../steam/credential-state.js";
import Validators from "../utils/validators.js";
import logger from "../utils/logger.js";

// One-shot ids waiting for their first look
const MAX_SEEDS = 3000;

// Friend checks one refresh may start. A check reads the player's friends
// list on the key, unless it was read in the last day, then asks where the
// friends are, one request per 100 of them: about three requests for a list
// of one or two hundred. A big pool can show dozens of players with a sign
// of Prime on official servers at once (40 in the census of 2026-11-04);
// checking them all at once would add several times the 30 requests a
// refresh takes at most. Four add about 12, and since a result holds while
// its player stays on the server, they still get through such a crowd
// within a few minutes, the servers best to join first.
export const FRIEND_CHECKS_PER_REFRESH = 4;

// Friends lists kept for the friend check, counted in ids. At about 20
// bytes an id in map-finder.json this is near 1 MB, which keeps the store
// well inside its 5 MB with every other list at its limit. Over it the
// lists read longest ago go first.
export const FRIEND_LISTS_MAX_IDS = 50000;

/**
 * What the friend check says about a player with a sign of Prime on an
 * official casual server. The mark is all it gives: the list, Prime only
 * and the joins never go by it.
 */
export const PRIME_CHECK = Object.freeze({
  // The friends list is open and no friend shows on that server: most
  // likely matchmaking put the player there
  ALONE: "alone",
  // Every friend showing on that server has a sign of Prime too
  PRIME_FRIENDS: "prime-friends",
  // No key, a closed friends list, or not checked yet
  UNKNOWN: "unknown",
  // A friend there shows no sign of Prime: the player may have joined that
  // friend's match without Prime
  FRIEND: "friend",
});

/**
 * Why the friend check could not say anything about a player
 */
export const PRIME_CHECK_REASONS = Object.freeze({
  // Not checked yet; it comes within the next refreshes
  PENDING: "pending",
  // Only a key reads other people's friends lists
  NO_KEY: "no-key",
  // Steam gave no friends: a closed list, or the read failed
  CLOSED: "closed",
});

// A server takes the answer of its best player with a sign of Prime: one
// alone or among Prime friends settles it, a doubt counts only when nothing
// better is known. Among the unknown ones, a check still to come tells most.
const PRIME_CHECK_ORDER = [
  PRIME_CHECK.ALONE,
  PRIME_CHECK.PRIME_FRIENDS,
  PRIME_CHECK_REASONS.PENDING,
  PRIME_CHECK_REASONS.NO_KEY,
  PRIME_CHECK_REASONS.CLOSED,
  PRIME_CHECK.FRIEND,
];

/**
 * The friend check's answer for a server, from its players with a sign of
 * Prime: the best of their answers
 * @param {Array<{verdict: string, reason: string|null}>} checks - One per
 *   player with a sign of Prime on the server
 * @param {boolean} hasKey - Whether lists can be read, for a server whose
 *   players are not known
 * @returns {{verdict: string, reason: string|null}}
 */
export function bestPrimeCheck(checks, hasKey) {
  const rank = (check) =>
    PRIME_CHECK_ORDER.indexOf(check.reason ?? check.verdict);
  const best = checks.reduce(
    (found, check) => (!found || rank(check) < rank(found) ? check : found),
    null
  );
  return (
    best ?? {
      verdict: PRIME_CHECK.UNKNOWN,
      reason: hasKey ? PRIME_CHECK_REASONS.PENDING : PRIME_CHECK_REASONS.NO_KEY,
    }
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Order servers for joining: a running match before a finished one, a free
 * slot first, then the freshest match
 * @param {import('../shared/types.js').MapServer} a
 * @param {import('../shared/types.js').MapServer} b
 * @returns {number}
 */
export function compareServers(a, b) {
  if (a.over !== b.over) return a.over ? 1 : -1;
  if (a.freeSlot !== b.freeSlot) return a.freeSlot ? -1 : 1;
  return (a.rounds ?? 0) - (b.rounds ?? 0);
}

/**
 * Group players on official casual servers into servers. A server keeps its
 * id when its match ends and it loads the next map, so its players can
 * disagree for a while: the one whose status changed last speaks for the
 * server, and a finished match gives way to one that is not.
 * @param {Iterable<import('../shared/types.js').PlayerPresence>} presences
 * @param {(steamid: string) => number} [statusSince] - When a player's
 *   status last changed, as far as the caller has seen
 * @param {(player: import('../shared/types.js').PlayerPresence) => boolean} [isPrime] -
 *   Whether a player has shown a sign of Prime
 * @returns {import('../shared/types.js').MapServer[]}
 */
export function buildServers(
  presences,
  statusSince = () => 0,
  isPrime = (player) => Boolean(player.primeSign)
) {
  const byServer = new Map();
  for (const player of presences) {
    if (!player?.official || !player.serverId || !player.map) continue;
    const entries = byServer.get(player.serverId) || [];
    entries.push({
      player,
      since: statusSince(player.steamid) || 0,
      over: isMatchOver(player.score),
      rounds: parseRoundsPlayed(player.score),
    });
    byServer.set(player.serverId, entries);
  }

  const servers = [];
  for (const [serverId, entries] of byServer) {
    const [newest] = [...entries].sort(
      (a, b) =>
        b.since - a.since ||
        Number(a.over) - Number(b.over) ||
        (b.rounds ?? -1) - (a.rounds ?? -1)
    );
    const { map } = newest.player;
    // Whoever still shows another map has not caught up with the server
    const current = entries.filter((entry) => entry.player.map === map);
    // Players can be a round apart; the furthest one is the latest
    const furthest = current.reduce((best, entry) =>
      (entry.rounds ?? -1) > (best.rounds ?? -1) ? entry : best
    );

    const players = current.map(({ player }) => ({
      steamid: player.steamid,
      personaname: player.personaname,
      connect: player.connect,
      prime: isPrime(player),
    }));
    servers.push({
      serverId,
      map,
      score: furthest.rounds === null ? null : furthest.player.score,
      rounds: furthest.rounds,
      over: furthest.over,
      freeSlot: current.some((entry) => entry.player.connect),
      primePlayers: players.filter((player) => player.prime).length,
      players,
    });
  }
  return servers;
}

/**
 * Map finder module
 * Finds official casual servers by map through the people on them. Valve
 * publishes no list of its servers, but a player's rich presence tells the
 * map, the score and - when there is a free slot - the connect string.
 * Players come from the user's friends, the pool, the friends of pool
 * players and friends of friends (both read with an API key, and only when
 * the user asks). The pool holds the players of the user's own casual
 * matches, whoever CS2 shows or lists there, and nobody else: the other
 * sources feed the map list every round but never join it. The pool is
 * polled every round; the friends lists, far bigger and far fewer of them
 * in casual, a slice each round in turn.
 *
 * Whoever shows a sign of Prime is remembered for good, since Prime is never
 * taken away. A server with one of them on it is marked, and with "Prime
 * only" on, the list and the map joins keep to such servers. The mark is a
 * likelihood, not a proof: Valve matches Prime players only with each other,
 * but a Prime player can still join a friend's match without Prime.
 *
 * With a key the finder looks for that case: it reads the friends lists of
 * the players with a sign of Prime on official servers and asks where those
 * friends are. A friend without a sign of Prime on the same server dims the
 * server's mark; nothing else changes, Prime only and the joins included.
 */
class MapFinder {
  constructor() {
    /** @type {Map<string, {lastSeen: number, map: string}>} */
    this.pool = new Map();
    /** @type {Map<string, number>} Players seen with a sign of Prime -> last seen */
    this.prime = new Map();
    // Whether the list and the map joins keep to servers with a sign of Prime
    this.primeOnly = false;
    this.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    // Friends of pool players, and when each pool player's list was read
    this.poolFriends = { ids: [], crawled: {} };
    // Friends lists of players with a sign of Prime, read for the friend
    // check, the one read longest ago first. No ids is a closed list.
    /** @type {Map<string, {at: number, ids: string[]}>} */
    this.friendLists = new Map();
    // What the friend check found for each player with a sign of Prime, on
    // the server it checked them on; it holds while they stay there
    /** @type {Map<string, {serverId: string, verdict: string, reason: string|null}>} */
    this._friendChecks = new Map();
    // The friend checks under way, null when none run
    this._friendChecking = null;
    this.seeds = new Set();
    /** @type {import('../shared/types.js').MapServer[]} */
    this.servers = [];
    this.status = this._idleStatus();
    this.deps = null;
    this.active = false;
    this.listeners = new Set();
    // The store being read, shared by everyone who asks for it
    this._loading = null;
    this._timer = null;
    this._saveTimer = null;
    this._fofRunning = false;
    // Changes when friends of friends are cleared, so a read under way stops
    this._fofGeneration = 0;
    this._poolFriendsRunning = false;
    // Changes when the pool or its players' friends are cleared, so a read
    // under way stops
    this._poolGeneration = 0;
    this._candidateOffset = 0;
    this._refreshAgain = false;
    this._gsiUnsubscribe = null;
    // Seeds Steam has answered about this run, so watching the same player
    // again asks nothing new
    this._checkedSeeds = new Set();
    this._checkingSeeds = false;
    this._checkSeedsAgain = false;
    // Each polled player's status and when it last changed
    /** @type {Map<string, {key: string, since: number}>} */
    this._statusSince = new Map();
    // Whoever currently needs polling, see setNeed
    this._needs = new Set();
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
        const now = Date.now();
        const added = this._addToPool(presence.values(), now);
        const primeAdded = this._rememberPrime(presence.values(), now);
        this.journal.record("seeds", this._takeSeedAnswers(ids, presence));
        if (added || primeAdded) {
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
   * Take into the pool the players of the user's own matches (the seeds)
   * who are on an official server. Nobody else joins the pool.
   * @param {Iterable<import('../shared/types.js').PlayerPresence>} players - Seeds Steam answered about
   * @param {number} now - Time to remember them by
   * @returns {number} - How many were not in the pool before
   * @private
   */
  _addToPool(players, now) {
    let added = 0;
    for (const player of players) {
      if (!player?.official || !player.steamid) continue;
      if (!this.pool.has(player.steamid)) added++;
      this.pool.set(player.steamid, { lastSeen: now, map: player.map });
    }
    return added;
  }

  /**
   * Note the pool players seen on an official server again, so they stay
   * another POOL_TTL_MS. Anyone else polled feeds the map list alone.
   * @param {Iterable<import('../shared/types.js').PlayerPresence>} players
   * @param {number} now - Time to remember them by
   * @private
   */
  _keepPoolSeen(players, now) {
    for (const player of players) {
      if (player?.official && this.pool.has(player.steamid)) {
        this.pool.set(player.steamid, { lastSeen: now, map: player.map });
      }
    }
  }

  /**
   * Remember the players showing a sign of Prime. A player's XP trail fades,
   * but Prime stays, so once is enough for good.
   * @param {Iterable<import('../shared/types.js').PlayerPresence>} players
   * @param {number} now - Time to remember them by
   * @returns {number} - How many were not remembered before
   * @private
   */
  _rememberPrime(players, now) {
    let added = 0;
    for (const player of players) {
      if (!player?.primeSign || !player.steamid) continue;
      if (!this.prime.has(player.steamid)) added++;
      this.prime.set(player.steamid, now);
    }
    return added;
  }

  /**
   * Whether a player has shown a sign of Prime, now or before
   * @param {import('../shared/types.js').PlayerPresence|{steamid: string}} player
   * @returns {boolean}
   */
  isPrimePlayer(player) {
    return (
      Boolean(player?.primeSign) || this.prime.has(String(player?.steamid))
    );
  }

  /**
   * What the friend check says about a server: the best answer among its
   * players with a sign of Prime. Only a mark: nothing is listed, left out
   * or joined by it.
   * @param {string} serverId - Game server Steam ID
   * @returns {{verdict: string, reason: string|null}|null} - A PRIME_CHECK
   *   verdict, with a PRIME_CHECK_REASONS reason when it is unknown; null
   *   when no player there shows a sign of Prime
   */
  getPrimeCheck(serverId) {
    const server = this.servers.find((s) => s.serverId === serverId);
    if (!server?.primePlayers) return null;
    const hasKey = Boolean(this.deps?.getFofKey?.());
    return bestPrimeCheck(
      server.players
        .filter((player) => player.prime)
        .map((player) =>
          this._playerPrimeCheck(player.steamid, serverId, hasKey)
        ),
      hasKey
    );
  }

  /**
   * What the friend check found for one player with a sign of Prime on a
   * server
   * @param {string} steamid
   * @param {string} serverId - The server the player is on
   * @param {boolean} hasKey - Whether lists can be read
   * @returns {{verdict: string, reason: string|null}}
   * @private
   */
  _playerPrimeCheck(steamid, serverId, hasKey) {
    const check = this._friendChecks.get(steamid);
    // A check made on another server says nothing about this one
    if (check?.serverId === serverId) {
      return { verdict: check.verdict, reason: check.reason };
    }
    return {
      verdict: PRIME_CHECK.UNKNOWN,
      reason: hasKey ? PRIME_CHECK_REASONS.PENDING : PRIME_CHECK_REASONS.NO_KEY,
    };
  }

  /**
   * Keep the list and the map joins to servers with a sign of Prime, or not
   * @param {boolean} on
   */
  setPrimeOnly(on) {
    if (this.primeOnly === Boolean(on)) return;
    this.primeOnly = Boolean(on);
    logger.info("MapFinder", "Prime only", { on: this.primeOnly });
    this._notify();
  }

  /**
   * Settle the seeds Steam answered about: one on an official server is in
   * the pool by now, and one on no server the pool wants is dropped. One
   * Steam did not answer about stays for another look.
   * @param {string[]} ids - Seeds that were asked about
   * @param {Map<string, import('../shared/types.js').PlayerPresence>} presence
   * @returns {{asked: number, answered: number, pooled: number, notInGame: number, other: number}}
   *   What became of them, for the join journal
   * @private
   */
  _takeSeedAnswers(ids, presence) {
    const counts = {
      asked: ids.length,
      answered: 0,
      pooled: 0,
      notInGame: 0,
      other: 0,
    };
    for (const id of ids) {
      const player = presence.get(id);
      if (!player) continue;
      counts.answered++;
      if (player.official) counts.pooled++;
      // Steam shows no CS2: the player left the game or hides game details
      else if (!player.inCS2) counts.notInGame++;
      else counts.other++;
      this.seeds.delete(id);
      this._checkedSeeds.add(id);
    }
    return counts;
  }

  /**
   * Keep polling while anything needs fresh servers: the open Maps view, a
   * running map or server join, a kept map. A join waiting on another tab
   * would otherwise go on with the servers known when the view closed.
   * @param {string} name - Who needs it, e.g. "view"
   * @param {boolean} needed
   */
  setNeed(name, needed) {
    if (needed) this._needs.add(name);
    else this._needs.delete(name);
    if (this._needs.size) this.start();
    else this.stop();
  }

  /**
   * Start finding
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
    // A credential Steam turned down would fail every request of the batch;
    // the servers known stay until another one is pasted
    if (!auth || credentialState.isRejected(auth)) return;

    this.status.refreshing = true;
    this._notify();
    let refreshed = false;
    try {
      const ids = this._idsToPoll(userId);
      const polledSeeds = [...this.seeds].filter((id) => ids.has(id));
      const presence = await SteamAPI.getPresence([...ids], auth);

      // Not one answer means every request failed: Steam down, the token
      // expired, the daily limit reached. What was known stays, so a join
      // under way keeps its candidates and the list does not go blank until
      // a refresh gets through.
      if (ids.size && !presence.size) {
        logger.warn("MapFinder", "Refresh got no answer", { asked: ids.size });
      } else {
        const now = Date.now();
        // Only the seeds join the pool; a pool player seen again stays
        this._addToPool(
          polledSeeds.map((id) => presence.get(id)),
          now
        );
        this._keepPoolSeen(presence.values(), now);
        this._rememberPrime(presence.values(), now);
        if (polledSeeds.length) {
          this.journal.record(
            "seeds",
            this._takeSeedAnswers(polledSeeds, presence)
          );
        }
        this._prunePool(now);

        this._noteStatusChanges(presence, now);
        this.servers = buildServers(
          presence.values(),
          (id) => this._statusSince.get(id)?.since ?? 0,
          (player) => this.isPrimePlayer(player)
        );
        this._keepFriendChecks(presence, ids);
        this.status.lastRefreshAt = now;
        this.status.polled = ids.size;
        this._scheduleSave();
        refreshed = true;
      }
    } catch (error) {
      logger.error("MapFinder", "Refresh failed", { error: error.message });
    } finally {
      this.status.refreshing = false;
      this._notify();
    }

    // The checks run beside the polling, never holding up the next refresh;
    // one still under way takes this refresh's turn
    if (refreshed && !this._friendChecking) {
      this._friendChecking = this._checkFriends().finally(() => {
        this._friendChecking = null;
      });
    }

    if (this._refreshAgain) {
      this._refreshAgain = false;
      await this.refresh();
    }
  }

  /**
   * Maps with at least one known official server; with Prime only on, one
   * with a sign of Prime
   * @returns {Array<{map: string, label: string, servers: number, freeServers: number, primeServers: number}>}
   */
  getMaps() {
    const maps = new Map();
    for (const server of this._shownServers()) {
      const entry = maps.get(server.map) || {
        map: server.map,
        label: mapLabel(server.map),
        servers: 0,
        freeServers: 0,
        primeServers: 0,
      };
      entry.servers++;
      if (this._joinable(server) && server.freeSlot) entry.freeServers++;
      if (server.primePlayers > 0) entry.primeServers++;
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
    return this._shownServers()
      .filter((server) => server.map === map)
      .sort(compareServers);
  }

  /**
   * The servers to list and to join: all of them, or with Prime only on,
   * those with a sign of Prime
   * @returns {import('../shared/types.js').MapServer[]}
   * @private
   */
  _shownServers() {
    const servers = this._currentServers();
    return this.primeOnly
      ? servers.filter((server) => server.primePlayers > 0)
      : servers;
  }

  /**
   * Whether joining a server can take the user anywhere new: not once its
   * match is over, and not while the user is on it
   * @param {import('../shared/types.js').MapServer} server
   * @returns {boolean}
   * @private
   */
  _joinable(server) {
    return !server.over && server.serverId !== userLocation.getServerId();
  }

  /**
   * The known servers, the user's own one checked against what CS2 itself
   * reports. Steam's copy of its players lags when the match ends and the
   * server moves on, under the same id, to its next map.
   * @returns {import('../shared/types.js').MapServer[]}
   * @private
   */
  _currentServers() {
    const serverId = userLocation.getServerId();
    const own = serverId ? userLocation.getOwnMatch() : null;
    if (!own) return this.servers;
    return this.servers.map((server) =>
      server.serverId !== serverId ||
      (server.map === own.map && server.over === own.over)
        ? server
        : {
            ...server,
            map: own.map,
            score: null,
            rounds: null,
            over: own.over,
            // Its known players still show the old match
            freeSlot: false,
            players: [],
          }
    );
  }

  /**
   * Remember when each polled player's status last changed: buildServers
   * tells a server's current players from those still showing its last match
   * by it
   * @param {Map<string, import('../shared/types.js').PlayerPresence>} presence
   * @param {number} now - Time of this poll
   * @private
   */
  _noteStatusChanges(presence, now) {
    const next = new Map();
    for (const [id, player] of presence) {
      const before = this._statusSince.get(id);
      const key = player.statusKey ?? "";
      next.set(id, before?.key === key ? before : { key, since: now });
    }
    this._statusSince = next;
  }

  /**
   * Players to join through, best server first. A finished match and the
   * user's own server have nothing to offer.
   * @param {string} map - Map code
   * @param {string|null} [serverId] - Only this server
   * @returns {string[]} - SteamID64s
   */
  getCandidateIds(map, serverId = null) {
    // A server the user picked is theirs to join, Prime only or not
    const servers = serverId
      ? this._currentServers().filter(
          (server) => server.map === map && server.serverId === serverId
        )
      : this.getServers(map);
    return servers
      .filter((server) => this._joinable(server))
      .flatMap((server) => server.players.map((player) => player.steamid));
  }

  /**
   * Players to join through on any of several maps, the best server of
   * them all first
   * @param {string[]} maps - Map codes
   * @returns {string[]} - SteamID64s
   */
  getCandidateIdsForMaps(maps) {
    return this._shownServers()
      .filter((server) => maps.includes(server.map) && this._joinable(server))
      .sort(compareServers)
      .flatMap((server) => server.players.map((player) => player.steamid));
  }

  /**
   * Read the friends lists of the user's friends, at the user's word. It
   * takes an API key: Steam lets a token read no one else's list.
   * @returns {boolean} - Whether a read started
   */
  readFof() {
    if (!this.deps?.getFofKey?.() || this._fofRunning) return false;
    this._crawlFof();
    return true;
  }

  /**
   * Read the friends lists of the pool players whose list was not read in
   * the last day, at the user's word. It takes an API key.
   * @returns {boolean} - Whether a read started
   */
  readPoolFriends() {
    if (!this.deps?.getFofKey?.() || this._poolFriendsRunning) return false;
    if (!this._poolPlayersToRead(Date.now()).length) return false;
    this._crawlPoolFriends();
    return true;
  }

  /**
   * Forget friends of friends, at the user's word. A read under way stops,
   * and they are read again only when the user asks.
   */
  clearFof() {
    this._fofGeneration++;
    this.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    this.status.fof = "idle";
    this._candidateOffset = 0;
    this._scheduleSave();
    this._notify();
  }

  /**
   * Counters for the status line and the sources
   * @returns {Object} - The status fields, plus poolSize, poolPrimeSize,
   *   poolFriendsSize, poolFriendsDue, fofSize, fofFetchedAt, fofLists,
   *   primeSize and hiddenServers
   */
  getStatus() {
    let poolPrimeSize = 0;
    for (const id of this.pool.keys()) if (this.prime.has(id)) poolPrimeSize++;
    return {
      ...this.status,
      poolSize: this.pool.size,
      poolPrimeSize,
      poolFriendsSize: this.poolFriends.ids.length,
      // Pool players whose friends list a read would take now
      poolFriendsDue: this._poolPlayersToRead(Date.now()).length,
      fofSize: this.fof.ids.length,
      fofFetchedAt: this.fof.fetchedAt,
      // The user's friends, whose lists a read of friends of friends takes
      fofLists: (this.deps?.getRealFriendIds?.() || []).length,
      primeSize: this.prime.size,
      // Known servers that Prime only leaves out
      hiddenServers:
        this._currentServers().length - this._shownServers().length,
    };
  }

  /**
   * Forget pool players, at the user's word: all of them, or only those who
   * never showed a sign of Prime. Players seen in this run's matches may
   * join it again. A read of pool players' friends under way stops.
   * @param {{keepPrime?: boolean}} [options]
   * @returns {number} - How many players were forgotten
   */
  clearPool({ keepPrime = false } = {}) {
    this._poolGeneration++;
    const before = this.pool.size;
    if (keepPrime) {
      for (const id of [...this.pool.keys()]) {
        if (!this.prime.has(id)) this.pool.delete(id);
      }
    } else {
      this.pool = new Map();
    }
    // A read mark goes with its player
    for (const id of Object.keys(this.poolFriends.crawled)) {
      if (!this.pool.has(id)) delete this.poolFriends.crawled[id];
    }
    this._checkedSeeds = new Set();
    this._candidateOffset = 0;
    this._scheduleSave();
    this._notify();
    return before - this.pool.size;
  }

  /**
   * Forget the friends of pool players, at the user's word, and when each
   * list was read, so that the next read takes every pool player's list
   * again. A read under way stops.
   */
  clearPoolFriends() {
    this._poolGeneration++;
    this.poolFriends = { ids: [], crawled: {} };
    this._candidateOffset = 0;
    this._scheduleSave();
    this._notify();
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
    this.prime = new Map();
    this.primeOnly = false;
    this.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    this.poolFriends = { ids: [], crawled: {} };
    this.friendLists = new Map();
    this._friendChecks = new Map();
    this._friendChecking = null;
    this.seeds = new Set();
    this.servers = [];
    this.status = this._idleStatus();
    this._loading = null;
    this._fofRunning = false;
    this._fofGeneration = 0;
    this._poolFriendsRunning = false;
    this._poolGeneration = 0;
    this._candidateOffset = 0;
    this._refreshAgain = false;
    this._checkedSeeds = new Set();
    this._checkingSeeds = false;
    this._checkSeedsAgain = false;
    this._statusSince = new Map();
    this._needs = new Set();
  }

  /**
   * The status before anything has run
   * @returns {Object}
   * @private
   */
  _idleStatus() {
    return {
      refreshing: false,
      lastRefreshAt: 0,
      polled: 0,
      // Each read of friends lists: "idle", "crawling" or "error"
      fof: "idle",
      poolFriends: "idle",
      // Lists a read under way has taken, of how many
      fofProgress: { done: 0, total: 0 },
      poolFriendsProgress: { done: 0, total: 0 },
    };
  }

  /**
   * One periodic step. Friends lists are not read here: only when the user
   * asks, since every list is a request on their key.
   * @private
   */
  _tick() {
    this.refresh();
  }

  /**
   * Everyone to ask about this round, up to the cap: friends, fresh seeds
   * and the pool (most recent first) every round, then in the room left a
   * different slice each round of the friends of pool players and friends
   * of friends
   * @param {string} userId - User's SteamID64, never polled here
   * @returns {Set<string>}
   * @private
   */
  _idsToPoll(userId) {
    const cap = MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH;
    const ids = new Set();
    const add = (id) => {
      const steamId = String(id);
      if (
        ids.size < cap &&
        steamId !== userId &&
        Validators.validateSteamId(steamId)
      ) {
        ids.add(steamId);
      }
    };

    (this.deps?.getFriendIds?.() || []).forEach(add);
    // Seeds go before the pool: a full pool would leave them no room
    this.seeds.forEach(add);
    [...this.pool.entries()]
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .forEach(([id]) => add(id));

    const candidates = [...new Set([...this.poolFriends.ids, ...this.fof.ids])];
    const room = Math.min(cap - ids.size, candidates.length);
    if (room > 0) {
      for (let i = 0; i < room; i++) {
        add(candidates[(this._candidateOffset + i) % candidates.length]);
      }
      this._candidateOffset =
        (this._candidateOffset + room) % candidates.length;
    }
    return ids;
  }

  /**
   * Read the friends lists of the user's friends. One pass costs a request
   * per friend, so it runs only when the user asks.
   * @private
   */
  async _crawlFof() {
    const key = this.deps.getFofKey();
    const userId = this.deps.getUserId?.();
    const friendIds = (this.deps.getRealFriendIds?.() || []).map(String);
    const own = new Set([userId, ...friendIds]);
    const found = new Set();
    const generation = this._fofGeneration;
    let listsRead = 0;

    this._fofRunning = true;
    this.status.fof = "crawling";
    this.status.fofProgress = { done: 0, total: friendIds.length };
    this._notify();
    try {
      for (const friendId of friendIds) {
        if (found.size >= MAP_FINDER_CONFIG.FOF_MAX_IDS) break;
        const ids = await SteamAPI.getFriendIdsOf(friendId, key);
        // Cleared meanwhile: what this read found is no longer wanted
        if (this._fofGeneration !== generation) return;
        if (ids.length) listsRead++;
        for (const id of ids) {
          if (!own.has(id) && found.size < MAP_FINDER_CONFIG.FOF_MAX_IDS) {
            found.add(id);
          }
        }
        this.status.fofProgress = {
          done: this.status.fofProgress.done + 1,
          total: friendIds.length,
        };
        this._notify();
        await sleep(MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS);
      }

      // Not one readable list: most likely a wrong key. What was read
      // before stays.
      if (friendIds.length && listsRead === 0) {
        this.status.fof = "error";
        return;
      }
      this.fof = {
        ids: [...found],
        fetchedAt: Date.now(),
        friendsCount: friendIds.length,
      };
      this._scheduleSave();
    } catch (error) {
      logger.error("MapFinder", "Friends of friends failed", {
        error: error.message,
      });
      this.status.fof = "error";
    } finally {
      this._fofRunning = false;
      if (this.status.fof === "crawling") this.status.fof = "idle";
      this.status.fofProgress = { done: 0, total: 0 };
      this._notify();
    }
  }

  /**
   * Pool players whose friends list has not been read for a day, the most
   * recently seen first
   * @param {number} now - Current time
   * @returns {string[]}
   * @private
   */
  _poolPlayersToRead(now) {
    return [...this.pool.entries()]
      .filter(
        ([id]) =>
          now - (this.poolFriends.crawled[id] || 0) >=
          MAP_FINDER_CONFIG.FOF_REFRESH_MS
      )
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .map(([id]) => id);
  }

  /**
   * Read the friends lists of pool players, when the user asks. Their
   * friends sat on official casual servers about three times as often as
   * friends of the user's friends (0.69% against 0.21%, measured
   * 2026-10-25). They are polled a slice each round for the map list, and
   * do not join the pool, which keeps to the user's own matches. A list
   * read in the last day is not read again.
   * @private
   */
  async _crawlPoolFriends() {
    const key = this.deps.getFofKey();
    const userId = String(this.deps.getUserId?.() || "");
    const generation = this._poolGeneration;
    const players = this._poolPlayersToRead(Date.now());

    this._poolFriendsRunning = true;
    this.status.poolFriends = "crawling";
    this.status.poolFriendsProgress = { done: 0, total: players.length };
    this._notify();
    try {
      for (const playerId of players) {
        if (this._poolGeneration !== generation) return;
        const ids = await SteamAPI.getFriendIdsOf(playerId, key);
        if (this._poolGeneration !== generation) return;
        this.poolFriends.crawled[playerId] = Date.now();
        this._addPoolFriends(ids, userId);
        this.status.poolFriendsProgress = {
          done: this.status.poolFriendsProgress.done + 1,
          total: players.length,
        };
        this._notify();
        await sleep(MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS);
      }
    } catch (error) {
      logger.error("MapFinder", "Friends of pool players failed", {
        error: error.message,
      });
    } finally {
      // Whatever was read before a stop or a failure is kept
      this._scheduleSave();
      this._poolFriendsRunning = false;
      this.status.poolFriends = "idle";
      this.status.poolFriendsProgress = { done: 0, total: 0 };
      this._notify();
    }
  }

  /**
   * Add new friends of a pool player to the list. Over the limit the oldest
   * go: the latest lists belong to the players seen most recently.
   * @param {string[]} ids - The pool player's friends
   * @param {string} userId - The user, never added
   * @private
   */
  _addPoolFriends(ids, userId) {
    const list = this.poolFriends.ids;
    const have = new Set(list);
    for (const id of ids) {
      if (id === userId || this.pool.has(id) || have.has(id)) continue;
      list.push(id);
      have.add(id);
    }
    const extra = list.length - MAP_FINDER_CONFIG.POOL_FRIENDS_MAX_IDS;
    if (extra > 0) list.splice(0, extra);
  }

  /**
   * Keep each player's friend check while they stay on the server it was
   * made on. Steam not answering about a player this round is no sign they
   * left; a player no longer polled has.
   * @param {Map<string, import('../shared/types.js').PlayerPresence>} presence
   * @param {Set<string>} polled - Everyone this refresh asked about
   * @private
   */
  _keepFriendChecks(presence, polled) {
    for (const [id, check] of this._friendChecks) {
      const player = presence.get(id);
      const stays = player
        ? player.serverId === check.serverId
        : polled.has(id);
      if (!stays) this._friendChecks.delete(id);
    }
  }

  /**
   * Check the friends of the players with a sign of Prime on official
   * casual servers: whether any of them sits on the same server, and with
   * or without a sign of Prime. Only with a key, the one thing that reads
   * other people's friends lists, and at most FRIEND_CHECKS_PER_REFRESH
   * checks that ask Steam anything.
   * @private
   */
  async _checkFriends() {
    const key = this.deps?.getFofKey?.();
    const auth = this.deps?.getAuth?.();
    if (!key || !auth) return;

    const settled = new Set();
    const due = this._friendChecksDue(settled);
    let asked = 0;
    try {
      for (const { steamid, serverId } of due) {
        if (asked >= FRIEND_CHECKS_PER_REFRESH) break;
        // Another player there has settled the server meanwhile
        if (settled.has(serverId)) continue;
        if (await this._checkFriendsOf(steamid, serverId, key, auth)) asked++;
        if (this._settles(this._friendChecks.get(steamid), serverId)) {
          settled.add(serverId);
        }
      }
    } catch (error) {
      logger.warn("MapFinder", "Checking friends failed", {
        error: error.message,
      });
    }
    if (due.length) {
      logger.debug(
        "MapFinder",
        "Checked friends of players with a sign of Prime",
        {
          due: due.length,
          asked,
        }
      );
      this._notify();
    }
  }

  /**
   * Players with a sign of Prime whose friends were not checked on the
   * server they are on, the servers best to join first. A server where one
   * of them is alone or among Prime friends needs no more checks: no other
   * answer would change its mark.
   * @param {Set<string>} settled - Filled with the servers that need none
   * @returns {Array<{steamid: string, serverId: string}>}
   * @private
   */
  _friendChecksDue(settled) {
    const servers = [...this.servers].sort(
      (a, b) =>
        Number(this._joinable(b)) - Number(this._joinable(a)) ||
        compareServers(a, b)
    );
    const due = [];
    for (const { serverId, players } of servers) {
      const primes = players.filter((player) => player.prime);
      if (
        primes.some((player) =>
          this._settles(this._friendChecks.get(player.steamid), serverId)
        )
      ) {
        settled.add(serverId);
        continue;
      }
      for (const { steamid } of primes) {
        if (this._friendChecks.get(steamid)?.serverId !== serverId) {
          due.push({ steamid, serverId });
        }
      }
    }
    return due;
  }

  /**
   * Whether a friend check settles its server's mark: the player is alone
   * there or among friends with a sign of Prime
   * @param {{serverId: string, verdict: string}|undefined} check
   * @param {string} serverId
   * @returns {boolean}
   * @private
   */
  _settles(check, serverId) {
    return (
      check?.serverId === serverId &&
      (check.verdict === PRIME_CHECK.ALONE ||
        check.verdict === PRIME_CHECK.PRIME_FRIENDS)
    );
  }

  /**
   * Check one player's friends on the server they are on, and remember the
   * answer for as long as they stay there
   * @param {string} steamid - Player with a sign of Prime
   * @param {string} serverId - Their server
   * @param {string} key - API key, for the friends list
   * @param {string} auth - Main token or key, for where the friends are, as
   *   every other presence request
   * @returns {Promise<boolean>} - Whether it asked Steam anything
   * @private
   */
  async _checkFriendsOf(steamid, serverId, key, auth) {
    let asked = false;
    let list = this.friendLists.get(steamid);
    if (!list || Date.now() - list.at >= MAP_FINDER_CONFIG.FOF_REFRESH_MS) {
      list = this._keepFriendList(
        steamid,
        await SteamAPI.getFriendIdsOf(steamid, key)
      );
      asked = true;
    }
    // Steam gives no friends for a closed list, nor for a read that failed
    if (!list.ids.length) {
      this._friendChecks.set(steamid, {
        serverId,
        verdict: PRIME_CHECK.UNKNOWN,
        reason: PRIME_CHECK_REASONS.CLOSED,
      });
      return asked;
    }

    // A friend who hides their game details shows no server at all, so
    // "nobody there" can only mean nobody visible
    const presence = await SteamAPI.getPresence(list.ids, auth);
    const there = [...presence.values()].filter(
      (friend) => friend.serverId === serverId
    );
    let verdict = null;
    if (there.some((friend) => !this.isPrimePlayer(friend))) {
      verdict = PRIME_CHECK.FRIEND;
    } else if (presence.size >= list.ids.length) {
      verdict = there.length ? PRIME_CHECK.PRIME_FRIENDS : PRIME_CHECK.ALONE;
    }
    // Otherwise a friend Steam did not answer about may be the one sitting
    // there: the player is checked again in a later refresh
    if (verdict) {
      this._friendChecks.set(steamid, { serverId, verdict, reason: null });
    }
    return true;
  }

  /**
   * Keep a friends list just read, as the newest
   * @param {string} steamid - Whose list
   * @param {string[]} ids - Their friends; none for a closed list
   * @returns {{at: number, ids: string[]}}
   * @private
   */
  _keepFriendList(steamid, ids) {
    const list = {
      at: Date.now(),
      ids: [...new Set(ids.map(String))].filter((id) =>
        Validators.validateSteamId(id)
      ),
    };
    // A list read again moves among the newest
    this.friendLists.delete(steamid);
    this.friendLists.set(steamid, list);
    this._pruneFriendLists(list.at);
    this._scheduleSave();
    return list;
  }

  /**
   * Drop the friends lists read more than a day ago, which a check would
   * read again anyway, and keep the rest to FRIEND_LISTS_MAX_IDS ids, the
   * lists read longest ago going first
   * @param {number} now - Current time
   * @private
   */
  _pruneFriendLists(now) {
    let total = 0;
    for (const list of this.friendLists.values()) total += list.ids.length;
    // The map holds the lists in the order they were read
    for (const [id, list] of this.friendLists) {
      const stale = now - list.at >= MAP_FINDER_CONFIG.FOF_REFRESH_MS;
      if (!stale && total <= FRIEND_LISTS_MAX_IDS) break;
      this.friendLists.delete(id);
      total -= list.ids.length;
    }
  }

  /**
   * Drop players not seen on an official server for too long, and keep the
   * pool, the players with a sign of Prime and the friends lists of the
   * friend check to their size limits
   * @param {number} now - Current time
   * @private
   */
  _prunePool(now) {
    if (this.prime.size > MAP_FINDER_CONFIG.PRIME_MAX_IDS) {
      this.prime = new Map(
        [...this.prime.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAP_FINDER_CONFIG.PRIME_MAX_IDS)
      );
    }
    for (const [id, entry] of this.pool) {
      if (now - entry.lastSeen > MAP_FINDER_CONFIG.POOL_TTL_MS)
        this.pool.delete(id);
    }
    if (this.pool.size > MAP_FINDER_CONFIG.POOL_MAX) {
      const keep = [...this.pool.entries()]
        .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
        .slice(0, MAP_FINDER_CONFIG.POOL_MAX);
      this.pool = new Map(keep);
    }
    for (const id of Object.keys(this.poolFriends.crawled)) {
      if (!this.pool.has(id)) delete this.poolFriends.crawled[id];
    }
    this._pruneFriendLists(now);
  }

  /**
   * Load the pool, its players' friends, friends of friends and the friends
   * lists of the friend check kept from earlier runs
   * @private
   */
  async _load() {
    // One read, shared: whoever asks while it is under way waits for it
    // rather than going on with an empty pool
    if (!this._loading) this._loading = this._readStore();
    await this._loading;
  }

  /**
   * Read the store once
   * @private
   */
  async _readStore() {
    const data = await window.electronAPI?.mapFinder?.load?.();
    for (const [id, entry] of Object.entries(data?.pool || {})) {
      if (
        !Validators.validateSteamId(id) ||
        !Number.isFinite(entry?.lastSeen)
      ) {
        continue;
      }
      this.pool.set(id, {
        lastSeen: entry.lastSeen,
        map: String(entry.map || ""),
      });
    }
    for (const [id, lastSeen] of Object.entries(data?.prime || {})) {
      if (Validators.validateSteamId(id) && Number.isFinite(lastSeen)) {
        this.prime.set(id, Math.max(lastSeen, this.prime.get(id) || 0));
      }
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
    }
    if (Array.isArray(data?.poolFriends?.ids)) {
      const crawled = {};
      for (const [id, at] of Object.entries(data.poolFriends.crawled || {})) {
        if (Validators.validateSteamId(id) && Number.isFinite(at))
          crawled[id] = at;
      }
      this.poolFriends = {
        ids: data.poolFriends.ids
          .map(String)
          .filter((id) => Validators.validateSteamId(id))
          .slice(-MAP_FINDER_CONFIG.POOL_FRIENDS_MAX_IDS),
        crawled,
      };
    }
    // A list read before the store came in is newer than its copy there
    const lists = [...this.friendLists];
    for (const [id, list] of Object.entries(data?.friendLists || {})) {
      if (
        !Validators.validateSteamId(id) ||
        !Number.isFinite(list?.at) ||
        !Array.isArray(list.ids) ||
        this.friendLists.has(id)
      ) {
        continue;
      }
      const ids = list.ids
        .map(String)
        .filter((friend) => Validators.validateSteamId(friend));
      lists.push([id, { at: list.at, ids }]);
    }
    this.friendLists = new Map(lists.sort((a, b) => a[1].at - b[1].at));
    this._prunePool(Date.now());
    // The view shows the counts read, not those of an empty finder, even
    // when no refresh follows: without a working token none does
    this._notify();
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
        poolFriends: this.poolFriends,
        fof: this.fof,
        prime: Object.fromEntries(this.prime),
        friendLists: Object.fromEntries(this.friendLists),
      });
    }, MAP_FINDER_CONFIG.SAVE_DEBOUNCE_MS);
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
