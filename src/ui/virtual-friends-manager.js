// Core singletons
import appStateManager from "../core/app-state-manager.js";

// UI and utilities
import Validators from "../utils/validators.js";

/**
 * Neutral silhouette shown until Steam returns a real avatar for the ID.
 */
const PLACEHOLDER_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27 width=%2732%27 height=%2732%27%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%2716%27 fill=%27%23718096%27/%3E%3Cpath d=%27M16 8a4 4 0 110 8 4 4 0 010-8zm0 10c4.42 0 8 1.79 8 4v2H8v-2c0-2.21 3.58-4 8-4z%27 fill=%27%23ffffff%27/%3E%3C/svg%3E";

/**
 * Virtual friends module
 * Owns the Steam IDs the user tracks manually. They are polled alongside the
 * real friends list, so their name, avatar and status come from Steam like
 * everyone else. Persisted in settings as `virtual_friend_ids`.
 */
class VirtualFriendsManager {
  /**
   * Get the manually tracked Steam IDs
   * @returns {string[]} - Array of Steam IDs
   */
  static getIds() {
    const ids = appStateManager.getState("savedSettings")?.virtual_friend_ids;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id) => Validators.validateSteamId(id));
  }

  /**
   * Merge the manually tracked IDs into a list of friend IDs
   * @param {string[]} friendIds - Steam IDs from the Steam friends list
   * @returns {string[]} - Combined list without duplicates
   */
  static mergeIds(friendIds) {
    const ids = this.getIds();
    if (!ids.length) return friendIds;
    return [...new Set([...(friendIds || []), ...ids])];
  }

  /**
   * Build the list to render: friends in a supported mode, plus every manually
   * tracked ID so it stays visible (and joinable) even while not in casual.
   * @param {import("../shared/types.js").Friend[]} statuses - Fetched statuses
   * @returns {import("../shared/types.js").Friend[]} - Friends to render
   */
  static withVirtualFriends(statuses) {
    const supported = statuses.filter((friend) => friend.in_casual_mode);
    const ids = this.getIds();
    if (!ids.length) return supported;

    const shown = new Set(supported.map((friend) => friend.steamid));
    const byId = new Map(statuses.map((friend) => [friend.steamid, friend]));

    for (const steamid of ids) {
      if (shown.has(steamid)) continue;
      shown.add(steamid);
      supported.push(byId.get(steamid) || this.createPlaceholder(steamid));
    }

    return supported;
  }

  /**
   * Build a stand-in entry for an ID Steam returned no status for
   * @param {string} steamid - Steam ID
   * @returns {import("../shared/types.js").Friend} - Placeholder friend
   */
  static createPlaceholder(steamid) {
    return {
      steamid,
      personaname: steamid,
      status: "",
      in_casual_mode: false,
      join_available: false,
      game_map: "",
      game_score: "",
      game_server_id: "",
      connect: "",
      avatar: PLACEHOLDER_AVATAR,
    };
  }

  /**
   * Persist a manually tracked Steam ID, preserving the rest of the settings
   * @param {string} steamId - SteamID64 to add
   * @returns {Promise<boolean>} - False if the ID was already tracked
   */
  static async addId(steamId) {
    const current = (await window.electronAPI.settings.load()) || {};
    const ids = Array.isArray(current.virtual_friend_ids)
      ? current.virtual_friend_ids
      : [];
    if (ids.includes(steamId)) return false;

    const updated = { ...current, virtual_friend_ids: [...ids, steamId] };
    await window.electronAPI.settings.save(updated);
    appStateManager.setState("savedSettings", updated);
    return true;
  }
}

export default VirtualFriendsManager;
