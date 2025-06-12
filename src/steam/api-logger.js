// Steam modules
import SteamAPIUtils from "./steam-api-utils.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * Request/Response logger for Steam API
 * Responsible only for logging API requests and responses
 */
class SteamAPILogger {
  /**
   * Log API request
   * @param {string} method - API method name
   * @param {string} url - Request URL
   * @param {Object} context - Additional context
   */
  static logRequest(method, url, context = {}) {
    const maskedUrl = SteamAPIUtils.maskAuthInUrl(url);

    logger.info("SteamAPI", `Making ${method} request`, {
      ...context,
      endpoint: this._extractEndpoint(url),
    });

    logger.trace("SteamAPI", `Request URL: ${maskedUrl}`);
  }

  /**
   * Log API response
   * @param {string} method - API method name
   * @param {Object} data - Response data
   * @param {string} url - Request URL
   */
  static logResponse(method, data, url) {
    const maskedUrl = SteamAPIUtils.maskAuthInUrl(url);

    logger.trace("SteamAPI", `Raw ${method} response`, {
      url: maskedUrl,
      response: data,
    });
  }

  /**
   * Log API error
   * @param {string} method - API method name
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  static logError(method, error, context = {}) {
    logger.error("SteamAPI", `${method} error: ${error.message}`, {
      ...context,
      error,
    });
  }

  /**
   * Log HTTP error
   * @param {string} method - API method name
   * @param {number} status - HTTP status code
   * @param {string} statusText - HTTP status text
   * @param {Object} context - Additional context
   */
  static logHttpError(method, status, statusText, context = {}) {
    const logLevel = status >= 500 ? "error" : "warn";

    logger[logLevel](
      "SteamAPI",
      `${method} request failed with status ${status}`,
      {
        ...context,
        status,
        statusText,
      }
    );
  }

  /**
   * Extract endpoint from URL for logging
   * @param {string} url - Full URL
   * @returns {string} - Endpoint path
   * @private
   */
  static _extractEndpoint(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return "unknown";
    }
  }
}

export default SteamAPILogger;
