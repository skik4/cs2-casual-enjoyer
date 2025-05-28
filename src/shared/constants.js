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

// Уровни логирования по приоритету (чем больше число, тем больше логов)
export const LOG_LEVEL_PRIORITY = {
    [LOG_LEVELS.ERROR]: 0,
    [LOG_LEVELS.WARN]: 1,
    [LOG_LEVELS.INFO]: 2,
    [LOG_LEVELS.DEBUG]: 3,
    [LOG_LEVELS.TRACE]: 4
};

export const LOGGING_CONFIG = {
    // Режим по умолчанию (production)
    DEFAULT_LEVEL: LOG_LEVELS.INFO,
    
    // Максимальное количество логов в памяти
    MAX_LOG_ENTRIES: 1000,
    
    // Настройки для разных типов логов
    ENABLE_API_RESPONSE_LOGGING: false,  // Включается только в DEBUG/TRACE
    ENABLE_FRIEND_FILTERING_LOGGING: false,  // Включается только в DEBUG/TRACE
    ENABLE_STATE_CHANGE_LOGGING: false,  // Включается только в DEBUG/TRACE
    
    // Глобальная переменная для переключения уровня через консоль
    CURRENT_LEVEL: LOG_LEVELS.INFO
}; 