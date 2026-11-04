// Shared constants
import { ERROR_CODES } from "../shared/constants.js";

// UI and utilities
import { t } from "../i18n/i18n-manager.js";

/**
 * The text the user reads for each error code
 */
const USER_MESSAGE_KEYS = {
  [ERROR_CODES.PRIVATE_FRIENDS_LIST]: "notifications.privacy.warningMain",
  [ERROR_CODES.EMPTY_FRIENDS_LIST]: "errors.noFriendsFound",
  [ERROR_CODES.TOKEN_REJECTED]: "errors.tokenRejected",
  [ERROR_CODES.KEY_REJECTED]: "errors.keyRejected",
  [ERROR_CODES.RATE_LIMITED]: "errors.rateLimited",
  [ERROR_CODES.STEAM_UNAVAILABLE]: "errors.steamUnavailable",
  [ERROR_CODES.STEAM_ERROR]: "errors.steamError",
  [ERROR_CODES.NETWORK_ERROR]: "errors.noConnection",
};

/**
 * Error handling utilities
 */
class ErrorHandler {
  /**
   * Create a standardized error object
   * @param {string} code - Error code
   * @param {string} [message] - What happened, for the log; the user reads
   *   userMessage instead
   * @param {ErrorOptions} [options] - Passed to the Error, e.g. its cause
   * @returns {Error} - Error object with code property
   */
  static createError(code, message = null, options = undefined) {
    const error = new Error(message || code, options);
    error.code = code;
    return error;
  }

  /**
   * What to tell the user about an error, in the current language. A string
   * is taken as already written for the user. An error is told by its code;
   * one without a known code keeps its own message, for a bug report.
   * @param {Error|string} error - Error to describe
   * @returns {string} - Text for the user
   */
  static userMessage(error) {
    if (typeof error === "string") return error;

    const key = USER_MESSAGE_KEYS[error?.code];
    if (key) return t(key, { status: error.status });

    return t("errors.unexpected", { message: this.formatErrorMessage(error) });
  }

  /**
   * Format error message for display
   * @param {Error|string} error - Error to format
   * @returns {string} - Formatted error message
   */
  static formatErrorMessage(error) {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    return "An unknown error occurred";
  }

  /**
   * Check if error is related to privacy settings
   * @param {Error|string} error - Error to check
   * @returns {boolean} - Whether error is privacy-related
   */
  static isPrivacyError(error) {
    const errorCode = error?.code;
    const errorMessage = this.formatErrorMessage(error);

    return (
      errorCode === ERROR_CODES.PRIVATE_FRIENDS_LIST ||
      errorMessage.toLowerCase().includes("private")
    );
  }
}

export default ErrorHandler;
