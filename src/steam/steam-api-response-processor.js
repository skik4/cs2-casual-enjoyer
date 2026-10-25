// Shared constants
import { ERROR_CODES } from "../shared/constants.js";

// Steam modules
import SteamAPIUtils from "./steam-api-utils.js";

// UI and utilities
import ErrorHandler from "../utils/error-handler.js";
import logger from "../utils/logger.js";

/**
 * Steam API Response Processor
 * Handles parsing and processing of raw Steam API responses
 * Separates response processing logic from HTTP request logic
 */
class SteamAPIResponseProcessor {
  /**
   * Process friends list response from Steam API
   * @param {Object} rawData - Raw response from Steam API
   * @param {boolean} isToken - Whether the request was made with a token or API key
   * @returns {string[]} - Array of confirmed friend Steam IDs
   */
  static processFriendsListResponse(rawData, isToken) {
    logger.debug(
      "SteamAPIResponseProcessor",
      "Processing friends list response",
      { isToken }
    );

    const friendIds = SteamAPIUtils.extractFriendIds(rawData, isToken);

    if (friendIds.length === 0) {
      logger.warn(
        "SteamAPIResponseProcessor",
        "No confirmed friends found after filtering"
      );
      throw ErrorHandler.createError(ERROR_CODES.EMPTY_FRIENDS_LIST);
    }

    logger.info(
      "SteamAPIResponseProcessor",
      `Processed ${friendIds.length} confirmed friends`,
      {
        count: friendIds.length,
      }
    );

    return friendIds;
  }

  /**
   * Process player summaries response from Steam API
   * @param {Object} rawData - Raw response from Steam API
   * @param {number} chunkIndex - Current chunk index for logging
   * @returns {Object[]} - Array of player objects
   */
  static processPlayerSummariesResponse(rawData, chunkIndex = 1) {
    logger.debug(
      "SteamAPIResponseProcessor",
      `Processing player summaries response chunk ${chunkIndex}`
    );

    const players = SteamAPIUtils.extractPlayersFromSummaries(rawData);

    logger.info(
      "SteamAPIResponseProcessor",
      `Chunk ${chunkIndex}: processed ${players.length} player summaries`
    );

    // Debug logging for processed player data
    logger.debug(
      "SteamAPIResponseProcessor",
      `Player summaries chunk ${chunkIndex} details`,
      {
        players: players.map((p) => ({
          name: p.personaname || "Unknown",
          steamid: p.steamid,
          profilestate: p.profilestate,
          lastlogoff: p.lastlogoff
            ? new Date(p.lastlogoff * 1000).toISOString()
            : "Never",
          avatar: p.avatar ? "Has avatar" : "No avatar",
        })),
      }
    );

    return players;
  }

  /**
   * Process player link details response for friends statuses
   * @param {Object} rawData - Raw response from Steam API
   * @param {Object} avatarsCache - Cache of avatar data
   * @param {Function} getPlayerSummariesCallback - Callback to fetch additional avatars
   * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of processed friend objects
   */
  static async processFriendsStatusesResponse(
    rawData,
    avatarsCache = {},
    getPlayerSummariesCallback = null
  ) {
    logger.debug(
      "SteamAPIResponseProcessor",
      "Processing friends statuses response"
    );

    const accounts = rawData.response?.accounts || [];
    logger.info(
      "SteamAPIResponseProcessor",
      `Processing ${accounts.length} accounts`
    );

    // Filter for CS2 players first
    const cs2Players = accounts.filter(
      (acc) => acc.private_data?.game_id === "730"
    );
    logger.info(
      "SteamAPIResponseProcessor",
      `Found ${cs2Players.length} friends playing CS2`
    );

    // Pre-filter for supported players to only load avatars for them
    const supportedPlayerSteamIds =
      this._extractSupportedPlayerSteamIds(cs2Players);
    logger.info(
      "SteamAPIResponseProcessor",
      `Found ${supportedPlayerSteamIds.length} friends in casual`
    );

    // Get avatars only for supported players
    const avatarMap = await this._processAvatarsForSupportedPlayers(
      supportedPlayerSteamIds,
      avatarsCache,
      getPlayerSummariesCallback
    );

    // Debug: Show all friends with their game status
    this._logAllFriendsBreakdown(accounts);

    // Map to friend objects
    const mapped = this._mapAccountsToFriends(cs2Players, avatarMap);

    // Debug logging for supported and non-supported friends
    this._logFriendsBreakdown(mapped);

    return mapped;
  }

  /**
   * Connect strings already reported as malformed. The join loop reads a
   * snapshot every iteration, so each distinct value is warned about once
   * instead of on every poll.
   * @type {Set<string>}
   */
  static _reportedInvalidConnects = new Set();

  /**
   * Process one player's link details into the facts the join loop acts on
   * @param {Object|null} rawData - Raw-like response for one player, null when Steam returned no account
   * @returns {import('../shared/types.js').PlayerJoinInfo} - Join-relevant player info
   */
  static processJoinInfoResponse(rawData) {
    const account = rawData?.response?.accounts?.[0];
    const pub = account?.public_data || {};
    const priv = account?.private_data || {};
    const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv);

    const inCS2 = SteamAPIUtils.isPlayerInCS2(priv);
    const inCompetitiveOrPremier =
      inCS2 && SteamAPIUtils.isPlayerInCompetitiveOrPremier(priv);
    const inSupportedMode =
      inCS2 && SteamAPIUtils.isInSupportedMode(richPresence);

    let connect = null;
    if (inSupportedMode && richPresence.connect) {
      if (SteamAPIUtils.isValidConnect(richPresence.connect)) {
        connect = richPresence.connect;
      } else if (!this._reportedInvalidConnects.has(richPresence.connect)) {
        this._reportedInvalidConnects.add(richPresence.connect);
        logger.warn(
          "SteamAPIResponseProcessor",
          "Ignoring malformed connect string from rich presence",
          { steamid: pub.steamid, connect: richPresence.connect }
        );
      }
    }

    return {
      personaname: pub.persona_name || "",
      inCS2,
      inCompetitiveOrPremier,
      inSupportedMode,
      connect,
      serverId:
        richPresence.game_server_steam_id || priv.game_server_steam_id || null,
    };
  }

  /**
   * Process one player's link details into what the map finder needs: the
   * join facts plus where the match is played
   * @param {Object|null} rawData - Raw-like response for one player, null when Steam returned no account
   * @returns {import('../shared/types.js').PlayerPresence} - Player presence
   */
  static processPresenceResponse(rawData) {
    const account = rawData?.response?.accounts?.[0];
    const richPresence = SteamAPIUtils.parseRichPresence(
      account?.private_data?.rich_presence_kv
    );
    const info = this.processJoinInfoResponse(rawData);

    return {
      ...info,
      steamid: account?.public_data?.steamid || null,
      mode: info.inCS2 ? richPresence.game_mode : null,
      map: info.inCS2 ? richPresence.game_map : null,
      score: info.inCS2 ? richPresence.game_score : null,
      official: info.inSupportedMode && SteamAPIUtils.isOfficialServer(richPresence),
    };
  }

  /**
   * Process vanity URL resolution response
   * @param {Object} rawData - Raw response from Steam API
   * @returns {string|null} - Steam ID or null
   */
  static processVanityUrlResponse(rawData) {
    logger.debug("SteamAPIResponseProcessor", "Processing vanity URL response");

    if (rawData.response?.success === 1) {
      const steamId = rawData.response.steamid;
      logger.debug(
        "SteamAPIResponseProcessor",
        "Successfully resolved vanity URL",
        { steamId }
      );
      return steamId;
    }

    logger.debug("SteamAPIResponseProcessor", "Failed to resolve vanity URL", {
      success: rawData.response?.success,
    });
    return null;
  }

  /**
   * Process player link details response to check if player is in CS2
   * @param {Object} rawData - Raw response from Steam API
   * @param {string} steam_id - Steam ID being checked (for logging)
   * @param {boolean} requireLobby - Whether to require lobby state (default: false)
   * @returns {boolean} - True if player is playing CS2 (and in lobby if required)
   */
  static processPlayerCS2StatusResponse(
    rawData,
    steam_id,
    requireLobby = false
  ) {
    logger.debug(
      "SteamAPIResponseProcessor",
      "Processing player CS2 status response",
      {
        steam_id,
        requireLobby,
        hasData: !!rawData,
        hasResponse: !!(rawData && rawData.response),
        hasAccounts: !!(
          rawData &&
          rawData.response &&
          rawData.response.accounts
        ),
        accountsLength:
          rawData && rawData.response && rawData.response.accounts
            ? rawData.response.accounts.length
            : 0,
        fullResponse: rawData,
      }
    );

    if (
      !rawData ||
      !rawData.response ||
      !rawData.response.accounts ||
      !rawData.response.accounts.length
    ) {
      logger.warn(
        "SteamAPIResponseProcessor",
        `No player data found for ${steam_id}`,
        {
          dataExists: !!rawData,
          responseExists: !!(rawData && rawData.response),
          accountsExists: !!(
            rawData &&
            rawData.response &&
            rawData.response.accounts
          ),
          accountsLength:
            rawData && rawData.response && rawData.response.accounts
              ? rawData.response.accounts.length
              : 0,
        }
      );
      return false;
    }

    const account = rawData.response.accounts[0];
    const priv = account.private_data || {};
    const isInCS2 = SteamAPIUtils.isPlayerInCS2(priv);

    if (!isInCS2) {
      logger.info(
        "SteamAPIResponseProcessor",
        `Player ${steam_id} CS2 status: not playing`,
        {
          steam_id,
          game_id: priv.game_id,
          isInCS2: false,
        }
      );
      return false;
    }

    // If lobby state is not required, return true if just in CS2
    if (!requireLobby) {
      logger.info(
        "SteamAPIResponseProcessor",
        `Player ${steam_id} CS2 status: playing (lobby check not required)`,
        {
          steam_id,
          game_id: priv.game_id,
          isInCS2: true,
          requireLobby: false,
        }
      );
      return true;
    }

    // Parse rich presence to check if user is in lobby
    const richPresence = SteamAPIUtils.parseRichPresence(
      priv.rich_presence_kv || ""
    );
    const isInLobby = richPresence.game_state === "lobby";

    logger.info(
      "SteamAPIResponseProcessor",
      `Player ${steam_id} CS2 status: ${isInCS2 ? "playing" : "not playing"}, in lobby: ${isInLobby}`,
      {
        steam_id,
        game_id: priv.game_id,
        game_state: richPresence.game_state,
        isInCS2,
        isInLobby,
        requireLobby: true,
        richPresenceData: richPresence,
      }
    );

    // Return true if player is in CS2 AND in lobby (when lobby is required)
    return isInCS2 && isInLobby;
  }

  // Private helper methods
  /**
   * Extract Steam IDs of players in a casual match
   * @param {Object[]} cs2Players - Players playing CS2
   * @returns {string[]} - Steam IDs of players in supported modes
   * @private
   */
  static _extractSupportedPlayerSteamIds(cs2Players) {
    return cs2Players
      .filter((acc) => {
        const priv = acc.private_data || {};
        const richPresence = SteamAPIUtils.parseRichPresence(
          priv.rich_presence_kv || ""
        );
        return SteamAPIUtils.isInSupportedMode(richPresence);
      })
      .map((acc) => acc.public_data?.steamid)
      .filter(Boolean);
  }

  /**
   * Process avatars for supported players
   * @param {string[]} supportedPlayerSteamIds - Steam IDs of supported players
   * @param {Object} avatarsCache - Existing avatar cache
   * @param {Function} getPlayerSummariesCallback - Callback to fetch avatars
   * @returns {Promise<Object>} - Avatar map
   * @private
   */
  static async _processAvatarsForSupportedPlayers(
    supportedPlayerSteamIds,
    avatarsCache,
    getPlayerSummariesCallback
  ) {
    let avatarMap = {};
    if (supportedPlayerSteamIds.length > 0) {
      // Check if we have cached avatars for these players
      const missingAvatars = SteamAPIUtils.filterMissingAvatars(
        supportedPlayerSteamIds,
        avatarsCache
      );

      if (missingAvatars.length > 0 && getPlayerSummariesCallback) {
        logger.info(
          "SteamAPIResponseProcessor",
          `Fetching avatars for ${missingAvatars.length} supported players`
        );
        // Avatars are cosmetic: a failed fetch must not discard the friend
        // statuses that were already retrieved successfully.
        let fetchedAvatars = {};
        try {
          fetchedAvatars = await getPlayerSummariesCallback(missingAvatars);
        } catch (error) {
          logger.warn(
            "SteamAPIResponseProcessor",
            "Avatar fetch failed, continuing without new avatars",
            { error: error.message, count: missingAvatars.length }
          );
        }
        avatarMap = { ...avatarsCache, ...fetchedAvatars };
        logger.info(
          "SteamAPIResponseProcessor",
          `Retrieved ${Object.keys(fetchedAvatars).length} new avatars`
        );
      } else {
        avatarMap = avatarsCache;
        logger.info(
          "SteamAPIResponseProcessor",
          `Using cached avatars for all ${supportedPlayerSteamIds.length} supported players`
        );
      }
    }

    return avatarMap;
  }

  /**
   * Log breakdown of all friends with their game status
   * @param {Object[]} accounts - All account data
   * @private
   */
  static _logAllFriendsBreakdown(accounts) {
    logger.debug("SteamAPIResponseProcessor", "All friends breakdown", {
      allFriends: accounts.map((acc) =>
        SteamAPIUtils.createPlayerDebugInfo(acc)
      ),
    });
  }

  /**
   * Map account objects to friend objects
   * @param {Object[]} cs2Players - Players playing CS2
   * @param {Object} avatarMap - Avatar data map
   * @returns {import('../shared/types.js').Friend[]} - Mapped friend objects
   * @private
   */
  static _mapAccountsToFriends(cs2Players, avatarMap) {
    return cs2Players.map((acc) => {
      const priv = acc.private_data || {};
      const pub = acc.public_data || {};
      const richPresence = SteamAPIUtils.parseRichPresence(
        priv.rich_presence_kv || ""
      );
      const status = richPresence.status || "";
      const inSupportedMode = SteamAPIUtils.isInSupportedMode(richPresence);
      const joinAvailable = SteamAPIUtils.isJoinAvailable(richPresence);

      const steamid = pub.steamid || "";
      const avatar = SteamAPIUtils.extractBestAvatar(avatarMap[steamid]);

      return {
        // Basic friend info
        steamid,
        personaname: pub.persona_name || "",
        avatar,
        status,

        // Game state info
        game_mode: richPresence.game_mode,
        game_state: richPresence.game_state,
        game_map: richPresence.game_map || "",
        game_score: richPresence.game_score || "",
        game_server_id: richPresence.game_server_steam_id || "",

        // App logic flags
        in_casual_mode: inSupportedMode,
        join_available: joinAvailable,
        connect: richPresence.connect || "",
      };
    });
  }

  /**
   * Log breakdown of supported and non-supported friends
   * @param {import('../shared/types.js').Friend[]} mapped - Mapped friend objects
   * @private
   */
  static _logFriendsBreakdown(mapped) {
    const supportedFriends = mapped.filter((friend) => friend.in_casual_mode);
    const joinableFriends = supportedFriends.filter((f) => f.join_available);

    logger.info(
      "SteamAPIResponseProcessor",
      `Found ${supportedFriends.length} friends in casual, ${joinableFriends.length} joinable`
    );

    // Debug: Show non-supported CS2 friends and why they're not supported
    const nonSupportedFriends = mapped.filter((f) => !f.in_casual_mode);
    logger.debug("SteamAPIResponseProcessor", "Non-supported CS2 friends", {
      nonSupportedFriends: nonSupportedFriends.map((f) => ({
        name: f.personaname || "Unknown",
        status: f.status,
        game_mode: f.game_mode || "Unknown",
        game_state: f.game_state || "Unknown",
        reason: !f.game_mode
          ? "No game mode"
          : f.game_mode !== "casual"
            ? `Playing ${f.game_mode}`
            : ["", null, "lobby"].includes(f.game_state)
              ? `In ${f.game_state || "lobby"}`
              : "Other reason",
      })),
    });

    // Debug: Show supported friends (always show, even if empty)
    logger.debug("SteamAPIResponseProcessor", "Supported friends", {
      supportedFriends: supportedFriends.map((f) => ({
        name: f.personaname || "Unknown",
        status: f.status,
        game_mode: f.game_mode,
        game_map: f.game_map,
        game_score: f.game_score,
        join_available: f.join_available,
        connect: f.connect ? "Available" : "Not available",
      })),
    });
  }
}

export default SteamAPIResponseProcessor;
