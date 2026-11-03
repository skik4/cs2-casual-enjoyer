/**
 * Application constants
 */

export const API_CONFIG = {
  STEAM_API_BASE: "https://api.steampowered.com",
  AUTO_REFRESH_INTERVAL_MS: 3000,
  // The first refresh of a run starts this long after the saved credentials
  // check out at startup. No reason for the wait is recorded.
  AUTO_REFRESH_START_MS: 500,
  JOIN_LOOP_INTERVAL_MS: 200,
  JOIN_RETRY_INTERVAL_MS: 400,
  MISSING_TIMEOUT_MS: 60000,
  JOIN_SUCCESS_DISPLAY_MS: 1500,
  CS2_LAUNCH_TIMEOUT_MS: 180000,
  // After a launch, Steam is asked this often whether CS2 reached the lobby.
  // CS2 posts reaching the menu the moment it happens, so this is only the
  // fallback while GSI is not delivering
  CS2_LOBBY_POLL_MS: 3000,
  // How long a map load reported by GSI after a connect holds off further
  // connects while Steam catches up with the user's new server
  JOIN_GSI_CONFIRM_MS: 15000,
  // A request that hangs would hold up the join loop or the map refresh
  // until the connection broke. Steam answers in well under a second, so
  // this only ends a stuck request, which then counts as a failed one.
  REQUEST_TIMEOUT_MS: 10000,
};

/**
 * Join journal: what happens during join attempts, written to a local file
 */
export const JOIN_JOURNAL_CONFIG = {
  FILE_NAME: "join-journal.log",
  // A bigger file is renamed to <name>.old, replacing the previous one
  MAX_BYTES: 5 * 1024 * 1024,
  FLUSH_MS: 1000,
  // CS2's states are kept this long after an attempt ends, to see the join land
  TRAIL_MS: 60000,
  MAX_LINES_PER_APPEND: 500,
  MAX_LINE_LENGTH: 8 * 1024,
};

export const GSI_CONFIG = {
  SERVICE_NAME: "Casual Enjoyer",
  CFG_FILE_NAME: "gamestate_integration_casualenjoyer.cfg",
  HOST: "127.0.0.1",
  DEFAULT_PORT: 47731,
  // Ports tried after the stored or default one is taken
  PORT_ATTEMPTS: 10,
  HEARTBEAT_S: 5,
  // CS2 posts at least once per heartbeat, so a state older than three of
  // them means it stopped posting (closed, crashed or stuck loading)
  FRESH_MS: 15000,
  MAX_BODY_BYTES: 256 * 1024,
};

/**
 * Outcome of setting GSI up in the main process
 */
export const GSI_SETUP = {
  READY: "ready",
  CS2_NOT_FOUND: "cs2-not-found",
  ERROR: "error",
};

/**
 * Steam account type of game servers that log on anonymously. Valve's own
 * matchmaking servers do, and so do community servers run without a login
 * token; community servers that use one are type 3.
 */
export const ANON_GAME_SERVER_ACCOUNT_TYPE = 4;

export const MAP_FINDER_CONFIG = {
  REFRESH_INTERVAL_MS: 30000,
  // At 100 ids per request this caps one refresh at 30 requests
  MAX_IDS_PER_REFRESH: 3000,
  FOF_REFRESH_MS: 24 * 60 * 60 * 1000,
  // A crawl that could read not one list - a wrong key, every list private,
  // Steam refusing - is tried again after this long, not on the next
  // refresh: that cost a request per friend every 30 seconds for as long as
  // the finder ran. A new key is tried at once.
  FOF_RETRY_MS: 60 * 60 * 1000,
  FOF_MAX_IDS: 5000,
  FOF_REQUEST_DELAY_MS: 250,
  POOL_MAX: 5000,
  POOL_TTL_MS: 14 * 24 * 60 * 60 * 1000,
  // Friends of pool players kept to poll; the newest lists push out the
  // oldest. At 100 ids a request, one pass over them is 200 requests,
  // spread over the refreshes.
  POOL_FRIENDS_MAX_IDS: 20000,
  // The store is written this long after the last change, not on every
  // refresh
  SAVE_DEBOUNCE_MS: 2000,
};

/**
 * Join ids that are not a friend's SteamID64: a whole map, or one server
 */
export const JOIN_TARGET_PREFIXES = {
  MAP: "map-",
  SERVER: "srv-",
  MAPS: "maps-",
};

/**
 * Join id of the attempt on any of the pinned maps
 */
export const PINNED_MAPS_JOIN_ID = `${JOIN_TARGET_PREFIXES.MAPS}pinned`;

export const WINDOW_CONFIG = {
  WIDTH: 850,
  HEIGHT: 900,
  MIN_WIDTH: 850,
  MIN_HEIGHT: 800,
};

export const STATUS_TYPES = {
  WAITING: "waiting",
  CONNECTING: "connecting",
  JOINED: "joined",
  CANCELLED: "cancelled",
  MISSING: "missing",
};

export const ERROR_CODES = {
  PRIVATE_FRIENDS_LIST: "PRIVATE_FRIENDS_LIST",
  EMPTY_FRIENDS_LIST: "EMPTY_FRIENDS_LIST",
  API_ERROR_403: "API_ERROR_403",
  API_ERROR_401: "API_ERROR_401",
};

export const VALIDATION_PATTERNS = {
  STEAM_ID: /^\d{17}$/,
  API_KEY: /^[A-Z0-9]{32}$/i,
  WEB_API_TOKEN: /^[\w-]+\.[\w-]+\.[\w-]+$/,
  // A single +gcconnect token: no whitespace, quotes, percent escapes or
  // further commands can ride along into the CS2 launch arguments
  GC_CONNECT: /^\+gcconnect[A-Za-z0-9:_-]{1,64}$/,
};

export const LOG_LEVELS = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
  TRACE: "trace",
};

// Logging levels by priority (higher number means more logs)
export const LOG_LEVEL_PRIORITY = {
  [LOG_LEVELS.ERROR]: 0,
  [LOG_LEVELS.WARN]: 1,
  [LOG_LEVELS.INFO]: 2,
  [LOG_LEVELS.DEBUG]: 3,
  [LOG_LEVELS.TRACE]: 4,
};

export const LOGGING_CONFIG = {
  // Settings for different types of logs
  ENABLE_STATE_CHANGE_LOGGING: false, // Enabled only in DEBUG/TRACE

  // The one knob: raised by hand for a debug build
  CURRENT_LEVEL: LOG_LEVELS.INFO,
};

export const GAME_MODES = {
  CASUAL: "casual",
  DEATHMATCH: "deathmatch",
};

/**
 * Modes a join may pull the user out of. A running match in any other mode -
 * Competitive, Premier, Wingman ("scrimcomp2v2"), "rush", workshop maps
 * ("custom") or one not seen yet - is left alone, unless it is offline
 * training. Steam was seen naming all of these but deathmatch.
 */
export const INTERRUPTIBLE_MODES = [GAME_MODES.CASUAL, GAME_MODES.DEATHMATCH];

/**
 * Rounds a side needs to win a casual match. The join journal saw matches
 * end at 8:2 and after round 15; the server then loads its next map under
 * the same server id.
 */
export const CASUAL_ROUNDS_TO_WIN = 8;

/**
 * Tutorial mock friend data for demonstration purposes
 * Based on real Steam API response data
 */
export const TUTORIAL_MOCK_FRIEND = {
  steamid: "76561197960287930",
  personaname: "Rabscuttle",
  avatar:
    "https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426.jpg",
  avatarmedium:
    "https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_medium.jpg",
  avatarfull:
    "https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg",
  avatarhash: "c5d56249ee5d28a07db4ac9f7f60af961fab5426",
  profileurl: "https://steamcommunity.com/id/GabeLoganNewell/",
  communityvisibilitystate: 2,
  profilestate: 1,
  personastate: 0,
  status: "Casual Dust2 [ 7 : 0 ]",
  game_map: "de_dust2",
  game_score: "[ 7 : 0 ]",
  in_casual_mode: true,
  join_available: true,
};
