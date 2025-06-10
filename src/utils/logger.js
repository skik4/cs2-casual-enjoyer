import { LOG_LEVELS, LOG_LEVEL_PRIORITY, LOGGING_CONFIG } from '../shared/constants.js';

/**
 * Simple wrapper around Electron's native logging with level control
 * Provides consistent interface across the application
 */
class Logger {
    constructor() {
        this.isElectronAvailable = typeof window !== 'undefined' && window.electronAPI?.log;
        this.currentLevel = LOGGING_CONFIG.CURRENT_LEVEL;
    }

    /**
     * Set logging level
     * @param {string} level - Logging level (error, warn, info, debug, trace)
     */
    setLevel(level) {
        this.currentLevel = level;
        LOGGING_CONFIG.CURRENT_LEVEL = level;
    }

    /**
     * Check if message should be logged based on current level
     * @param {string} level - Message level
     * @returns {boolean} - True if should log
     */
    shouldLog(level) {
        return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.currentLevel];
    }

    /**
     * Log error message
     * @param {string} context - Context/module name
     * @param {string} message - Error message
     * @param {*} data - Additional data to log
     */
    error(context, message, data = null) {
        if (!this.shouldLog(LOG_LEVELS.ERROR)) return;
        
        if (this.isElectronAvailable) {
            window.electronAPI.log.error(`[${context}] ${message}`, data);
        } else {
            console.error(`[${context}] ${message}`, data);
        }
    }

    /**
     * Log warning message
     * @param {string} context - Context/module name
     * @param {string} message - Warning message
     * @param {*} data - Additional data to log
     */
    warn(context, message, data = null) {
        if (!this.shouldLog(LOG_LEVELS.WARN)) return;
        
        if (this.isElectronAvailable) {
            window.electronAPI.log.warn(`[${context}] ${message}`, data);
        } else {
            console.warn(`[${context}] ${message}`, data);
        }
    }

    /**
     * Log info message
     * @param {string} context - Context/module name
     * @param {string} message - Info message
     * @param {*} data - Additional data to log
     */
    info(context, message, data = null) {
        if (!this.shouldLog(LOG_LEVELS.INFO)) return;
        
        if (this.isElectronAvailable) {
            window.electronAPI.log.info(`[${context}] ${message}`, data);
        } else {
            console.info(`[${context}] ${message}`, data);
        }
    }

    /**
     * Log debug message
     * @param {string} context - Context/module name
     * @param {string} message - Debug message
     * @param {*} data - Additional data to log
     */
    debug(context, message, data = null) {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;
        
        if (this.isElectronAvailable) {
            window.electronAPI.log.debug(`[${context}] ${message}`, data);
        } else {
            console.log(`[DEBUG] [${context}] ${message}`, data);
        }
    }

    /**
     * Log trace message (for detailed debugging, like raw API responses)
     * @param {string} context - Context/module name
     * @param {string} message - Trace message
     * @param {*} data - Additional data to log
     */
    trace(context, message, data = null) {
        if (!this.shouldLog(LOG_LEVELS.TRACE)) return;
        
        if (this.isElectronAvailable) {
            // Electron doesn't have native trace, use debug
            window.electronAPI.log.debug(`[TRACE] [${context}] ${message}`, data);
        } else {
            console.log(`[TRACE] [${context}] ${message}`, data);
        }
    }

    /**
     * Log state changes (controlled by config)
     * @param {string} key - State key
     * @param {*} oldValue - Previous value
     * @param {*} newValue - New value
     */
    logStateChange(key, oldValue, newValue) {
        if (LOGGING_CONFIG.ENABLE_STATE_CHANGE_LOGGING || this.shouldLog(LOG_LEVELS.DEBUG)) {
            this.debug('StateManager', `State change: ${key}`, { oldValue, newValue });
        }
    }
}

// Create singleton instance
const logger = new Logger();

export default logger;