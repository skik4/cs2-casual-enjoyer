/**
 * Type definitions for the application
 * These are used for JSDoc type annotations
 */

/**
 * @typedef {Object} Friend
 * @property {string} steamid - Steam ID of the friend
 * @property {string} personaname - Display name
 * @property {string} status - Game status text
 * @property {boolean} in_casual_mode - Whether friend is in a casual match
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
 */

/**
 * @typedef {Object} PlayerJoinInfo
 * @property {string} personaname - Display name
 * @property {boolean} inCS2 - Whether the player is in CS2
 * @property {boolean} inCompetitiveOrPremier - Whether the player is in a Competitive or Premier match
 * @property {boolean} inSupportedMode - Whether the player is in a casual match
 * @property {string|null} connect - Validated connect string, null when there is none to use
 * @property {string|null} serverId - Game server Steam ID
 */

/**
 * @typedef {PlayerJoinInfo & {
 *   steamid: string|null,
 *   mode: string|null,
 *   map: string|null,
 *   score: string|null,
 *   official: boolean,
 * }} PlayerPresence - Join facts plus where the match is played; `official`
 *   is true for a casual match on Valve's own servers. processPresenceResponse
 *   judges by rich presence alone, getPresence also by the server's address.
 */

/**
 * @typedef {Object} MapServer
 * @property {string} serverId - Game server Steam ID
 * @property {string} map - Map code, e.g. de_dust2
 * @property {string|null} score - Score as rich presence shows it
 * @property {number|null} rounds - Rounds played, null when unknown
 * @property {boolean} freeSlot - Whether a known player offers a connect
 * @property {Array<{steamid: string, personaname: string, connect: string|null}>} players - Known players on it
 */

/**
 * @typedef {Object} JoinTarget
 * @property {string|null} personaname - Name shown for the attempt
 * @property {boolean} inSupportedMode - Whether there is anything to join right now
 * @property {string|null} connect - Connect string to join with
 * @property {string|null} joinAs - SteamID64 the connect string belongs to
 * @property {Function} isJoined - Tells from the user's info whether the join succeeded
 */

/**
 * @typedef {Object} JoinSnapshot
 * @property {PlayerJoinInfo|null} user - The user, null when Steam could not be asked
 * @property {PlayerJoinInfo|null} friend - The friend, null when Steam could not be asked
 */

/**
 * @typedef {Object} GsiUserState
 * @property {string|null} steamId - Account CS2 runs on (provider.steamid)
 * @property {boolean} inMatch - On a server with a map loaded
 * @property {boolean} inMenu - In the main menu, not on a server
 * @property {string|null} mode - Game mode of the match (casual, competitive, ...)
 * @property {string|null} mapName - Map of the match
 * @property {string|null} phase - Match phase (warmup, live, intermission, gameover)
 * @property {string|null} activity - Player activity (menu, playing, textinput)
 * @property {boolean} inCompetitiveOrPremier - Whether a Competitive or Premier match is running
 * @property {number} mapLoadedAt - When CS2 first reported the current map (ms), 0 if never
 */

/**
 * @typedef {Object} GsiSetupStatus
 * @property {string} setup - ready, cs2-not-found or error (GSI_SETUP)
 * @property {number} [port] - Port the GSI endpoint listens on
 * @property {string} [cfgPath] - Where the gamestate_integration cfg was written
 * @property {boolean} [changed] - The cfg was written this run, so a CS2 that
 *   is already running needs a restart to pick it up
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
