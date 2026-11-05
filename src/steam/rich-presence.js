// Shared constants
import {
  ANON_GAME_SERVER_ACCOUNT_TYPE,
  CASUAL_ROUNDS_TO_WIN,
  GAME_MODES,
  INTERRUPTIBLE_MODES,
  VALIDATION_PATTERNS,
} from "../shared/constants.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * The rich presence rules: what Steam's rich presence says about a player's
 * game, read into the facts the join loop, the map finder and the friends
 * list act on. These are the rules tuned from live joins and the join
 * journal; they take the parsed key-value string, or the private data it
 * comes in, and answer one question each.
 */

/**
 * Parse Rich Presence data from Steam
 * @param {string} kv - Key-value string from Steam rich presence
 * @returns {Object} - Parsed rich presence fields
 */
export function parseRichPresence(kv) {
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
    xptrail: extract("game:xptrail"),
    qmmflags: extract("game:qmmflags"),
  };
}

/**
 * Whether rich presence shows a sign that the player has Prime. Steam never
 * says so outright, but two things only a Prime account can show do:
 * - an XP trail level of 1 or more (game:xptrail). Valve's FAQ makes XP
 *   Prime-only, and CS2's own files call this value the XP trail level;
 *   that reading of the name is ours, not Valve's.
 * - a Premier match, which needs Prime. CS2 reports it as competitive with
 *   game:qmmflags 1, the only flagged mode in Steam's rich presence
 *   localization for CS2.
 * No sign proves nothing: a Prime player with no recent XP shows none.
 * @param {Object} richPresence - Parsed rich presence data
 * @returns {boolean}
 */
export function hasPrimeSign(richPresence) {
  return (
    Number(richPresence?.xptrail) >= 1 ||
    (richPresence?.game_mode === GAME_MODES.COMPETITIVE &&
      richPresence?.qmmflags === "1")
  );
}

/**
 * Rich presence reduced to a string that changes whenever any of its values
 * does, whatever order Steam lists them in - except the join token in
 * connect. CS2 hands out a new token as players arrive and leave, the
 * user's own arrival included, and in live joins a new token alone never
 * meant a slot the user could take. A connect showing up or going away
 * still counts.
 * @param {string|null|undefined} kv - Key-value string from Steam rich presence
 * @returns {string}
 */
export function richPresenceKey(kv) {
  const pairs = [];
  for (const match of String(kv ?? "").matchAll(/"([^"]*)"\s+"([^"]*)"/g)) {
    const value =
      match[1] === "connect" ? connectKind(match[2]) : match[2];
    pairs.push(`${match[1]}=${value}`);
  }
  return pairs.sort().join("\n");
}

/**
 * A connect string without its join token: what it joins (a server, a
 * lobby or a local server) but not the token that comes with it
 * @param {string|null|undefined} connect - E.g. "+gcconnect0A1B2C3D..."
 * @returns {string|null} - E.g. "+gcconnect", or null without a connect
 */
export function connectKind(connect) {
  if (!connect) return null;
  return String(connect).replace(/^(\+gcconnect[GL]?)[0-9A-F]+$/i, "$1");
}

/**
 * Check that a rich presence connect string is a bare +gcconnect token.
 * The value is written by the other player's client and becomes CS2 launch
 * arguments via steam://rungame, so anything else in it (spaces, encoded
 * characters, extra +commands) must never reach the game.
 * @param {*} connect - Connect value from rich presence
 * @returns {boolean} - True if the connect string is safe to launch with
 */
export function isValidConnect(connect) {
  return (
    typeof connect === "string" && VALIDATION_PATTERNS.GC_CONNECT.test(connect)
  );
}

/**
 * Check if player is in CS2 based on game_id
 * @param {Object} privateData - Player's private data
 * @returns {boolean} - True if player is in CS2
 */
export function isInCS2(privateData) {
  return privateData?.game_id === "730";
}

/**
 * Check if player is in a casual match, not in the lobby
 * @param {Object} richPresence - Parsed rich presence data
 * @returns {boolean} - True if in supported mode
 */
export function isInSupportedMode(richPresence) {
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
export function isJoinAvailable(richPresence) {
  return (
    isInSupportedMode(richPresence) &&
    isValidConnect(richPresence.connect)
  );
}

/**
 * Whether a game runs offline: training against bots or on a workshop map
 * @param {Object} richPresence - Parsed rich presence data
 * @returns {boolean}
 */
export function isOffline(richPresence) {
  return richPresence?.game_server === "offline";
}

/**
 * Check if the player is in a match a join must not pull them out of: a
 * running match in any mode but casual and deathmatch, unless it is
 * offline training
 * @param {Object} privateData - Private data from Steam API response
 * @returns {boolean} - True if such a match is running (not the lobby)
 */
export function isInProtectedMatch(privateData) {
  if (!privateData) return false;

  const richPresence = parseRichPresence(privateData.rich_presence_kv);
  // In the lobby the mode may only be what is picked in the play menu, so it
  // counts only once a match is actually running
  const running = !["", null, "lobby"].includes(richPresence.game_state);
  const isProtected =
    running &&
    !INTERRUPTIBLE_MODES.includes(richPresence.game_mode) &&
    !isOffline(richPresence);

  logger.debug("RichPresence", "Checking for a match not to leave", {
    game_mode: richPresence.game_mode,
    game_state: richPresence.game_state,
    game_server: richPresence.game_server,
    isProtected,
  });

  return isProtected;
}

/**
 * Whether rich presence describes a casual match on one of Valve's own
 * servers: "kv", a map CS2 knows and an anonymous server account. Community
 * servers seen so far gave themselves away by a workshop or renamed map, an
 * addon, "community" instead of "kv", or a login token's server account.
 * One run without a login token on a stock map would still pass. Steam's
 * server addresses no longer help: since late October 2026 it lists none
 * for any anonymous server, Valve's included.
 * @param {Object} richPresence - Parsed rich presence data
 * @param {string|null} [serverId] - Game server Steam ID, when rich
 *   presence does not carry it
 * @returns {boolean} - True for an official server
 */
export function isOfficialServer(
  richPresence,
  serverId = richPresence?.game_server_steam_id
) {
  return (
    richPresence?.game_server === "kv" &&
    typeof richPresence.steam_display === "string" &&
    richPresence.steam_display.startsWith("#display_GameKnownMap") &&
    !richPresence.addon &&
    isAnonymousGameServer(serverId)
  );
}

/**
 * Whether a game server Steam ID belongs to an anonymous game server
 * @param {string|null} serverId - Game server Steam ID
 * @returns {boolean}
 */
export function isAnonymousGameServer(serverId) {
  try {
    return (
      Number((BigInt(serverId) >> 52n) & 0xfn) === ANON_GAME_SERVER_ACCOUNT_TYPE
    );
  } catch {
    return false;
  }
}

/**
 * Rounds played according to a rich presence score such as "[ 3 : 1 ]"
 * @param {string|null} score - game:score value
 * @returns {number|null} - Rounds played, or null when there is no score
 */
export function parseRoundsPlayed(score) {
  const match = String(score ?? "").match(/(\d+)\s*:\s*(\d+)/);
  return match ? Number(match[1]) + Number(match[2]) : null;
}

/**
 * Whether a rich presence score is the final one of a casual match
 * @param {string|null} score - game:score value, such as "[ 8 : 2 ]"
 * @returns {boolean}
 */
export function isMatchOver(score) {
  const match = String(score ?? "").match(/(\d+)\s*:\s*(\d+)/);
  return Boolean(
    match &&
      Math.max(Number(match[1]), Number(match[2])) >= CASUAL_ROUNDS_TO_WIN
  );
}
