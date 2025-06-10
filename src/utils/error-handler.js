// Shared constants
import { ERROR_CODES } from '../shared/constants.js';

/**
 * Error handling utilities
 */
class ErrorHandler {
    /**
     * Create a standardized error object
     * @param {string} code - Error code
     * @param {string} [message] - Custom error message
     * @returns {Error} - Error object with code property
     */
    static createError(code, message = null) {
        const error = new Error(message || this.getErrorMessage(code));
        error.code = code;
        return error;
    }

    /**
     * Get user-friendly error message for error code
     * @param {string} code - Error code
     * @returns {string} - User-friendly message
     */
    static getErrorMessage(code) {
        const messages = {
            [ERROR_CODES.PRIVATE_FRIENDS_LIST]: "Your friends list is private. Please make it public in your Steam privacy settings.",
            [ERROR_CODES.EMPTY_FRIENDS_LIST]: "No friends found in your friends list.",
            [ERROR_CODES.API_ERROR_403]: "Access forbidden. Please check your API key permissions.",
            [ERROR_CODES.API_ERROR_401]: "Unauthorized. Please check your API key or token."
        };

        return messages[code] || `An error occurred (${code})`;
    }

    /**
     * Log error with context
     * @param {string} context - Context where error occurred
     * @param {Error|string} error - Error to log
     * @param {Object} [additionalData] - Additional data to log
     */
    static logError(context, error, additionalData = {}) {
        const errorMessage = error instanceof Error ? error.message : error;
        const logData = {
            context,
            error: errorMessage,
            timestamp: new Date().toISOString(),
            ...additionalData
        };

        console.error(`[${context}]`, errorMessage, additionalData);
    }

    /**
     * Format error message for display
     * @param {Error|string} error - Error to format
     * @returns {string} - Formatted error message
     */
    static formatErrorMessage(error) {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        return 'An unknown error occurred';
    }

    /**
     * Check if error is related to privacy settings
     * @param {Error|string} error - Error to check
     * @returns {boolean} - Whether error is privacy-related
     */
    static isPrivacyError(error) {
        const errorCode = error?.code;
        const errorMessage = this.formatErrorMessage(error);
        
        return errorCode === ERROR_CODES.PRIVATE_FRIENDS_LIST || 
               errorMessage.toLowerCase().includes('private');
    }
}

export default ErrorHandler; 