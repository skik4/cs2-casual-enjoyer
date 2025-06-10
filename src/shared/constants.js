/**
 * Application constants
 */

export const API_CONFIG = {
    STEAM_API_BASE: "https://api.steampowered.com",
    AUTO_REFRESH_INTERVAL_MS: 3000,
    JOIN_LOOP_INTERVAL_MS: 500,
    MISSING_TIMEOUT_MS: 60000,
    JOIN_SUCCESS_DISPLAY_MS: 1500
};

export const WINDOW_CONFIG = {
    WIDTH: 850,
    HEIGHT: 900,
    MIN_WIDTH: 850,
    MIN_HEIGHT: 800
};

export const STATUS_TYPES = {
    WAITING: 'waiting',
    CONNECTING: 'connecting',
    JOINED: 'joined',
    CANCELLED: 'cancelled',
    MISSING: 'missing'
};

export const ERROR_CODES = {
    PRIVATE_FRIENDS_LIST: 'PRIVATE_FRIENDS_LIST',
    EMPTY_FRIENDS_LIST: 'EMPTY_FRIENDS_LIST',
    API_ERROR_403: 'API_ERROR_403',
    API_ERROR_401: 'API_ERROR_401'
};

export const VALIDATION_PATTERNS = {
    STEAM_ID: /^\d{17}$/,
    API_KEY: /^[A-Z0-9]{32}$/i,
    WEB_API_TOKEN: /^[\w-]+\.[\w-]+\.[\w-]+$/
};

export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn', 
    INFO: 'info',
    DEBUG: 'debug',
    TRACE: 'trace'
};

// Logging levels by priority (higher number means more logs)
export const LOG_LEVEL_PRIORITY = {
    [LOG_LEVELS.ERROR]: 0,
    [LOG_LEVELS.WARN]: 1,
    [LOG_LEVELS.INFO]: 2,
    [LOG_LEVELS.DEBUG]: 3,
    [LOG_LEVELS.TRACE]: 4
};

export const LOGGING_CONFIG = {
    // Default mode (production)
    DEFAULT_LEVEL: LOG_LEVELS.INFO,    // Maximum number of logs in memory
    MAX_LOG_ENTRIES: 1000,
    
    // Settings for different types of logs
    ENABLE_STATE_CHANGE_LOGGING: false,  // Enabled only in DEBUG/TRACE
    
    // Global variable for switching level through console
    CURRENT_LEVEL: LOG_LEVELS.INFO
};

/**
 * Tutorial mock friend data for demonstration purposes
 * Based on real Steam API response data
 */
export const TUTORIAL_MOCK_FRIEND = {
    steamid: '76561197960287930',
    personaname: 'Rabscuttle',
    avatar: 'https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426.jpg',
    avatarmedium: 'https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_medium.jpg',
    avatarfull: 'https://avatars.steamstatic.com/c5d56249ee5d28a07db4ac9f7f60af961fab5426_full.jpg',
    avatarhash: 'c5d56249ee5d28a07db4ac9f7f60af961fab5426',
    profileurl: 'https://steamcommunity.com/id/GabeLoganNewell/',
    communityvisibilitystate: 2,
    profilestate: 1,
    personastate: 0,
    status: 'Casual Dust2 [ 7 : 0 ]',
    in_casual_mode: true,
    join_available: true
};
