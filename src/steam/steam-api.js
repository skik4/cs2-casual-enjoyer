// Steam modules
import SteamAPIClient from "./steam-api-client.js";
import SteamAPIUtils from "./steam-api-utils.js";

/**
 * Steam API facade module
 * Main interface for Steam API functionality - provides backward compatibility
 * Delegates to SteamAPIClient and SteamAPIUtils
 */
class SteamAPI {
  // ===== UTILITY METHODS (delegated to SteamAPIUtils) =====

  /**
   * Parse Rich Presence data from Steam
   * @param {string} kv - Key-value string from Steam rich presence
   * @returns {Object} - Parsed rich presence fields
   */
  static parseRichPresence(kv) {
    return SteamAPIUtils.parseRichPresence(kv);
  }

  // ===== API CLIENT METHODS (delegated to SteamAPIClient) =====
  /**
   * Get the user's friends list
   * @param {string} steam_id - Steam ID of the user
   * @param {string} auth - API key or token
   * @returns {Promise<string[]>} - Array of friend Steam IDs
   */
  static async getFriendsList(steam_id, auth) {
    return SteamAPIClient.getFriendsList(steam_id, auth);
  }

  /**
   * Fetch player summaries for up to 100 SteamIDs at a time
   * @param {string[]|string} steamids - Steam IDs to fetch
   * @param {string} auth - API key or token
   * @returns {Promise<Object>} - Map of Steam ID to player data
   */
  static async getPlayerSummaries(steamids, auth) {
    return SteamAPIClient.getPlayerSummaries(steamids, auth);
  }

  /**
   * Get details about friends including their game status and avatars
   * @param {string[]} friend_ids - Array of friend Steam IDs
   * @param {string} auth - API key or token
   * @param {Object} [avatarsCache] - Cache of avatar data
   * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friend objects
   */
  static async getFriendsStatuses(friend_ids, auth, avatarsCache = {}) {
    return SteamAPIClient.getFriendsStatuses(friend_ids, auth, avatarsCache);
  }

  /**
   * Get the join-relevant state of the user and the friend from one request
   * @param {string} user_steam_id - User's Steam ID
   * @param {string} friend_id - Friend's Steam ID
   * @param {string} auth - API key or token
   * @returns {Promise<import('../shared/types.js').JoinSnapshot>} - Each side is null when Steam could not be asked
   */
  static async getJoinSnapshot(user_steam_id, friend_id, auth) {
    return SteamAPIClient.getJoinSnapshot(user_steam_id, friend_id, auth);
  }

  /**
   * Get where many players are playing, 100 per request
   * @param {string[]} steamids - Steam IDs to ask about
   * @param {string} auth - API key or token
   * @returns {Promise<Map<string, import('../shared/types.js').PlayerPresence>>} - Answered ids only
   */
  static async getPresence(steamids, auth) {
    return SteamAPIClient.getPresence(steamids, auth);
  }

  /**
   * Get someone else's friends list (API key only)
   * @param {string} steamid - Whose friends to list
   * @param {string} key - Steam Web API key
   * @returns {Promise<string[]>} - Friend ids, empty when private or failed
   */
  static async getFriendIdsOf(steamid, key) {
    return SteamAPIClient.getFriendIdsOf(steamid, key);
  }

  /**
   * Resolve vanity URL to SteamID64
   * @param {string} vanityUrl - Vanity URL to resolve
   * @param {string} auth - API key or token
   * @returns {Promise<string|null>} - Steam ID or null
   */
  static async resolveVanityUrl(vanityUrl, auth) {
    return SteamAPIClient.resolveVanityUrl(vanityUrl, auth);
  }

  /**
   * Check if a player is currently playing CS2
   * @param {string} steam_id - Steam ID to check
   * @param {string} auth - API key or token
   * @param {boolean} requireLobby - Whether to require lobby state (default: false)
   * @returns {Promise<boolean|null>} - Whether the player is playing CS2 (and in lobby if required),
   *   null when Steam could not be asked
   */
  static async isPlayerInCS2(steam_id, auth, requireLobby = false) {
    return SteamAPIClient.isPlayerInCS2(steam_id, auth, requireLobby);
  }
}

export default SteamAPI;
