// Shared constants
import {
  LOG_LEVELS,
  LOG_LEVEL_PRIORITY,
  LOGGING_CONFIG,
} from "../shared/constants.js";

/**
 * Enhanced Logger with proper Electron DevTools integration
 * Uses native console methods for optimal DevTools experience
 */
class Logger {
  constructor() {
    this.isElectronAvailable =
      typeof window !== "undefined" && window.electronAPI?.log;
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
   * Format timestamp for logs
   * @returns {string} Formatted timestamp
   */
  getTimestamp() {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
  }

  /**
   * Format log message with timestamp and context
   * @param {string} level - Log level
   * @param {string} context - Context/module name
   * @param {string} message - Log message
   * @returns {string} Formatted message
   */
  formatMessage(level, context, message) {
    const timestamp = this.getTimestamp();
    return `[${timestamp}] [${level}] [${context}] ${message}`;
  }

  /**
   * Log error message with stack trace support
   * @param {string} context - Context/module name
   * @param {string} message - Error message
   * @param {*} data - Additional data to log
   */
  error(context, message, data = null) {
    if (!this.shouldLog(LOG_LEVELS.ERROR)) return;

    const formattedMessage = this.formatMessage("ERROR", context, message);

    // Use console.error for proper DevTools error styling and stack traces
    if (data instanceof Error) {
      console.error(formattedMessage, data);
      console.trace("Error stack trace");
    } else if (data) {
      console.error(formattedMessage);
      console.table(data);
    } else {
      console.error(formattedMessage);
    }

    // Send to main process
    if (this.isElectronAvailable) {
      window.electronAPI.log.error(context, message, data);
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

    const formattedMessage = this.formatMessage("WARN", context, message);

    // Use console.warn for proper DevTools warning styling
    console.warn(formattedMessage);
    if (data && typeof data === "object") {
      console.table(data);
    } else if (data) {
      console.warn("Data:", data);
    }

    // Send to main process
    if (this.isElectronAvailable) {
      window.electronAPI.log.warn(context, message, data);
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

    const formattedMessage = this.formatMessage("INFO", context, message);

    // Use console.info for proper DevTools info styling
    console.info(formattedMessage);
    if (data && typeof data === "object") {
      console.table(data);
    } else if (data) {
      console.info("Data:", data);
    }

    // Send to main process
    if (this.isElectronAvailable) {
      window.electronAPI.log.info(context, message, data);
    }
  }

  /**
   * Log debug message with grouping support
   * @param {string} context - Context/module name
   * @param {string} message - Debug message
   * @param {*} data - Additional data to log
   */
  debug(context, message, data = null) {
    if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;

    const formattedMessage = this.formatMessage("DEBUG", context, message);

    // Use console.debug which can be filtered in DevTools
    if (data && typeof data === "object" && Object.keys(data).length > 3) {
      console.groupCollapsed(formattedMessage);
      console.table(data);
      console.groupEnd();
    } else {
      console.debug(formattedMessage);
      if (data) {
        console.debug("Data:", data);
      }
    }

    // Send to main process
    if (this.isElectronAvailable) {
      window.electronAPI.log.debug(context, message, data);
    }
  }

  /**
   * Log trace message with detailed data inspection
   * @param {string} context - Context/module name
   * @param {string} message - Trace message
   * @param {*} data - Additional data to log
   */
  trace(context, message, data = null) {
    if (!this.shouldLog(LOG_LEVELS.TRACE)) return;

    const formattedMessage = this.formatMessage("TRACE", context, message);

    // Use console.trace for stack trace and grouping for large data
    console.groupCollapsed(`🔍 ${formattedMessage}`);
    if (data) {
      if (typeof data === "object") {
        console.table(data);
        console.dir(data, { depth: 3 });
      } else {
        console.log("Data:", data);
      }
    }
    console.trace("Call stack");
    console.groupEnd();

    // Send to main process as debug level
    if (this.isElectronAvailable) {
      window.electronAPI.log.debug(context, `[TRACE] ${message}`, data);
    }
  }

  /**
   * Log state changes with visual grouping
   * @param {string} key - State key
   * @param {*} oldValue - Previous value
   * @param {*} newValue - New value
   */
  logStateChange(key, oldValue, newValue) {
    if (
      LOGGING_CONFIG.ENABLE_STATE_CHANGE_LOGGING ||
      this.shouldLog(LOG_LEVELS.DEBUG)
    ) {
      const timestamp = this.getTimestamp();
      console.groupCollapsed(`🔄 [${timestamp}] State Change: ${key}`);
      console.log("Previous:", oldValue);
      console.log("Current:", newValue);
      if (typeof oldValue === "object" && typeof newValue === "object") {
        console.table({ Previous: oldValue, Current: newValue });
      }
      console.groupEnd();
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
