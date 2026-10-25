// Shared constants
import {
  ERROR_CODES,
  GAME_MODES,
  VALIDATION_PATTERNS,
} from "../shared/constants.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * Steam API utilities and parsers
 * Contains helper functions for parsing and validating Steam data
 */
class SteamAPIUtils {
  /**
   * Parse Rich Presence data from Steam
   * @param {string} kv - Key-value string from Steam rich presence
   * @returns {Object} - Parsed rich presence fields
   */
  static parseRichPresence(kv) {
    // Steam omits rich_presence_kv entirely for players who are not in a
    // game, so coerce here rather than making every caller pass `|| ""`.
    const source = typeof kv === "string" ? kv : "";
    function extract(key) {
      const re = new RegExp(
        '"' + key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + '"\\s+"([^"]+)"'
      );
      const m = source.match(re);
      return m ? m[1] : null;
    }
    return {
      status: extract("status"),
      game_state: extract("game:state"),
      game_mode: extract("game:mode"),
      game_map: extract("game:map"),
      game_score: extract("game:score"),
      connect: extract("connect"),
      game_server_steam_id: extract("game_server_steam_id"),
      game_server: extract("game:server"),
      steam_display: extract("steam_display"),
      addon: extract("Addon"),
    };
  }

  /**
   * Whether rich presence describes a match on one of Valve's own servers.
   * Community servers say "community" or carry a workshop Addon, and the
   * ones on Valve's relay network still show their own map names, which
   * the client displays through the workshop-map string.
   * @param {Object} richPresence - Parsed rich presence data
   * @returns {boolean} - True for an official server
   */
  static isOfficialServer(richPresence) {
    return (
      richPresence?.game_server === "kv" &&
      typeof richPresence.steam_display === "string" &&
      richPresence.steam_display.startsWith("#display_GameKnownMap") &&
      !richPresence.addon
    );
  }

  /**
   * Rounds played according to a rich presence score such as "[ 3 : 1 ]"
   * @param {string|null} score - game:score value
   * @returns {number|null} - Rounds played, or null when there is no score
   */
  static parseRoundsPlayed(score) {
    const match = String(score ?? "").match(/(\d+)\s*:\s*(\d+)/);
    return match ? Number(match[1]) + Number(match[2]) : null;
  }

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
   * Check if player is in CS2 based on game_id
   * @param {Object} privateData - Player's private data
   * @returns {boolean} - True if player is in CS2
   */
  static isPlayerInCS2(privateData) {
    return privateData?.game_id === "730";
  }

  /**
   * Check if player is in a casual match, not in the lobby
   * @param {Object} richPresence - Parsed rich presence data
   * @returns {boolean} - True if in supported mode
   */
  static isInSupportedMode(richPresence) {
    return (
      richPresence.game_mode === GAME_MODES.CASUAL &&
      !["", null, "lobby"].includes(richPresence.game_state)
    );
  }

  /**
   * Check if join is available for a player
   * @param {Object} richPresence - Parsed rich presence data
   * @returns {boolean} - True if join is available
   */
  static isJoinAvailable(richPresence) {
    return (
      this.isInSupportedMode(richPresence) &&
      this.isValidConnect(richPresence.connect)
    );
  }

  /**
   * Check that a rich presence connect string is a bare +gcconnect token.
   * The value is written by the other player's client and becomes CS2 launch
   * arguments via steam://rungame, so anything else in it (spaces, encoded
   * characters, extra +commands) must never reach the game.
   * @param {*} connect - Connect value from rich presence
   * @returns {boolean} - True if the connect string is safe to launch with
   */
  static isValidConnect(connect) {
    return (
      typeof connect === "string" && VALIDATION_PATTERNS.GC_CONNECT.test(connect)
    );
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
    const richPresence = this.parseRichPresence(priv.rich_presence_kv || "");

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
      in_supported_mode: this.isInSupportedMode(richPresence),
    };
  }

  /**
   * Handle HTTP response status and errors
   * @param {Response} response - Fetch response object
   * @param {Object} config - Request configuration
   * @param {Object} context - Additional context for logging
   * @returns {Promise<boolean>} - True if response is OK, false if handled error with allowFailure
   * @throws {Error} - For unhandled errors or custom error handlers
   */
  static async handleHttpResponse(response, config, context = {}) {
    if (response.ok) {
      return true;
    }

    // Check for custom error handlers first
    if (config.errorHandlers && config.errorHandlers[response.status]) {
      throw config.errorHandlers[response.status]();
    } // Handle allowFailure cases
    if (config.allowFailure) {
      return false;
    }

    // Import here to avoid circular dependency
    const { default: ErrorHandler } = await import("../utils/error-handler.js");

    // Default error handling
    throw ErrorHandler.createError(
      `API_ERROR_${response.status}`,
      `${config.method} failed: ${response.status} ${response.statusText}`
    );
  }

  /**
   * Get error handlers for specific API methods
   * @param {string} method - API method name
   * @returns {Promise<Object>} - Error handlers map
   */
  static async getMethodErrorHandlers(method) {
    // Import here to avoid circular dependency
    const { default: ErrorHandler } = await import("../utils/error-handler.js");

    const errorHandlers = {
      GetFriendsList: {
        401: () => ErrorHandler.createError(ERROR_CODES.PRIVATE_FRIENDS_LIST),
      },
    };

    return errorHandlers[method] || {};
  }

  /**
   * Check if player is in a Competitive or Premier match
   * @param {Object} privateData - Private data from Steam API response
   * @returns {boolean} - True if player is in a Competitive or Premier match (not the lobby)
   */
  static isPlayerInCompetitiveOrPremier(privateData) {
    if (!privateData) return false;

    // Parse rich presence to get game mode
    const richPresence = this.parseRichPresence(privateData.rich_presence_kv);

    const gameMode = richPresence.game_mode;
    const gameState = richPresence.game_state;
    // In the lobby the mode may only be what is picked in the play menu, so it
    // counts only once a match is actually running
    const isCompetitive =
      (gameMode === GAME_MODES.COMPETITIVE ||
        gameMode === GAME_MODES.PREMIER) &&
      !["", null, "lobby"].includes(gameState);

    logger.debug("SteamAPIUtils", "Checking competitive/premier mode", {
      game_mode: gameMode,
      game_state: gameState,
      isCompetitive,
      rich_presence_kv: privateData.rich_presence_kv,
    });

    return isCompetitive;
  }
}

export default SteamAPIUtils;
