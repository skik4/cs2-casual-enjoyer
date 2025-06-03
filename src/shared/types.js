/**
 * Type definitions for the application
 * These are used for JSDoc type annotations
 */

/**
 * @typedef {Object} Friend
 * @property {string} steamid - Steam ID of the friend
 * @property {string} personaname - Display name
 * @property {string} status - Game status text
 * @property {boolean} in_casual_mode - Whether friend is in supported mode (casual or deathmatch)
 * @property {boolean} join_available - Whether join is available
 * @property {string} game_map - Current map
 * @property {string} game_score - Current score
 * @property {string} game_server_id - Game server ID
 * @property {string} connect - Connect string
 * @property {string} avatar - Avatar URL
 */

/**
 * @typedef {Object} JoinState
 * @property {string} status - Join status (waiting|connecting|joined|cancelled|missing)
 * @property {boolean} cancelled - Whether the join was cancelled
 * @property {number|null} interval - Interval ID for join loop
 * @property {string} [personaname] - Cached friend name
 * @property {string} [avatar] - Cached friend avatar
 */

/**
 * @typedef {Object} AppSettings
 * @property {string} steam_id - User's Steam ID
 * @property {string} auth - API key or token
 * @property {string[]} friends_ids - Array of friend Steam IDs
 */

/**
 * @typedef {Object} TokenInfo
 * @property {string} steamid - Steam ID from token
 * @property {number} expires - Expiration timestamp
 * @property {Date} expiresDate - Expiration date object
 */

export {}; // Make this a module 