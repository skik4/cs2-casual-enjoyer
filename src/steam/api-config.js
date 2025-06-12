// Shared constants
import { API_CONFIG } from "../shared/constants.js";

// UI and utilities
import Validators from "../utils/validators.js";

/**
 * Configuration manager for Steam API endpoints
 * Responsible only for building URLs and managing endpoint configurations
 */
class SteamAPIConfig {
  /**
   * Get endpoint configuration for a specific method
   * @param {string} method - API method name
   * @param {boolean} isToken - Whether using token or API key
   * @returns {Object} - Endpoint configuration
   */
  static getEndpointConfig(method, isToken) {
    const configs = {
      GetFriendsList: {
        key: {
          endpoint: "/ISteamUser/GetFriendList/v1/",
          params: { relationship: "friend" },
        },
        token: {
          endpoint: "/IFriendsListService/GetFriendsList/v1/",
          params: {},
        },
      },
      GetPlayerSummaries: {
        key: {
          endpoint: "/ISteamUser/GetPlayerSummaries/v2/",
        },
        token: {
          endpoint: "/ISteamUserOAuth/GetUserSummaries/v1/",
        },
      },
      GetPlayerLinkDetails: {
        unified: {
          endpoint: "/IPlayerService/GetPlayerLinkDetails/v1/",
        },
      },
      ResolveVanityURL: {
        unified: {
          endpoint: "/ISteamUser/ResolveVanityURL/v1/",
        },
      },
    };

    const config = configs[method];
    if (!config) {
      throw new Error(`Unknown API method: ${method}`);
    }

    if (config.unified) {
      return config.unified;
    }

    return isToken ? config.token : config.key;
  }

  /**
   * Build complete URL for Steam API request
   * @param {string} method - API method name
   * @param {Object} params - Request parameters
   * @param {string} auth - API key or token
   * @returns {string} - Complete URL
   */
  static buildUrl(method, params, auth) {
    const isToken = Validators.isWebApiToken(auth);
    const endpointConfig = this.getEndpointConfig(method, isToken);

    const url = `${API_CONFIG.STEAM_API_BASE}${endpointConfig.endpoint}`;
    const urlParams = new URLSearchParams();

    // Add authentication
    if (isToken) {
      urlParams.append("access_token", auth);
    } else {
      urlParams.append("key", auth);
    }

    // Add base endpoint parameters
    if (endpointConfig.params) {
      Object.entries(endpointConfig.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          urlParams.append(key, value);
        }
      });
    }

    // Add method-specific parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          urlParams.append(key, value);
        }
      });
    }

    return `${url}?${urlParams.toString()}`;
  }
}

export default SteamAPIConfig;
