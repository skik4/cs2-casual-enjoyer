/**
 * Pure HTTP client for Steam API
 * Responsible only for making HTTP requests
 */
class SteamAPIHttpClient {
  /**
   * Make a generic HTTP request
   * @param {string} url - Full URL with parameters
   * @param {Object} options - Request options
   * @returns {Promise<Response>} - Raw HTTP response
   */
  static async makeRequest(url, options = {}) {
    try {
      return await fetch(url, {
        method: "GET",
        ...options,
      });
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
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
