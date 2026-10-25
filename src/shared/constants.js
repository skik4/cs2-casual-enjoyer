/**
 * Application constants
 */

export const API_CONFIG = {
  STEAM_API_BASE: "https://api.steampowered.com",
  AUTO_REFRESH_INTERVAL_MS: 3000,
  JOIN_LOOP_INTERVAL_MS: 200,
  JOIN_RETRY_INTERVAL_MS: 400,
  MISSING_TIMEOUT_MS: 60000,
  JOIN_SUCCESS_DISPLAY_MS: 1500,
  CS2_LAUNCH_TIMEOUT_MS: 180000,
  // How long a map load reported by GSI after a connect holds off further
  // connects while Steam catches up with the user's new server
  JOIN_GSI_CONFIRM_MS: 15000,
  // A game server keeps its address for life; one Steam lists no address
  // for may be too new to be listed, so it is asked about again sooner
  SERVER_ADDRESS_TTL_MS: 30 * 60 * 1000,
  NO_SERVER_ADDRESS_TTL_MS: 60 * 1000,
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

/**
 * Valve's matchmaking servers sit behind its relay network, so Steam lists
 * them at an address in this block (100.64.0.0/10). Community servers have a
 * public address or none.
 */
export const VALVE_SERVER_NETWORK = { BASE: "100.64.0.0", PREFIX_LENGTH: 10 };

export const MAP_FINDER_CONFIG = {
  REFRESH_INTERVAL_MS: 30000,
  // At 100 ids per request this caps one refresh at 30 requests
  MAX_IDS_PER_REFRESH: 3000,
  FOF_REFRESH_MS: 24 * 60 * 60 * 1000,
  FOF_MAX_IDS: 5000,
  FOF_REQUEST_DELAY_MS: 250,
  POOL_MAX: 5000,
  POOL_TTL_MS: 14 * 24 * 60 * 60 * 1000,
};

/**
 * Join ids that are not a friend's SteamID64: a whole map, or one server
 */
export const JOIN_TARGET_PREFIXES = {
  MAP: "map-",
  SERVER: "srv-",
};

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
  // Default mode (production)
  DEFAULT_LEVEL: LOG_LEVELS.INFO, // Maximum number of logs in memory
  MAX_LOG_ENTRIES: 1000,

  // Settings for different types of logs
  ENABLE_STATE_CHANGE_LOGGING: false, // Enabled only in DEBUG/TRACE

  // Global variable for switching level through console
  CURRENT_LEVEL: LOG_LEVELS.INFO,
};

export const GAME_MODES = {
  CASUAL: "casual",
  COMPETITIVE: "competitive",
  PREMIER: "premier",
};

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
  in_casual_mode: true,
  join_available: true,
};
