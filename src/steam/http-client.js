// Shared constants
import { API_CONFIG, ERROR_CODES } from "../shared/constants.js";

/**
 * A signal that gives up on a request after API_CONFIG.REQUEST_TIMEOUT_MS,
 * joined with the caller's own signal, if any
 * @param {AbortSignal|undefined} signal - The caller's signal
 * @returns {AbortSignal|undefined}
 */
function withTimeout(signal) {
  if (typeof AbortSignal?.timeout !== "function") return signal;
  const timeout = AbortSignal.timeout(API_CONFIG.REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, timeout])
    : signal;
}

/**
 * Pure HTTP client for Steam API
 * Responsible only for making HTTP requests
 */
class SteamAPIHttpClient {
  /**
   * Make a generic HTTP request. One that takes too long fails like any
   * other failed request.
   * @param {string} url - Full URL with parameters
   * @param {Object} options - Request options
   * @returns {Promise<Response>} - Raw HTTP response
   */
  static async makeRequest(url, options = {}) {
    try {
      return await fetch(url, {
        method: "GET",
        ...options,
        signal: withTimeout(options.signal),
      });
    } catch (error) {
      // Keep a deliberate cancellation recognisable, and preserve the
      // original error as the cause so DNS/TLS/offline stay distinguishable.
      if (error?.name === "AbortError") throw error;
      const failure = new Error(`HTTP request failed: ${error.message}`, {
        cause: error,
      });
      failure.code = ERROR_CODES.NETWORK_ERROR;
      throw failure;
    }
  }

  /**
   * Parse JSON response
   * @param {Response} response - HTTP response
   * @returns {Promise<Object>} - Parsed JSON data
   */
  static async parseJsonResponse(response) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }
}

export default SteamAPIHttpClient;
