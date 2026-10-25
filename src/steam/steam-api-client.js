// Steam modules
import SteamAPIHttpClient from "./http-client.js";
import SteamAPIConfig from "./api-config.js";
import SteamAPILogger from "./api-logger.js";
import SteamAPIResponseProcessor from "./steam-api-response-processor.js";
import SteamAPIUtils from "./steam-api-utils.js";
import { API_CONFIG } from "../shared/constants.js";

// UI and utilities
import Validators from "../utils/validators.js";

/**
 * Steam API client with proper separation of concerns
 * Responsible only for orchestrating API calls using specialized components
 */
class SteamAPIClient {
  // ===== BATCHING/DEDUP/CACHE STATE =====
  static _BATCH_WINDOW_MS = 10; // micro-batching window within a tick
  static _SHORT_TTL_MS = Math.max(1, Math.floor((API_CONFIG?.JOIN_LOOP_INTERVAL_MS || 200) / 2));

  /**
   * Max steamids per GetPlayerLinkDetails request.
   * Each id costs ~35 bytes once `steamids[N]` is URL-encoded, so 100 keeps the
   * query string near 3.5 KB - well inside the 8 KB request-line limit a full
   * friends list would otherwise blow past. Same chunk size GetPlayerSummaries
   * already uses.
   */
  static _MAX_IDS_PER_REQUEST = 100;

  /**
   * Batch coordinators keyed by auth - ids authenticated with different
   * credentials must never be merged into a single request.
   * @type {Map<string, { ids: Set<string>, resolvers: Array<{ids: string[], resolve: Function}>, timer: any }>}
   */
  static _batchers = new Map();

  /**
   * Every batch currently awaiting its response. Each batch removes only its
   * own entry, so overlapping batches cannot clear the coverage of another.
   * @type {Set<{ promise: Promise<Map<string, Object|null>>, ids: Set<string> }>}
   */
  static _inFlight = new Set();

  /**
   * Short-lived cache steamid -> { raw, ts }. `raw` is null when Steam returned
   * no account for that id - a real answer, and worth caching.
   * @type {Map<string, { raw: Object|null, ts: number }>}
   */
  static _cache = new Map();

  /**
   * Avatar data by steamid, reused across refreshes so GetPlayerSummaries runs
   * only for players whose avatar is not known yet.
   * @type {Object<string, Object>}
   */
  static _avatarCache = {};

  /**
   * Read the cached entry for steamid, or null when absent or stale.
   * Returns the entry rather than entry.raw so a cached negative result stays
   * distinguishable from a cache miss.
   * @param {string} steamid
   * @returns {{ raw: Object|null, ts: number }|null}
   */
  static _getCachedEntry(steamid) {
    const key = String(steamid);
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts >= this._SHORT_TTL_MS) {
      this._cache.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * Write cached raw response for steamid
   */
  static _setCachedRaw(steamid, raw) {
    this._cache.set(String(steamid), { raw, ts: Date.now() });
  }

  /**
   * Normalize raw GetPlayerLinkDetails response to map steamid -> raw-like object
   * Each value keeps the same shape { response: { accounts: [account] } } expected by processors
   */
  static _splitRawBySteamId(rawData) {
    const result = new Map();
    const accounts = rawData?.response?.accounts || [];
    for (const acc of accounts) {
      const sid = acc?.public_data?.steamid;
      if (!sid) continue;
      result.set(String(sid), { response: { accounts: [acc] } });
    }
    return result;
  }

  /**
   * Schedule a batched GetPlayerLinkDetails for a set of steamids under one auth
   * Implements micro-batching, in-flight dedup for overlapping ids, and short TTL cache
   * @param {string[]|string} steamids
   * @param {string} auth
   * @param {Object} context
   * @returns {Promise<Map<string, Object|null>>} map steamid -> raw-like object, or null when
   *   Steam returned no account for it. Ids whose request failed are absent, so "could not ask"
   *   stays distinguishable from "no account".
   */
  static async _getPlayerLinkDetailsBatched(steamids, auth, context = {}) {
    // Normalize input
    const ids = (Array.isArray(steamids) ? steamids : [steamids])
      .map(String)
      .filter((v) => v && v.length > 0);
    if (!ids.length) return new Map();

    // Serve from the short-lived cache first. An entry whose raw is null is a
    // real answer, so it must not be re-requested as if it were a miss.
    const result = new Map();
    let missingIds = [];
    for (const id of ids) {
      const entry = this._getCachedEntry(id);
      if (entry) {
        result.set(id, entry.raw);
      } else {
        missingIds.push(id);
      }
    }
    if (!missingIds.length) return result;

    // Reuse any in-flight batch that already covers some of the missing ids
    const pending = [];
    for (const batch of this._inFlight) {
      if (!missingIds.some((id) => batch.ids.has(id))) continue;
      pending.push(batch.promise);
      missingIds = missingIds.filter((id) => !batch.ids.has(id));
      if (!missingIds.length) break;
    }

    // Whatever no batch covers gets a batch of its own
    if (missingIds.length) {
      pending.push(this._scheduleBatchForIds(missingIds, auth, context));
    }

    const maps = await Promise.all(pending);
    for (const id of ids) {
      if (result.has(id)) continue;
      // Only an actual answer earns an entry; a failed id stays absent
      let answered = false;
      let value = null;
      for (const map of maps) {
        if (!map.has(id)) continue;
        answered = true;
        value = map.get(id);
        if (value) break;
      }
      if (answered) result.set(id, value);
    }
    return result;
  }

  /**
   * Internal: schedule a batch for given ids under one auth
   * @param {string[]} ids
   * @param {string} auth
   * @param {Object} context
   * @returns {Promise<Map<string, Object|null>>} answered ids only - failed ids are absent
   */
  static _scheduleBatchForIds(ids, auth, context = {}) {
    const key = String(auth ?? "");
    let batcher = this._batchers.get(key);
    if (!batcher) {
      batcher = { ids: new Set(), resolvers: [], timer: null };
      this._batchers.set(key, batcher);
    }

    ids.forEach((id) => batcher.ids.add(String(id)));

    return new Promise((resolve) => {
      batcher.resolvers.push({ ids: ids.map(String), resolve });

      if (batcher.timer) return;

      batcher.timer = setTimeout(async () => {
        const requestIds = Array.from(batcher.ids);
        const resolvers = batcher.resolvers.slice();
        // Drop the coordinator so later callers start a fresh one
        this._batchers.delete(key);

        let settle;
        const batch = {
          promise: new Promise((res) => (settle = res)),
          ids: new Set(requestIds),
        };
        this._inFlight.add(batch);

        let mapById;
        try {
          mapById = await this._fetchLinkDetailsInChunks(
            requestIds,
            auth,
            context
          );
        } finally {
          // Remove only this batch, never the entry belonging to another
          this._inFlight.delete(batch);
        }

        // Cache answers, negatives included, with a short TTL. A failed id is
        // left uncached so the next call asks Steam again.
        for (const id of requestIds) {
          if (mapById.has(id)) this._setCachedRaw(id, mapById.get(id));
        }

        // Resolve in-flight promise for any waiters
        settle(mapById);

        // Fan-out results to individual resolvers, keeping failed ids absent
        for (const { ids: reqIds, resolve } of resolvers) {
          const partial = new Map();
          for (const id of reqIds) {
            if (mapById.has(id)) partial.set(id, mapById.get(id));
          }
          resolve(partial);
        }
      }, this._BATCH_WINDOW_MS);
    });
  }

  /**
   * Fetch link details in chunks small enough to keep the query string inside
   * normal request-line limits, merging the results.
   * Never rejects. Every id of an answered chunk gets an entry: its raw-like
   * object, or null when Steam returned no account for it. Ids belonging to a
   * failed chunk are absent from the returned map, so one bad chunk cannot void
   * what the other chunks resolved and a failure never reads as "no account".
   * @param {string[]} requestIds
   * @param {string} auth
   * @param {Object} context
   * @returns {Promise<Map<string, Object|null>>}
   */
  static async _fetchLinkDetailsInChunks(requestIds, auth, context = {}) {
    const merged = new Map();
    const size = this._MAX_IDS_PER_REQUEST;
    const totalChunks = Math.ceil(requestIds.length / size);

    for (let i = 0; i < requestIds.length; i += size) {
      const chunk = requestIds.slice(i, i + size);
      const chunkIndex = Math.floor(i / size) + 1;

      try {
        const rawData = await this._getPlayerLinkDetails(chunk, auth, {
          ...context,
          batched: true,
          batchSize: chunk.length,
          chunkIndex,
          totalChunks,
        });
        // allowFailure turns an HTTP error (429, 5xx) into null: unanswered
        if (!rawData) continue;

        const byId = this._splitRawBySteamId(rawData);
        for (const id of chunk) {
          merged.set(id, byId.get(id) ?? null);
        }
      } catch (error) {
        SteamAPILogger.logError("GetPlayerLinkDetails", error, {
          chunkIndex,
          totalChunks,
          chunkSize: chunk.length,
        });
      }
    }

    return merged;
  }

  /**
   * Make a Steam API request with proper separation of concerns
   * @param {string} method - API method name
   * @param {Object} params - Request parameters
   * @param {string} auth - API key or token
   * @param {Object} options - Request options
   * @returns {Promise<Object|null>} - Parsed response data
   * @private
   */
  static async _makeRequest(method, params, auth, options = {}) {
    const { allowFailure = false, context = {}, signal } = options;

    try {
      // Build URL using config manager
      const url = SteamAPIConfig.buildUrl(method, params, auth);

      // Log request
      SteamAPILogger.logRequest(method, url, context);
      // Make HTTP request
      const response = await SteamAPIHttpClient.makeRequest(url, { signal });

      // Handle HTTP errors
      const errorHandlers = await SteamAPIUtils.getMethodErrorHandlers(method);
      const isOk = await SteamAPIUtils.handleHttpResponse(response, {
        method,
        allowFailure,
        errorHandlers,
      });

      if (!isOk) {
        SteamAPILogger.logHttpError(
          method,
          response.status,
          response.statusText,
          context
        );
        return null;
      }

      // Parse response
      const data = await SteamAPIHttpClient.parseJsonResponse(response);

      // Log response
      SteamAPILogger.logResponse(method, data, url);

      return data;
    } catch (error) {
      SteamAPILogger.logError(method, error, context);
      throw error;
    }
  }

  /**
   * Get user's friends list
   * @param {string} steam_id - Steam ID of the user
   * @param {string} auth - API key or token
   * @returns {Promise<string[]>} - Array of friend Steam IDs
   */
  static async getFriendsList(steam_id, auth) {
    const params = { steamid: steam_id };
    const data = await this._makeRequest("GetFriendsList", params, auth, {
      context: { steam_id },
    });

    const isToken = Validators.isWebApiToken(auth);
    return SteamAPIResponseProcessor.processFriendsListResponse(data, isToken);
  }

  /**
   * Get player summaries
   * @param {string[]|string} steamids - Steam IDs to fetch
   * @param {string} auth - API key or token
   * @returns {Promise<Object>} - Map of Steam ID to player data
   */
  static async getPlayerSummaries(steamids, auth) {
    // Normalize input
    if (!Array.isArray(steamids)) {
      if (typeof steamids === "string" && steamids.length > 0) {
        steamids = [steamids];
      } else {
        return {};
      }
    }

    if (!steamids.length) return {};

    const result = {};

    try {
      // Process in chunks of 100
      for (let i = 0; i < steamids.length; i += 100) {
        const chunk = steamids.slice(i, i + 100).map(String);
        const chunkIndex = Math.floor(i / 100) + 1;
        const totalChunks = Math.ceil(steamids.length / 100);

        const params = { steamids: chunk.join(",") };
        const data = await this._makeRequest(
          "GetPlayerSummaries",
          params,
          auth,
          {
            allowFailure: true,
            context: { chunkIndex, totalChunks, chunkSize: chunk.length },
          }
        );

        if (!data) {
          continue;
        }

        const players =
          SteamAPIResponseProcessor.processPlayerSummariesResponse(
            data,
            chunkIndex
          );

        for (const player of players) {
          result[player.steamid] = player;
        }
      }
    } catch (error) {
      SteamAPILogger.logError("GetPlayerSummaries", error, {
        steamidsCount: steamids.length,
      });
      throw error;
    }

    return result;
  }

  /**
   * Get player link details (private method)
   * @param {string|string[]} steamids - Steam ID(s) to get details for
   * @param {string} auth - API key or token
   * @param {Object} context - Additional context for logging
   * @returns {Promise<Object|null>} - Player link details response
   * @private
   */
  static async _getPlayerLinkDetails(steamids, auth, context = {}) {
    // Build special params for this API call
    const params = {};

    if (Array.isArray(steamids)) {
      steamids.forEach((sid, idx) => {
        params[`steamids[${idx}]`] = sid;
      });
    } else {
      params["steamids[0]"] = steamids;
    }

    return await this._makeRequest("GetPlayerLinkDetails", params, auth, {
      allowFailure: true,
      context,
    });
  }

  /**
   * Check if a player is currently playing CS2
   * @param {string} steam_id - Steam ID to check
   * @param {string} auth - API key or token
   * @param {boolean} requireLobby - Whether to require lobby state (default: false)
   * @returns {Promise<boolean|null>} - True if player is playing CS2 (and in lobby if required),
   *   null when Steam could not be asked
   */
  static async isPlayerInCS2(steam_id, auth, requireLobby = false) {
    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        steam_id,
        auth,
        { steam_id, checkingCS2: true, requireLobby }
      );
      const id = String(steam_id);
      // A failed request is unknown, not "not playing" - nothing may be
      // cancelled on the strength of it
      if (!mapById.has(id)) return null;
      return SteamAPIResponseProcessor.processPlayerCS2StatusResponse(
        mapById.get(id),
        steam_id,
        requireLobby
      );
    } catch (error) {
      SteamAPILogger.logError("isPlayerInCS2", error, { steam_id });
      return null;
    }
  }

  /**
   * Get the join-relevant state of the user and the friend.
   * Both ids share one GetPlayerLinkDetails request, so a join loop iteration
   * costs a single call however many decisions it makes from the result.
   * @param {string} user_steam_id - User's Steam ID
   * @param {string} friend_id - Friend's Steam ID
   * @param {string} auth - API key or token
   * @returns {Promise<import('../shared/types.js').JoinSnapshot>} - Each side is null when Steam could not be asked
   */
  static async getJoinSnapshot(user_steam_id, friend_id, auth) {
    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        [user_steam_id, friend_id],
        auth,
        { user_steam_id, friend_id, joinSnapshot: true }
      );
      const toJoinInfo = (steam_id) => {
        const id = String(steam_id);
        if (!mapById.has(id)) return null;
        return SteamAPIResponseProcessor.processJoinInfoResponse(
          mapById.get(id)
        );
      };
      return {
        user: toJoinInfo(user_steam_id),
        friend: toJoinInfo(friend_id),
      };
    } catch (error) {
      SteamAPILogger.logError("getJoinSnapshot", error, {
        user_steam_id,
        friend_id,
      });
      return { user: null, friend: null };
    }
  }

  /**
   * Get where many players are playing, 100 per request
   * @param {string[]} steamids - Steam IDs to ask about
   * @param {string} auth - API key or token
   * @returns {Promise<Map<string, import('../shared/types.js').PlayerPresence>>} - Answered ids only;
   *   an id whose request failed is absent
   */
  static async getPresence(steamids, auth) {
    const result = new Map();
    if (!Array.isArray(steamids) || !steamids.length) return result;

    try {
      const mapById = await this._getPlayerLinkDetailsBatched(steamids, auth, {
        presence: true,
        count: steamids.length,
      });
      for (const [id, raw] of mapById) {
        const presence = SteamAPIResponseProcessor.processPresenceResponse(raw);
        result.set(id, { ...presence, steamid: presence.steamid || id });
      }
    } catch (error) {
      SteamAPILogger.logError("getPresence", error, {
        count: steamids.length,
      });
    }
    return result;
  }

  /**
   * Get someone else's friends list. Steam answers this for an API key only.
   * @param {string} steamid - Whose friends to list
   * @param {string} key - Steam Web API key
   * @returns {Promise<string[]>} - Friend ids; empty for a private list or a failed request
   */
  static async getFriendIdsOf(steamid, key) {
    try {
      const data = await this._makeRequest(
        "GetFriendListOf",
        { steamid },
        key,
        { allowFailure: true, context: { steamid } }
      );
      return (data?.friendslist?.friends || [])
        .filter((friend) => friend.relationship === "friend")
        .map((friend) => String(friend.steamid));
    } catch (error) {
      SteamAPILogger.logError("getFriendIdsOf", error, { steamid });
      return [];
    }
  }

  /**
   * Get friends statuses with avatars
   * @param {string[]} friend_ids - Array of friend Steam IDs
   * @param {string} auth - API key or token
   * @param {Object} avatarsCache - Cache of avatar data
   * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friend objects
   */
  static async getFriendsStatuses(friend_ids, auth, avatarsCache = {}) {
    if (!friend_ids.length) {
      return [];
    }

    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        friend_ids,
        auth,
        { friendsCount: friend_ids.length }
      );
      // Rebuild rawData with only requested ids in stable order; an id Steam
      // could not be asked about is absent and simply not listed
      const accounts = [];
      for (const id of friend_ids.map(String)) {
        const raw = mapById.get(id);
        const acc = raw?.response?.accounts?.[0];
        if (acc) accounts.push(acc);
      }
      const data = { response: { accounts } };

      // Reuse avatars fetched on earlier refreshes; anything the caller
      // supplies explicitly wins over the module cache.
      const avatars = { ...this._avatarCache, ...avatarsCache };

      // Create callback for fetching additional avatars
      const getPlayerSummariesCallback = async (steamids) => {
        const fetched = await this.getPlayerSummaries(steamids, auth);
        Object.assign(this._avatarCache, fetched);
        return fetched;
      };

      return await SteamAPIResponseProcessor.processFriendsStatusesResponse(
        data,
        avatars,
        getPlayerSummariesCallback
      );
    } catch (error) {
      SteamAPILogger.logError("getFriendsStatuses", error, {
        friendsCount: friend_ids.length,
      });
      throw error;
    }
  }

  /**
   * Resolve vanity URL to SteamID64
   * @param {string} vanityUrl - Vanity URL to resolve
   * @param {string} auth - API key or token
   * @returns {Promise<string|null>} - Steam ID or null
   */
  static async resolveVanityUrl(vanityUrl, auth) {
    try {
      const params = { vanityurl: vanityUrl };
      const data = await this._makeRequest("ResolveVanityURL", params, auth, {
        allowFailure: true,
        context: { vanityUrl },
      });

      if (!data) return null;

      return SteamAPIResponseProcessor.processVanityUrlResponse(data);
    } catch (error) {
      SteamAPILogger.logError("resolveVanityUrl", error, { vanityUrl });
      return null;
    }
  }
}

export default SteamAPIClient;
