// Shared constants
import { ERROR_CODES } from "../shared/constants.js";

// Steam modules
import { isInSupportedMode, parseRichPresence } from "./rich-presence.js";

// UI and utilities
import ErrorHandler from "../utils/error-handler.js";

/**
 * Errors with a meaning of their own, by API method, credential kind and
 * HTTP status. A private friends list answers 401 to an API key. A web
 * token reads its owner's own list, so a 401 there is Steam turning the
 * token down, as it answers a made-up token (checked 2026-11-03).
 */
const METHOD_ERROR_HANDLERS = {
  GetFriendsList: {
    key: {
      401: () => ErrorHandler.createError(ERROR_CODES.PRIVATE_FRIENDS_LIST),
    },
  },
};

/**
 * The error code of an HTTP status Steam failed a request with
 * @param {number} status - HTTP status
 * @param {boolean} isToken - Whether the request carried a web token
 * @returns {string} - One of ERROR_CODES
 */
function httpErrorCode(status, isToken) {
  if (status === 401 || status === 403) {
    return isToken ? ERROR_CODES.TOKEN_REJECTED : ERROR_CODES.KEY_REJECTED;
  }
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status >= 500) return ERROR_CODES.STEAM_UNAVAILABLE;
  return ERROR_CODES.STEAM_ERROR;
}

/**
 * Steam API utilities: HTTP errors, the shapes of Steam's answers and
 * avatars. The rich presence rules live in rich-presence.js.
 */
class SteamAPIUtils {
  /**
   * Mask sensitive authentication data in URLs for logging
   * @param {string} url - URL to mask
   * @returns {string} - URL with masked authentication
   */
  static maskAuthInUrl(url) {
    return url.replace(/(key|access_token)=[^&]+/g, "$1=***");
  }

  /**
   * Extract Steam IDs from friends list response data
   * @param {Object} rawData - Raw friends list response
   * @param {boolean} isToken - Whether response is from token API
   * @returns {string[]} - Array of Steam IDs
   */
  static extractFriendIds(rawData, isToken) {
    let friendIds = [];

    if (isToken) {
      // Token API response format
      if (
        !rawData.response?.friendslist?.friends ||
        !Array.isArray(rawData.response.friendslist.friends)
      ) {
        return [];
      }

      // Filter to only confirmed friends (efriendrelationship: 3)
      const allFriends = rawData.response.friendslist.friends;
      const confirmedFriends = allFriends.filter(
        (f) => f.efriendrelationship === 3
      );
      friendIds = confirmedFriends.map((f) => f.ulfriendid);
    } else {
      // API Key response format
      if (!rawData.friendslist?.friends) {
        return [];
      }

      // Filter to only confirmed friends (relationship: "friend")
      const allFriends = rawData.friendslist.friends;
      const confirmedFriends = allFriends.filter(
        (f) => f.relationship === "friend"
      );
      friendIds = confirmedFriends.map((f) => f.steamid);
    }

    return friendIds;
  }

  /**
   * Extract players array from player summaries response
   * @param {Object} rawData - Raw player summaries response
   * @returns {Object[]} - Array of player objects
   */
  static extractPlayersFromSummaries(rawData) {
    // Handle different response formats based on auth type
    if (Array.isArray(rawData.players)) {
      // Token response format
      return rawData.players;
    } else if (rawData.response && Array.isArray(rawData.response.players)) {
      // API key response format
      return rawData.response.players;
    }

    return [];
  }

  /**
   * Extract best available avatar from player data
   * @param {Object} playerData - Player data object
   * @returns {string} - Avatar URL or empty string
   */
  static extractBestAvatar(playerData) {
    return (
      playerData?.avatarfull ||
      playerData?.avatar ||
      playerData?.avatarmedium ||
      ""
    );
  }

  /**
   * Filter Steam IDs that need avatar data fetching
   * @param {string[]} steamIds - Array of Steam IDs
   * @param {Object} avatarsCache - Existing avatars cache
   * @returns {string[]} - Steam IDs that need avatar fetching
   */
  static filterMissingAvatars(steamIds, avatarsCache) {
    return steamIds.filter((steamid) => !avatarsCache[steamid]);
  }

  /**
   * Create debug info for player from account data
   * @param {Object} account - Account data from API
   * @returns {Object} - Debug info object
   */
  static createPlayerDebugInfo(account) {
    const pub = account.public_data || {};
    const priv = account.private_data || {};
    const richPresence = parseRichPresence(priv.rich_presence_kv || "");

    return {
      name: pub.persona_name || "Unknown",
      steamid: pub.steamid,
      game_name:
        priv.game_id === "730"
          ? "CS2"
          : priv.game_id
            ? `Game ${priv.game_id}`
            : "Not in game",
      game_mode: richPresence.game_mode || "Unknown",
      game_state: richPresence.game_state || "Unknown",
      in_supported_mode: isInSupportedMode(richPresence),
    };
  }

  /**
   * Handle HTTP response status and errors
   * @param {Response} response - Fetch response object
   * @param {Object} config - Request configuration
   * @param {boolean} [config.isToken] - Whether the request carried a web token
   * @returns {boolean} - True if response is OK, false if handled error with allowFailure
   * @throws {Error} - For unhandled errors or custom error handlers, with
   *   the HTTP status in its status
   */
  static handleHttpResponse(response, config) {
    if (response.ok) {
      return true;
    }

    // Check for custom error handlers first
    const handler = config.errorHandlers?.[response.status];
    if (handler) throw handler();

    if (config.allowFailure) {
      return false;
    }

    const error = ErrorHandler.createError(
      httpErrorCode(response.status, config.isToken),
      `${config.method} failed: ${response.status} ${response.statusText}`
    );
    error.status = response.status;
    throw error;
  }

  /**
   * Get error handlers for specific API methods
   * @param {string} method - API method name
   * @param {boolean} isToken - Whether the request carries a web token
   * @returns {Object} - Error handlers by HTTP status
   */
  static getMethodErrorHandlers(method, isToken) {
    return METHOD_ERROR_HANDLERS[method]?.[isToken ? "token" : "key"] || {};
  }
}

export default SteamAPIUtils;
