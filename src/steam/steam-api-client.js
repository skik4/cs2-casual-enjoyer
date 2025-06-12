// Steam modules
import SteamAPIHttpClient from "./http-client.js";
import SteamAPIConfig from "./api-config.js";
import SteamAPILogger from "./api-logger.js";
import SteamAPIResponseProcessor from "./steam-api-response-processor.js";
import SteamAPIUtils from "./steam-api-utils.js";

// UI and utilities
import Validators from "../utils/validators.js";

/**
 * Steam API client with proper separation of concerns
 * Responsible only for orchestrating API calls using specialized components
 */
class SteamAPIClient {
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
    const { allowFailure = false, context = {} } = options;

    try {
      // Build URL using config manager
      const url = SteamAPIConfig.buildUrl(method, params, auth);

      // Log request
      SteamAPILogger.logRequest(method, url, context);
      // Make HTTP request
      const response = await SteamAPIHttpClient.makeRequest(url);

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
      const data = await this._getPlayerLinkDetails(steam_id, auth, {
        steam_id,
        checkingCS2: true,
        requireLobby,
      });

      return SteamAPIResponseProcessor.processPlayerCS2StatusResponse(
        data,
        steam_id,
        requireLobby
      );
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
      const data = await this._getPlayerLinkDetails(steam_id, auth, {
        steam_id,
        checkingGameMode: true,
      });

      return SteamAPIResponseProcessor.processUserGameModeResponse(
        data,
        steam_id
      );
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
      const data = await this._getPlayerLinkDetails(friend_ids, auth, {
        friendsCount: friend_ids.length,
      });

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
      const data = await this._getPlayerLinkDetails(friend_id, auth, {
        friend_id,
      });

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
      const data = await this._getPlayerLinkDetails(steam_id, auth, {
        steam_id,
      });

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
