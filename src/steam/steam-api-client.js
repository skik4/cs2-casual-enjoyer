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
  /** @type {Map<string, { ids: Set<string>, resolvers: Array<{ids: string[], resolve: Function, reject: Function}>, timer: any }>} */
  static _batchers = new Map();

  /** @type {Map<string, { promise: Promise<Map<string, Object|null>> , ids: Set<string> }>} */
  static _inFlight = new Map();

  /** @type {Map<string, Map<string, { raw: Object|null, ts: number }>>} */
  static _cache = new Map();

  static _BATCH_WINDOW_MS = 10; // micro-batching window within a tick
  static _SHORT_TTL_MS = Math.max(1, Math.floor((API_CONFIG?.JOIN_LOOP_INTERVAL_MS || 200) / 2));

	/**
	 * Get global cache map
	 * @returns {Map<string, {raw: Object|null, ts: number}>}
	 */
	static _getGlobalCache() {
		const key = "__global__";
    if (!this._cache.has(key)) {
      this._cache.set(key, new Map());
		}
    return this._cache.get(key);
	}

	/**
	 * Read cached raw response for steamid (short TTL)
	 */
	static _getCachedRaw(steamid) {
		const cache = this._getGlobalCache();
		const entry = cache.get(String(steamid));
		if (!entry) return null;
		const isFresh = Date.now() - entry.ts < this._SHORT_TTL_MS;
		return isFresh ? entry.raw : null;
	}

	/**
	 * Write cached raw response for steamid
	 */
	static _setCachedRaw(steamid, raw) {
		const cache = this._getGlobalCache();
		cache.set(String(steamid), { raw, ts: Date.now() });
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
   * @param {string[]} steamids
   * @param {string} auth
   * @param {Object} context
   * @returns {Promise<Map<string, Object|null>>} map steamid -> raw-like object (or null if not found)
   */
  static async _getPlayerLinkDetailsBatched(steamids, auth, context = {}) {
    // Normalize input
    const ids = (Array.isArray(steamids) ? steamids : [steamids])
      .map(String)
      .filter((v) => v && v.length > 0);
    if (!ids.length) return new Map();

    // First, serve from short-lived cache where possible
    const cachedMap = new Map();
    const missingIds = [];
    for (const id of ids) {
      const cached = this._getCachedRaw(id);
      if (cached) {
        cachedMap.set(id, cached);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length === 0) {
      return cachedMap;
    }

    // Check if there is an in-flight batch that already includes some/all of the missingIds
    const inFlight = this._inFlight.get("__global__");
    if (inFlight && inFlight.ids) {
      const inFlightIds = inFlight.ids;
      const covered = missingIds.filter((id) => inFlightIds.has(id));
      const notCovered = missingIds.filter((id) => !inFlightIds.has(id));

      if (covered.length && notCovered.length === 0) {
        // Entire request is covered by existing in-flight batch
        const mapFromInFlight = await inFlight.promise;
        const res = new Map(cachedMap);
        for (const id of ids) {
          if (!res.has(id)) res.set(id, mapFromInFlight.get(id) || null);
        }
        return res;
      }

      if (covered.length && notCovered.length) {
        // Partially covered: wait for in-flight for covered, schedule batch for notCovered
        const [fromInFlight, fromNewBatch] = await Promise.all([
          inFlight.promise,
          this._scheduleBatchForIds(notCovered, auth, context),
        ]);
        const res = new Map(cachedMap);
        for (const id of ids) {
          const v = (fromNewBatch.get(id) || fromInFlight.get(id)) ?? null;
          if (!res.has(id)) res.set(id, v);
        }
        return res;
      }
    }

    // No in-flight coverage: schedule a new batch for missing ids
    const fromBatch = await this._scheduleBatchForIds(missingIds, auth, context);
    const res = new Map(cachedMap);
    for (const id of ids) {
      if (!res.has(id)) res.set(id, fromBatch.get(id) || null);
    }
    return res;
  }

  /**
   * Internal: schedule a batch for given ids
   * @param {string[]} ids
   * @param {string} auth
   * @param {Object} context
   * @returns {Promise<Map<string, Object|null>>}
   */
  static _scheduleBatchForIds(ids, auth, context = {}) {
    const authKey = "__global__";
    if (!this._batchers.has(authKey)) {
      this._batchers.set(authKey, {
        ids: new Set(),
        resolvers: [],
        timer: null,
      });
    }
    const batcher = this._batchers.get(authKey);

    ids.forEach((id) => batcher.ids.add(String(id)));

    return new Promise((resolve, reject) => {
      batcher.resolvers.push({ ids: ids.map(String), resolve, reject });

      if (!batcher.timer) {
        batcher.timer = setTimeout(async () => {
          const requestIds = Array.from(batcher.ids);
          const resolvers = batcher.resolvers.slice();
          batcher.ids.clear();
          batcher.resolvers = [];
          batcher.timer = null;

          // Perform one HTTP request for all ids
          let mapById = new Map();
          let promiseResolve;
          const inFlightPromise = new Promise((res) => (promiseResolve = res));
          this._inFlight.set(authKey, {
            promise: inFlightPromise,
            ids: new Set(requestIds),
          });

          try {
            const rawData = await this._getPlayerLinkDetails(requestIds, auth, {
              ...context,
              batched: true,
              batchSize: requestIds.length,
            });
            mapById = this._splitRawBySteamId(rawData);

            // Cache results with short TTL
            for (const id of requestIds) {
              const raw = mapById.get(id) || null;
              this._setCachedRaw(id, raw);
            }
          } catch (error) {
            // On failure, fill nulls for requested ids (processors handle nulls/empty)
            mapById = new Map();
            for (const id of requestIds) {
              mapById.set(id, null);
              this._setCachedRaw(id, null);
            }
          } finally {
            // Resolve in-flight promise for any waiters
            promiseResolve(mapById);
            // Clear in-flight entry
            this._inFlight.delete(authKey);
          }

          // Fan-out results to individual resolvers
          for (const { ids: reqIds, resolve } of resolvers) {
            const partial = new Map();
            for (const id of reqIds) {
              partial.set(id, mapById.get(id) || null);
            }
            resolve(partial);
          }
        }, this._BATCH_WINDOW_MS);
      }
    });
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
   * @returns {Promise<boolean>} - True if player is playing CS2 (and in lobby if required)
   */
  static async isPlayerInCS2(steam_id, auth, requireLobby = false) {
    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        steam_id,
        auth,
        { steam_id, checkingCS2: true, requireLobby }
      );
      const data = mapById.get(String(steam_id)) || null;
      return SteamAPIResponseProcessor.processPlayerCS2StatusResponse(data, steam_id, requireLobby);
    } catch (error) {
      SteamAPILogger.logError("isPlayerInCS2", error, { steam_id });
      return false;
    }
  }

  /**
   * Check if a player is currently playing in Competitive or Premier mode
   * @param {string} steam_id - Steam ID to check
   * @param {string} auth - API key or token
   * @returns {Promise<boolean>} - Whether the player is playing in Competitive or Premier mode
   */
  static async checkUserGameMode(steam_id, auth) {
    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        steam_id,
        auth,
        { steam_id, checkingGameMode: true }
      );
      const data = mapById.get(String(steam_id)) || null;
      return SteamAPIResponseProcessor.processUserGameModeResponse(data, steam_id);
    } catch (error) {
      SteamAPILogger.logError("checkUserGameMode", error, { steam_id });
      return false;
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
      // Rebuild rawData with only requested ids in stable order
      const accounts = [];
      for (const id of friend_ids.map(String)) {
        const raw = mapById.get(id);
        const acc = raw?.response?.accounts?.[0];
        if (acc) accounts.push(acc);
      }
      const data = { response: { accounts } };

      // Create callback for fetching additional avatars
      const getPlayerSummariesCallback = async (steamids) => {
        return await this.getPlayerSummaries(steamids, auth);
      };

      return await SteamAPIResponseProcessor.processFriendsStatusesResponse(
        data,
        avatarsCache,
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
   * Get connect information for a specific friend
   * @param {string} friend_id - Friend's Steam ID
   * @param {string} auth - API key or token
   * @returns {Promise<string|null>} - Connect string or null
   */
  static async getFriendConnectInfo(friend_id, auth) {
    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        friend_id,
        auth,
        { friend_id }
      );
      const data = mapById.get(String(friend_id)) || null;
      if (!data) return null;
      return SteamAPIResponseProcessor.processConnectInfoResponse(data);
    } catch (error) {
      SteamAPILogger.logError("getFriendConnectInfo", error, { friend_id });
      return null;
    }
  }

  /**
   * Get the game server Steam ID for a user
   * @param {string} steam_id - Steam ID to check
   * @param {string} auth - API key or token
   * @returns {Promise<string|null>} - Game server Steam ID or null
   */
  static async getUserGameServerSteamId(steam_id, auth) {
    try {
      const mapById = await this._getPlayerLinkDetailsBatched(
        steam_id,
        auth,
        { steam_id }
      );
      const data = mapById.get(String(steam_id)) || null;
      if (!data) return null;
      return SteamAPIResponseProcessor.processGameServerSteamIdResponse(data);
    } catch (error) {
      SteamAPILogger.logError("getUserGameServerSteamId", error, { steam_id });
      return null;
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
